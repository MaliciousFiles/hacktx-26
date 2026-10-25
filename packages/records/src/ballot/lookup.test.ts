import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SnapshotClient } from "../fetch";
import { lookupTravisDistricts } from "./lookup";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ballot-lookup-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const row = (id: number, split = "100.1") => ({
  attributes: {
    OBJECTID: id,
    Address: "100 W EXAMPLE ST",
    City: "AUSTIN",
    ZIP: 78705,
    Precinct: 100,
    Split: split,
    Congressional: "G01",
  },
});

describe("private local address-index matching", () => {
  it("paginates the whole ZIP, normalizes street tokens locally, and never returns an invented style or address", async () => {
    const network = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ features: [row(1)], exceededTransferLimit: true }))
      .mockResolvedValueOnce(Response.json({ features: [row(2)], exceededTransferLimit: false }));
    const client = new SnapshotClient({ directory, intervalMs: 0, fetch: network });
    const result = await lookupTravisDistricts("100 West Example Street. Austin, TX 78705", {
      client,
    });
    expect(result.status).toBe("districts_resolved");
    expect(result.checkedRows).toBe(2);
    expect(result.ballotStyleId).toBeNull();
    expect(result.districts?.Split).toBe("100.1");
    expect(JSON.stringify(result)).not.toContain("EXAMPLE");
    for (const [url] of network.mock.calls) {
      expect(new URL(String(url)).searchParams.get("where")).toBe("ZIP = 78705");
      expect(decodeURIComponent(String(url))).not.toMatch(/EXAMPLE|100 West/i);
    }
    const offline = new SnapshotClient({ directory, mode: "offline", fetch: network });
    expect(
      await lookupTravisDistricts("100 W Example St, Austin, TX 78705", { client: offline }),
    ).toEqual(result);
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("abstains on conflicting district matches and refuses truncated/repeated pages", async () => {
    const network = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ features: [row(1), row(2, "100.2")] }));
    const result = await lookupTravisDistricts("100 W Example St, Austin, TX 78705", {
      client: new SnapshotClient({ directory, intervalMs: 0, fetch: network }),
    });
    expect(result.status).toBe("ambiguous");
    expect(result.districts).toBeUndefined();
    const paged = new SnapshotClient({
      directory: join(directory, "paged"),
      intervalMs: 0,
      fetch: async () => Response.json({ features: [row(1)], exceededTransferLimit: true }),
    });
    await expect(
      lookupTravisDistricts("100 W Example St, Austin, TX 78705", { client: paged, maxPages: 1 }),
    ).rejects.toThrow("budget");
    await expect(
      lookupTravisDistricts("100 W Example St, Austin, TX 78705", { client: paged }),
    ).rejects.toThrow("repeated");
  });

  it("does not send malformed addresses to a service or leak them into errors", async () => {
    const network = vi.fn<typeof fetch>();
    const client = new SnapshotClient({ directory, fetch: network });
    await expect(
      lookupTravisDistricts("private input without a ZIP", { client }),
    ).rejects.not.toThrow("private input");
    expect(network).not.toHaveBeenCalled();
  });
});
