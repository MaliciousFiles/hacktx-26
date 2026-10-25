import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateResearchRequest } from "@ftb/types";
import { SnapshotClient } from "../fetch";
import { dateWindow } from "../model";
import { createOfficialMinutesAdapter } from "./official-minutes";

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

describe("official minutes adapter", () => {
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
