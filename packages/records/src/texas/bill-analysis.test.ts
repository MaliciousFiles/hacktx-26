import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateResearchRequest } from "@ftb/types";
import { SnapshotClient } from "../fetch";
import { dateWindow } from "../model";
import { tloBillAnalysisAdapter } from "./bill-analysis";

let directory: string;
beforeEach(async () => {
  const root = join(tmpdir(), "opencode");
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(join(root, "bill-analysis-"));
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

const request: CandidateResearchRequest = {
  candidate: { id: "rep-a", name: "Alex Alpha" },
  position: { office: "tx_house", jurisdiction: "us/tx" },
  month: 11, year: 2026,
};
const html = `<!DOCTYPE html><html><body><h1>BILL ANALYSIS</h1>
<p>H.B. 5</p><p>By: Beta</p>
<p>${"This bill would change school finance formulas in several ways. ".repeat(3)}</p></body></html>`;

function run(memberName: string) {
  const client = new SnapshotClient({ directory, intervalMs: 0, fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(html)) });
  return tloBillAnalysisAdapter.collect({ request, window: dateWindow(request), client }, {
    urls: ["https://capitol.texas.gov/tlodocs/89R/analysis/html/HB00005H.htm"],
    role: "Texas House", bill: "HB 5", analysisDate: "2025-03-01", memberCandidateId: "rep-a", memberName,
  });
}

describe("TLO bill analysis", () => {
  it("never attributes someone else's bill to the configured candidate", async () => {
    const result = await run("Alpha");
    expect(result.actions).toEqual([]);
    expect(result.status).toBe("needs_review");
  });

  it("is unscored context when the printed author matches, not a second authorship event", async () => {
    const result = await run("Beta");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]!.stance).toBe("n/a");
  });
});
