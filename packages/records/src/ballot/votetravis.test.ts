import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateResearchRequest } from "@ftb/types";
import { SnapshotClient } from "../fetch";
import { dateWindow } from "../model";
import { voteTravisAdapter } from "./votetravis";

let directory: string;
beforeEach(async () => {
  const root = join(tmpdir(), "opencode");
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(join(root, "ballot-"));
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe("VoteTravis ballot reference", () => {
  it("emits no OfficialAction and keeps style ownership with the ballot pipeline", async () => {
    const html = `<!DOCTYPE html><html><body>
      <h1>Sample Ballot</h1>
      <p>United States Senator</p>
      <p>Proposition A</p>
    </body></html>`;
    const client = new SnapshotClient({
      directory, intervalMs: 0,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(html)),
    });
    const request: CandidateResearchRequest = {
      candidate: { id: "c1", name: "Casey" },
      position: { office: "us_senate", jurisdiction: "tx" },
      month: 11, year: 2026,
    };
    const result = await voteTravisAdapter.collect(
      { request, window: dateWindow(request), client },
      { urls: ["https://votetravis.gov/sample-ballot"] },
    );
    expect(result.actions).toEqual([]);
    expect(result.status).toBe("complete");
    expect(result.reason).toMatch(/style must remain official\/manual/i);
    expect(result.reason).toMatch(/United States Senator/);
  });
});
