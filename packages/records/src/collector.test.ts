import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateResearchRequest, OfficialAction } from "@ftb/types";
import { RecordsCollector } from "./collector";
import type { RecordsAdapter } from "./adapters";
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
        { id: "local-votes", adapter: "fixture", config: {} },
      ],
    });
    expect(houseAdapter.collect).not.toHaveBeenCalled();
    expect(result.actions).toHaveLength(1);
    expect(result.coverage.find((row) => row.source === "house-rolls")?.reason).toMatch(/bioguide identity was not resolved/i);
    expect(result.coverage.find((row) => row.source === "local-votes")?.status).toBe("complete");
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
