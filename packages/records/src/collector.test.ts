import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateResearchRequest, OfficialAction } from "@ftb/types";
import { RecordsCollector } from "./collector";
import type { AdapterContext, RecordsAdapter } from "./adapters";
import { SnapshotClient } from "./fetch";
import { provenance } from "./model";

let directory: string;
beforeEach(async () => {
  const root = join(tmpdir(), "opencode");
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(join(root, "records-collector-test-"));
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

const request: CandidateResearchRequest = {
  candidate: { id: "fixture-person", name: "Fixture Person" },
  position: { office: "county_commissioner", jurisdiction: "fixture/county" },
  month: 11, year: 2026,
};
function testAdapter(overrides: Partial<OfficialAction> = {}): RecordsAdapter {
  return {
    kind: "fixture", async collect({ request, client }) {
      const source = await client.get(`https://example.gov/${request.candidate.id}.json`, { format: "json" });
      return { status: "complete", reason: "Fixture source only", actions: [{
        id: "fixture-action", actorId: request.candidate.id, issueIds: [], role: "Fixture board",
        type: "board_vote", stance: "yes", date: "2026-10-10", title: "Fixture motion",
        officialText: "Fixture motion", sourceUrl: source.sourceUrl, extraction: "json",
        provenance: [provenance(source, "fixture@1", "/motion")], ...overrides,
      }] };
    },
  };
}
function collector(adapters = [testAdapter()]) {
  return new RecordsCollector({
    client: new SnapshotClient({ directory, intervalMs: 0, fetch: vi.fn<typeof fetch>().mockImplementation(async () => new Response('{"motion":"Fixture motion"}')) }),
    adapters,
  });
}
const plan = { sources: [{ id: "fixture-source", adapter: "fixture", config: {} }] };

describe("candidate collection", () => {
  it("recovers a per-document backlog without reparsing successful siblings", async () => {
    let failed = false;
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("sitemap")) return new Response('<urlset><url><loc>https://www.govinfo.gov/app/details/CREC-2026-10-01</loc></url><url><loc>https://www.govinfo.gov/app/details/CREC-2026-10-02</loc></url></urlset>');
      if (url.includes("10-01") && !failed) { failed = true; return new Response("temporary failure", { status: 500 }); }
      return new Response("<mods>Published record</mods>");
    });
    const client = new SnapshotClient({ directory, recovery: true, intervalMs: 0, retries: 0, fetch });
    const collect = vi.fn(async (ctx: AdapterContext, config: unknown) => {
      const url = (config as { urls: string[] }).urls[0];
      await ctx.client.get(url, { format: "xml", root: "mods" });
      return { actions: [], status: "complete" as const, reason: "Parsed configured document" };
    });
    const service = new RecordsCollector({ client, adapters: [{ kind: "fixture", collect }] });
    const discoveredPlan = { exhaustive: true, since: "2026-10-01", sources: [{ id: "record", adapter: "fixture", config: {}, discovery: { kind: "govinfo-record" as const, years: [2026] } }] };
    const first = await service.collect(request, discoveredPlan);
    expect(first.coverage[0].status).toBe("partial");
    expect(collect).toHaveBeenCalledTimes(2);
    client.workJournal!.retry(["retry_wait"]);
    const second = await service.collect(request, discoveredPlan);
    expect(second.coverage[0].status).toBe("complete");
    expect(collect).toHaveBeenCalledTimes(3); // Completed sibling replayed with restored provenance.
    expect(second.snapshots).toHaveLength(3);
    expect(second.recovery!.counts.inventoryUnknown).toBeGreaterThan(0); // Role coverage still unknown.
  });
  it("preserves review-only context documents without inventing actions and rejects other-candidate context", async () => {
    const adapter = (candidateId: string): RecordsAdapter => ({
      kind: "context", async collect({ client }) {
        const snapshot = await client.get("https://example.gov/context", { format: "json" });
        return { actions: [], status: "partial", reason: "Context only", documents: [{
          id: "doc", candidateId, title: "Office report", sourceUrl: snapshot.sourceUrl,
          sourceFamily: "Office", relationship: "office_context", date: null, dateBasis: "unknown",
          textBasis: "native", snapshotId: snapshot.id, contentHash: snapshot.contentHash, reviewRequired: true,
        }] };
      },
    });
    const contextPlan = { sources: [{ id: "context", adapter: "context", config: {} }] };
    const result = await collector([adapter(request.candidate.id)]).collect(request, contextPlan);
    expect(result.actions).toEqual([]);
    expect(result.documents).toHaveLength(1);
    const wrong = await collector([adapter("someone-else")]).collect(request, contextPlan);
    expect(wrong.documents).toBeUndefined();
    expect(wrong.coverage[0].status).toBe("unavailable");
  });
  it("returns scoped provenance and an explicit date interval", async () => {
    const result = await collector().collect(request, plan);
    expect(result.actions).toHaveLength(1);
    expect(result.snapshots).toHaveLength(1);
    expect(result.snapshots[0]).not.toHaveProperty("text");
    expect(result.coverage[0]).toMatchObject({ status: "complete", before: "2026-11-01", actionCount: 1 });
  });
  it("distinguishes unimplemented offices from successful empty queries", async () => {
    const result = await collector().collect(request, { sources: [] });
    expect(result.actions).toEqual([]);
    expect(result.coverage[0].status).toBe("not_implemented");
    const missing = await collector().collect(request, { sources: [{ id: "future", adapter: "unbuilt", config: {} }] });
    expect(missing.coverage[0].status).toBe("not_implemented");
  });
  it("does not leak the previous candidate's inventory when reusing a client", async () => {
    const service = collector();
    const first = await service.collect(request, plan);
    const second = await service.collect({ ...request, candidate: { id: "other-person", name: "Another Person" } }, plan);
    expect(second.snapshots).toHaveLength(1);
    expect(second.snapshots[0].sourceUrl).not.toBe(first.snapshots[0].sourceUrl);
  });
  it("withholds wrong-candidate, missing-provenance and unapproved manual actions", async () => {
    for (const invalid of [{ actorId: "other-person" }, { provenance: [] }, { extraction: "manual" as const }]) {
      const result = await collector([testAdapter(invalid)]).collect(request, plan);
      expect(result.actions).toEqual([]);
      expect(result.coverage[0].status).toBe("unavailable");
    }
  });
  it("withholds HTML/PDF actions whose provenance is not an HTML/PDF snapshot", async () => {
    for (const extraction of ["html", "pdf"] as const) {
      const result = await collector([testAdapter({ extraction })]).collect(request, plan);
      expect(result.actions).toEqual([]);
      expect(result.coverage[0].status).toBe("unavailable");
    }
  });
  it("accepts an HTML-extracted action that also carries a supporting proof of another format", async () => {
    const adapter: RecordsAdapter = {
      kind: "mixed", async collect({ request, client }) {
        const page = await client.get("https://example.gov/catalog", { format: "html" });
        const data = await client.get("https://example.gov/data.json", { format: "json" });
        return { status: "complete", reason: "Catalog row plus supporting JSON", actions: [{
          id: "mixed-action", actorId: request.candidate.id, issueIds: [], role: "Fixture board",
          type: "executive_order", stance: "n/a", date: "2026-10-10", title: "Order", officialText: "Order",
          sourceUrl: page.sourceUrl, extraction: "html",
          provenance: [provenance(page, "mixed@1", "/row"), provenance(data, "mixed@1", "/order")],
        }] };
      },
    };
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (input) =>
      new Response(String(input).endsWith(".json") ? '{"order":1}' : "<html><body><p>Catalog</p></body></html>"));
    const service = new RecordsCollector({ client: new SnapshotClient({ directory, intervalMs: 0, fetch }), adapters: [adapter] });
    const result = await service.collect(request, { sources: [{ id: "mixed", adapter: "mixed", config: {} }] });
    expect(result.coverage[0].status).toBe("complete");
    expect(result.actions).toHaveLength(1);
  });
  it("independently filters future actions and deduplicates repeated source events", async () => {
    const future = await collector([testAdapter({ date: "2026-11-10" })]).collect(request, plan);
    expect(future.actions).toEqual([]);
    const dedup = await collector().collect(request, { sources: [...plan.sources, { ...plan.sources[0], id: "same-source" }] });
    expect(dedup.actions).toHaveLength(1);
  });
  it("withholds conflicting duplicates instead of choosing the flattering record", async () => {
    const disagree = testAdapter({ stance: "no" }); disagree.kind = "disagree";
    const result = await collector([testAdapter(), disagree]).collect(request, {
      sources: [...plan.sources, { id: "disagree", adapter: "disagree", config: {} }],
    });
    expect(result.actions).toEqual([]);
    expect(result.coverage.at(-1)).toMatchObject({ source: "deduplication", status: "partial" });
  });
  it("hard-blocks all sources after a conflicting or ambiguous identity", async () => {
    const adapter = testAdapter(); const collect = vi.spyOn(adapter, "collect");
    const service = new RecordsCollector({
      client: new SnapshotClient({ directory }), adapters: [adapter], resolvers: {
        official: async (request) => ({ status: "conflict", request, evidence: [], reason: "ID identifies someone else" }),
      },
    });
    const result = await service.collect(request, { ...plan, identity: { provider: "official" } });
    expect(collect).not.toHaveBeenCalled();
    expect(result.coverage[0]).toMatchObject({ status: "needs_review" });
    expect(result.coverage[1]?.reason).toMatch(/conflicting\/ambiguous identity/i);
  });

  it("skips only bioguide-bound adapters when identity is unresolved; name sources continue", async () => {
    const nameAdapter = testAdapter();
    const houseAdapter: RecordsAdapter = {
      kind: "house-clerk",
      collect: vi.fn(async () => ({ status: "complete" as const, reason: "should not run", actions: [] })),
    };
    const service = new RecordsCollector({
      client: new SnapshotClient({
        directory,
        intervalMs: 0,
        fetch: vi.fn<typeof fetch>().mockImplementation(async () => new Response('{"motion":"Fixture motion"}')),
      }),
      adapters: [nameAdapter, houseAdapter],
      resolvers: {
        house: async (request) => ({
          status: "unresolved",
          request,
          evidence: [],
          reason: "No Congress.gov match",
        }),
      },
    });
    const result = await service.collect(request, {
      identity: { provider: "house" },
      sources: [
        { id: "house-rolls", adapter: "house-clerk", config: {} },
        { id: "house-rolls-2", adapter: "house-clerk", config: {} },
        { id: "house-rolls-3", adapter: "house-clerk", config: {} },
        { id: "local-votes", adapter: "fixture", config: {} },
      ],
    });
    expect(houseAdapter.collect).not.toHaveBeenCalled();
    expect(result.actions).toHaveLength(1);
    const bound = result.coverage.filter((row) => row.source.startsWith("house"));
    expect(bound).toHaveLength(1);
    expect(bound[0]).toMatchObject({ source: "house-clerk", status: "needs_review", actionCount: 0 });
    expect(bound[0].reason).toMatch(/bioguide unresolved: not a member of Congress/i);
    expect(bound[0].reason).toMatch(/3 planned source\(s\) skipped \(house-rolls … house-rolls-3\)/);
    expect(result.coverage.find((row) => row.source === "local-votes")?.status).toBe("complete");
  });
  it("skips yearly congressional sources outside verified service years with one explicit row", async () => {
    const houseAdapter: RecordsAdapter = { kind: "house-clerk", collect: vi.fn(async () => ({ status: "complete" as const, reason: "ran", actions: [] })) };
    const service = new RecordsCollector({
      client: new SnapshotClient({ directory, intervalMs: 0, fetch: vi.fn<typeof fetch>() }),
      adapters: [houseAdapter],
      resolvers: { house: async (request) => ({ status: "resolved", request, evidence: [], reason: "ok", terms: [{ chamber: "house", startYear: 2023 }] }) },
    });
    const yearly = (year: number) => ({ id: `house-clerk-${year}`, adapter: "house-clerk", config: {}, discovery: { kind: "house-clerk-rolls" as const, year, fromRoll: 1, toRoll: 2 } });
    const result = await service.collect({ ...request, year: 2026 }, { since: "2021-01-01", identity: { provider: "house" }, sources: [2021, 2022, 2023, 2024].map(yearly) });
    expect(houseAdapter.collect).toHaveBeenCalledTimes(2);
    const skipped = result.coverage.filter((row) => row.source === "house-clerk:outside-service");
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ status: "complete", actionCount: 0 });
    expect(skipped[0].reason).toMatch(/2023-present.*2 yearly source\(s\) \(house-clerk-2021 … house-clerk-2022\)/);
    expect(result.coverage.map((row) => row.source)).toEqual(expect.arrayContaining(["house-clerk-2023", "house-clerk-2024"]));
  });
  it("isolates source errors and strips secrets from diagnostics", async () => {
    const error: RecordsAdapter = { kind: "error", collect: async () => { throw new Error("HTTP 500 https://example.gov/?api_key=secret"); } };
    const result = await collector([testAdapter(), error]).collect(request, {
      sources: [{ id: "error", adapter: "error", config: {} }, ...plan.sources],
    });
    expect(result.actions).toHaveLength(1);
    expect(result.coverage[0].reason).not.toContain("secret");
  });
  it("rejects malformed or duplicate plans before contacting sources", async () => {
    await expect(collector().collect(request, { sources: [...plan.sources, ...plan.sources] })).rejects.toThrow("Duplicate source IDs");
  });

  it("can be configured once and called with only the per-candidate request", async () => {
    const service = new RecordsCollector({
      client: new SnapshotClient({ directory, intervalMs: 0, fetch: vi.fn<typeof fetch>().mockImplementation(async () => new Response("{}")) }),
      adapters: [testAdapter()], plan,
    });
    expect((await service.collect(request)).actions).toHaveLength(1);
  });

  it("discovers official source URLs and preserves partial caps on offline replay", async () => {
    const network = vi.fn<typeof fetch>().mockImplementation(async (url) => new Response(
      String(url).includes("/sitemap/")
        ? '<urlset><url><loc>https://www.govinfo.gov/app/details/CREC-2025-07-23</loc></url><url><loc>https://www.govinfo.gov/app/details/CREC-2025-07-24</loc></url></urlset>'
        : "<mods><motion>Fixture motion</motion></mods>",
    ));
    const adapter: RecordsAdapter = { kind: "fixture", async collect(context, config) {
      const urls = (config as { urls: string[] }).urls;
      expect(urls).toEqual(["https://www.govinfo.gov/metadata/pkg/CREC-2025-07-23/mods.xml"]);
      const snapshot = await context.client.get(urls[0], { format: "xml", root: "mods" });
      return { status: "complete", reason: "Fixture parsed", actions: [{
        id: "discovered-action", actorId: context.request.candidate.id, issueIds: [], role: "Fixture board",
        type: "board_vote", stance: "yes", date: "2025-07-23", title: "Fixture motion", officialText: "Fixture motion",
        extraction: "xml", sourceUrl: snapshot.sourceUrl, provenance: [provenance(snapshot, "fixture@1", "/mods/motion")],
      }] };
    } };
    const discoveryPlan = { sources: [{ ...plan.sources[0], discovery: { kind: "govinfo-record" as const, years: [2025], maxDocuments: 1 } }] };
    const first = await new RecordsCollector({
      client: new SnapshotClient({ directory, intervalMs: 0, fetch: network }), adapters: [adapter],
    }).collect(request, discoveryPlan);
    const replay = await new RecordsCollector({
      client: new SnapshotClient({ directory, mode: "offline", fetch: network }), adapters: [adapter],
    }).collect(request, discoveryPlan);
    expect(first.actions).toHaveLength(1);
    expect(first.coverage[0].status).toBe("partial");
    expect(first.snapshots).toHaveLength(2); // index plus immutable source document
    expect(replay).toEqual(first);
    expect(network).toHaveBeenCalledTimes(2);
  });
});
