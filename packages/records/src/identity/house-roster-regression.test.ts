import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { CandidateResearchRequest } from "@ftb/types";
import { describe, expect, it, vi } from "vitest";
import { HOUSE_ROSTER_URL, parseHouseRoster, resolveHouseMember } from "./index";
import type { IdentitySnapshotClient } from "./index";

const text = readFileSync(new URL("./fixtures/member-data-119.xml", import.meta.url), "utf8");

function cachedRosterClient() {
  return {
    get: vi.fn(async () => ({
      id: "official-clerk-119-excerpt",
      sourceUrl: HOUSE_ROSTER_URL,
      fetchedAt: "2026-10-24T18:20:07.889Z",
      contentHash: createHash("sha256").update(text).digest("hex"),
      format: "xml" as const,
      text,
    })),
  } satisfies IdentitySnapshotClient;
}

const request: CandidateResearchRequest = {
  candidate: { id: "example-casar", name: "Greg Casar" },
  position: { office: "us_house", jurisdiction: "us/tx", district: "37" },
  month: 11,
  year: 2026,
};

describe("official current House roster regression", () => {
  it("accepts the Clerk's American Samoa AQ00 code alongside postal state AS", () => {
    const parsed = parseHouseRoster(text);
    expect(parsed.congress).toBe(119);
    expect(parsed.members).toHaveLength(2);
    expect(parsed.members[0]).toMatchObject({
      bioguideId: "R000600",
      officialName: "Aumua Amata Coleman Radewagen",
      state: "AS",
      stateDistrict: "AQ00",
      district: "Delegate",
    });
    expect(parsed.members[1]).toMatchObject({
      bioguideId: "C001131",
      state: "TX",
      stateDistrict: "TX35",
      district: "35th",
    });
    expect(JSON.stringify(parsed)).not.toContain('"party"');
  });

  it("resolves Greg Casar without a key despite the territory code and election district 37", async () => {
    const client = cachedRosterClient();
    const result = await resolveHouseMember(request, client, { state: "TX" });
    expect(result.status).toBe("resolved");
    expect(result.request.candidate.identifiers).toEqual({ bioguide: "C001131" });
    expect(result.request.position).toEqual(request.position);
    expect(request.candidate.identifiers).toBeUndefined();
    expect(result.evidence[0].locator).toBe("/MemberData/members/member[2]");
    expect(client.get).toHaveBeenCalledExactlyOnceWith(HOUSE_ROSTER_URL, {
      format: "xml",
      root: "MemberData",
    });
  });

  it("uses the official postal state, not the Clerk district prefix, as the identity filter", async () => {
    const result = await resolveHouseMember({
      ...request,
      candidate: { id: "radewagen", name: "Aumua Amata Coleman Radewagen" },
    }, cachedRosterClient(), { state: "AS" });
    expect(result.status).toBe("resolved");
    expect(result.request.candidate.identifiers).toEqual({ bioguide: "R000600" });
    expect(result.evidence[0].locator).toBe("/MemberData/members/member[1]");
  });
});
