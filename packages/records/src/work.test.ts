import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkJournal, WorkDeferred, RequestFailure, type WorkSpec } from "./work";
import { recordsAdapters } from "./factory";
import { CONNECTOR_CAPABILITIES, ROLE_FAMILIES } from "./capabilities";

let directory: string;
const opened: WorkJournal[] = [];
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "records-work-")); });
afterEach(async () => { for (const db of opened.splice(0)) db.close(); await rm(directory, { recursive: true, force: true }); });
const spec: WorkSpec = { key: "job", kind: "request", scope: "candidate:source", payload: { url: "https://example.gov/data?api_key=secret", token: "secret" } };
const open = (options: ConstructorParameters<typeof WorkJournal>[1] = {}) => { const journal = new WorkJournal(directory, options); opened.push(journal); return journal; };

describe("durable recovery", () => {
  it("persists logical work and successful checkpoints without metadata credentials", async () => {
    const journal = open();
    expect(await journal.run(spec, async () => ({ snapshotId: "abc" }))).toEqual({ snapshotId: "abc" });
    const second = open();
    const fn = vi.fn();
    expect(await second.run(spec, fn, { reuse: true })).toEqual({ snapshotId: "abc" });
    expect(fn).not.toHaveBeenCalled();
    expect(JSON.stringify(second.rows().map((r) => r.payload))).not.toContain("secret");
    expect(second.counts("candidate")).toMatchObject({ discovered: 1, fetched: 1, remaining: 0 });
  });

  it("atomically claims work across connections, recovers expired leases, rejects stale commits", () => {
    let now = 1000;
    const first = open({ now: () => now, leaseMs: 100 });
    const second = open({ now: () => now, leaseMs: 100 });
    const old = first.claim(spec);
    expect(() => second.claim(spec)).toThrow(WorkDeferred);
    now += 101;
    const current = second.claim(spec);
    expect(() => first.finish(spec.key, old, "succeeded", "stale")).toThrow("Stale");
    second.finish(spec.key, current, "succeeded", "Recovered");
    expect(first.get(spec.key)?.attempts).toBe(2);
  });

  it("persists Retry-After and blocks early retries, then resumes after due time", async () => {
    let now = 1000;
    const journal = open({ now: () => now });
    await expect(journal.run(spec, async () => { throw new RequestFailure("HTTP 429", 429, 60_000); })).rejects.toThrow("429");
    expect(journal.get(spec.key)).toMatchObject({ state: "retry_wait", nextAt: 61_000 });
    await expect(journal.run(spec, async () => "too early")).rejects.toThrow(WorkDeferred);
    now = 61_001;
    expect(await journal.run(spec, async () => "recovered")).toBe("recovered");
  });

  it("keeps denied and missing resources explicit until operator-authorized retry", async () => {
    const journal = open();
    for (const status of [403, 404]) {
      const task = { ...spec, key: String(status) };
      await expect(journal.run(task, async () => { throw new RequestFailure(`HTTP ${status}`, status); })).rejects.toThrow(String(status));
      await expect(journal.run(task, async () => "must not fetch")).rejects.toThrow(WorkDeferred);
    }
    expect(journal.counts()).toMatchObject({ blocked: 1, missing: 1, remaining: 2 });
    expect(journal.retry(["blocked"])).toBe(1);
    expect(journal.get("403")?.state).toBe("pending");
    expect(() => journal.retry(["running"])).toThrow("Cannot reset");
  });

  it("registers complete backlogs atomically and does not conflate fetched tasks with unknown inventories", () => {
    const journal = open();
    journal.registerAll([1, 2, 3].map((n) => ({ ...spec, key: String(n) })));
    journal.note({ ...spec, key: "unknown-role", kind: "coverage" }, "blocked", "No verified inventory");
    journal.cached({ ...spec, key: "1" }, { snapshotId: "verified" });
    expect(journal.counts()).toMatchObject({ discovered: 4, fetched: 1, pending: 2, blocked: 1, remaining: 3, inventoryUnknown: 1 });
    expect(() => journal.register({ ...spec, key: "1", payload: { url: "different" } })).toThrow("different logical input");
  });

  it("requires capability declarations for every registered connector and retains uncovered ballot roles", () => {
    expect(recordsAdapters.map((a) => a.kind).sort()).toEqual(Object.keys(CONNECTOR_CAPABILITIES).sort());
    for (const role of ["county_constable", "appraisal_district_director", "tx_sboe", "tx_land_commissioner", "school_board", "finance", "propositions"]) expect(role in ROLE_FAMILIES).toBe(true);
  });
});
