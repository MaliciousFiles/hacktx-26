import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateResearchRequest } from "@ftb/types";
import { SnapshotClient } from "../fetch";
import { dateWindow } from "../model";
import { createOfficialMinutesAdapter } from "./official-minutes";
import { rulesExtractVotes } from "../extract";

let directory: string;
beforeEach(async () => {
  const root = join(tmpdir(), "opencode");
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(join(root, "minutes-"));
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

const request: CandidateResearchRequest = {
  candidate: { id: "r1", name: "Alex Rivera" },
  position: { office: "school_board", jurisdiction: "tx/rrisd" },
  month: 11, year: 2026,
};

describe("deterministic minutes rules", () => {
  it("doesn't mark a vote as consent because of a neighboring item's heading", () => {
    const text = "Consent Agenda\nItems approved.\n\n7. Motion to adopt the tax rate\nRivera - Yes\n";
    expect(rulesExtractVotes({ schemaId: "t", sourceText: text, instruction: "", memberLabels: ["Rivera"] }).votes[0]?.consent).toBeUndefined();
  });

  it("keeps 'Surname, Initial' names intact and maps repeated names to their own span", () => {
    const text = "Motion to approve\nAyes: Bell, C.; Bell, K.\nNays: Lee\n";
    const votes = rulesExtractVotes({ schemaId: "t", sourceText: text, instruction: "", memberLabels: ["Bell, K."] }).votes;
    expect(votes.map((vote) => vote.member.value)).toEqual(["Bell, K."]);
    expect(text.slice(votes[0]!.member.start, votes[0]!.member.end)).toBe("Bell, K.");
    expect(rulesExtractVotes({ schemaId: "t", sourceText: text, instruction: "", memberLabels: ["Bell"] }).votes).toEqual([]);
  });
});

describe("official minutes adapter", () => {
  it("doesn't date a meeting from 'approval of the minutes of' another meeting", async () => {
    const html = `<!DOCTYPE html><html><body>
      <p>Approval of the minutes of May 3, 2024</p>
      <p>Motion to approve the budget</p>
      <p>Rivera - Yes</p>
    </body></html>`;
    const client = new SnapshotClient({ directory, intervalMs: 0, fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(html)) });
    const result = await createOfficialMinutesAdapter({ id: "mock", extract: vi.fn() }).collect(
      { request, window: dateWindow(request), client },
      { urls: ["https://go.boarddocs.com/tx/rrisd/Board.nsf/undated"], role: "RRISD Trustee", body: "RRISD", memberLabels: ["Rivera"], memberCandidateId: "r1", enableLlmFallback: false },
    );
    expect(result.actions).toEqual([]);
    expect(result.status).toBe("needs_review");
  });

  it("attributes deterministic Name - Yes rows without calling LLM", async () => {
    const html = `<!DOCTYPE html><html><body>
      <p>Board Meeting April 2, 2025</p>
      <p>Motion to approve the budget</p>
      <p>Rivera - Yes</p>
      <p>Lee - No</p>
    </body></html>`;
    const llm = { id: "mock", extract: vi.fn() };
    const client = new SnapshotClient({
      directory, intervalMs: 0,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(html)),
    });
    const result = await createOfficialMinutesAdapter(llm).collect(
      { request, window: dateWindow(request), client },
      {
        urls: ["https://go.boarddocs.com/tx/rrisd/Board.nsf/fixture"],
        role: "RRISD Trustee",
        body: "Round Rock ISD Board of Trustees",
        memberLabels: ["Rivera"],
        memberCandidateId: "r1",
        allowedHostSuffixes: ["boarddocs.com"],
      },
    );
    expect(llm.extract).not.toHaveBeenCalled();
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      stance: "yes", extraction: "html", date: "2025-04-02",
    });
    expect(result.actions[0].provenance?.[0].adapter).toBe("official-minutes/v1");
  });

  it("rejects reused memberCandidateId", async () => {
    const result = await createOfficialMinutesAdapter().collect(
      { request, window: dateWindow(request), client: new SnapshotClient({ directory, mode: "offline" }) },
      {
        urls: ["https://example.school.org/minutes.pdf"],
        role: "Trustee",
        body: "Board",
        memberLabels: ["Rivera"],
        memberCandidateId: "other",
      },
    );
    expect(result.status).toBe("needs_review");
    expect(result.actions).toEqual([]);
  });
});
