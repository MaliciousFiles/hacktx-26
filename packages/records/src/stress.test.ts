import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateResearchRequest } from "@ftb/types";
import type { AdapterContext } from "./adapters";
import { RecordsCollector } from "./collector";
import { SnapshotClient } from "./fetch";
import { WorkJournal } from "./work";

let directory: string;
beforeEach(async () => {
  const root = join(tmpdir(), "opencode");
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(join(root, "records-stress-"));
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

const person = (n: number): CandidateResearchRequest => ({
  candidate: { id: `person-${n}`, name: `Person ${n}` },
  position: { office: "county_commissioner", jurisdiction: "fixture/county" }, month: 11, year: 2026,
});
const DOCS = 60;
const sitemap = `<urlset>${Array.from({ length: DOCS }, (_, i) => `<url><loc>https://www.govinfo.gov/app/details/CREC-2026-10-${String(i + 1).padStart(2, "0")}</loc></url>`).join("")}</urlset>`;

describe("durable journal under long, concurrent runs", () => {
  it("keeps per-document checkpoints O(document), not O(candidate), across concurrent forked clients", async () => {
    // Regression: each child checkpoint used to embed every snapshot the client had ever seen. Over thousands of
    // House roll calls that produced a 24 GB work.sqlite and a fatal crash.
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) =>
      new Response(String(input).includes("sitemap") ? sitemap : `<mods>${"x".repeat(2000)}</mods>`));
    const client = new SnapshotClient({ directory, recovery: true, intervalMs: 0, retries: 0, fetch });
    const collect = vi.fn(async (ctx: AdapterContext, config: unknown) => {
      await ctx.client.get((config as { urls: string[] }).urls[0], { format: "xml", root: "mods" });
      return { actions: [], status: "complete" as const, reason: "Parsed configured document" };
    });
    const service = new RecordsCollector({ client, adapters: [{ kind: "fixture", collect }] });
    const plan = { exhaustive: true, since: "2026-10-01", sources: [{ id: "record", adapter: "fixture", config: {}, discovery: { kind: "govinfo-record" as const, years: [2026] } }] };

    const results = await Promise.all(Array.from({ length: 8 }, (_, n) => service.collect(person(n), plan)));
    expect(results.every((r) => r.coverage.find((c) => c.source === "record")?.status === "complete")).toBe(true);
    expect(collect).toHaveBeenCalledTimes(8 * DOCS);

    const journal = new WorkJournal(join(directory, "work"));
    try {
      expect(journal.counts().running).toBe(0);
      const children = journal.rows().filter((row) => row.scope.endsWith(":documents"));
      expect(children).toHaveLength(8 * DOCS);
      for (const child of children) {
        const checkpoint = child.result as { snapshots: unknown[] };
        expect(checkpoint.snapshots.length).toBeLessThanOrEqual(1);
      }
      for (const row of journal.rows().filter((r) => r.kind === "source" && !r.scope.endsWith(":documents"))) {
        // the source-level checkpoint lists only what this source touched (sitemap + documents), once
        expect((row.result as { snapshots: unknown[] } | undefined)?.snapshots.length ?? 0).toBeLessThanOrEqual(DOCS + 2);
      }
    } finally { journal.close(); }
    const size = (await stat(join(directory, "work", "work.sqlite"))).size + (await stat(join(directory, "work", "work.sqlite-wal")).catch(() => ({ size: 0 }))).size;
    expect(size).toBeLessThan(40_000_000);
  }, 60_000);

  it("never crashes the process when the heartbeat cannot write (closed or failing database)", async () => {
    const journal = new WorkJournal(directory, { leaseMs: 30 });
    const spec = { key: "k", kind: "request" as const, scope: "s", payload: {} };
    const unhandled = vi.fn();
    process.once("uncaughtException", unhandled);
    await expect(journal.run(spec, async () => {
      journal.close(); // heartbeats keep firing against a closed handle
      await new Promise((resolve) => setTimeout(resolve, 80));
      return 1;
    })).rejects.toThrow();
    process.off("uncaughtException", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("aggregates counts in SQL without parsing stored checkpoints", () => {
    const journal = new WorkJournal(directory);
    try {
      journal.registerAll([1, 2, 3].map((n) => ({ key: String(n), kind: "source" as const, scope: "c:s", payload: { n } })));
      journal.cached({ key: "1", kind: "source", scope: "c:s", payload: { n: 1 } }, { huge: "x".repeat(10_000) });
      journal.cached({ key: "1", kind: "source", scope: "c:s", payload: { n: 1 } }, { huge: "x".repeat(10_000) });
      const spy = vi.spyOn(journal, "get");
      expect(journal.counts("c")).toMatchObject({ discovered: 3, succeeded: 1, pending: 2, remaining: 2 });
      expect(spy).not.toHaveBeenCalled();
      // identical cache confirmations do not append a transition each time
      expect(journal.rows("c").length).toBe(3);
    } finally { journal.close(); }
  });
});
