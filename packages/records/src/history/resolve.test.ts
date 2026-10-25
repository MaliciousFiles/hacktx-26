import { describe, expect, it } from "vitest";
import type { SnapshotClient } from "../fetch";
import { suggestBioguide } from "./resolve";

const request = {
  candidate: { id: "c1", name: "Greg Casar" },
  position: { office: "us_house", jurisdiction: "us/tx", district: "35" },
  month: 11,
  year: 2026,
} as const;

function jsonSnapshot(sourceUrl: string, body: unknown) {
  const text = JSON.stringify(body);
  return {
    id: "a".repeat(64),
    sourceUrl,
    contentHash: "b".repeat(64),
    fetchedAt: "2026-01-01T00:00:00.000Z",
    format: "json" as const,
    text,
  };
}

describe("suggestBioguide", () => {
  it("uses documented /member/{state}/{district} then detail verify", async () => {
    const client = {
      async get(url: string) {
        if (url.includes("/member/TX/35")) {
          return jsonSnapshot(url, {
            members: [{ bioguideId: "C001131", name: "Casar, Greg", state: "Texas" }],
          });
        }
        if (url.includes("/member/C001131")) {
          return jsonSnapshot(url, {
            member: {
              bioguideId: "C001131",
              firstName: "Greg",
              lastName: "Casar",
              directOrderName: "Greg Casar",
              invertedOrderName: "Casar, Greg",
              state: "Texas",
              terms: { item: [{ stateCode: "TX", chamber: "House of Representatives", startYear: 2023 }] },
            },
          });
        }
        throw new Error(`unexpected url ${url}`);
      },
    } as unknown as SnapshotClient;

    const result = await suggestBioguide(request, { apiKey: "test-key", state: "TX", client });
    expect(result.bioguide).toBe("C001131");
    expect(result.reason).toMatch(/\/member\/TX\/35/);
  });

  it("fails closed when district filter is ambiguous", async () => {
    const client = {
      async get(url: string) {
        if (url.includes("/member/TX/35")) {
          return jsonSnapshot(url, {
            members: [
              { bioguideId: "A000001", name: "Casar, Greg", state: "Texas" },
              { bioguideId: "A000002", name: "Casar, Greg", state: "Texas" },
            ],
          });
        }
        throw new Error(`unexpected url ${url}`);
      },
    } as unknown as SnapshotClient;

    const result = await suggestBioguide(request, { apiKey: "test-key", state: "TX", client });
    expect(result.bioguide).toBeUndefined();
    expect(result.reason).toMatch(/no identity was selected|ambiguous/i);
  });
});
