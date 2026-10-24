import { createHash } from "node:crypto";
import type { CandidateResearchRequest } from "@ftb/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicUrl } from "../fetch";
import type { Snapshot } from "../model";
import { HOUSE_ROSTER_URL, parseHouseRoster, resolveHouseMember } from "./index";
import type { HouseRosterMember, IdentitySnapshotClient } from "./index";

type FixtureMember = Omit<HouseRosterMember, "locator">;
const casar: FixtureMember = {
  bioguideId: "C001131",
  officialName: "Greg Casar",
  firstName: "Greg",
  middleName: "",
  lastName: "Casar",
  suffix: "",
  state: "TX",
  district: "35th",
  stateDistrict: "TX35",
};

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function memberXml(member: FixtureMember): string {
  return `<member><statedistrict>${xml(member.stateDistrict)}</statedistrict><member-info>
    <bioguideID>${xml(member.bioguideId)}</bioguideID>
    <official-name>${xml(member.officialName)}</official-name>
    <firstname>${xml(member.firstName)}</firstname><middlename>${xml(member.middleName)}</middlename>
    <lastname>${xml(member.lastName)}</lastname><suffix>${xml(member.suffix)}</suffix>
    <state postal-code="${member.state}"><state-fullname>Texas</state-fullname></state>
    <district>${xml(member.district)}</district><party>D</party>
  </member-info></member>`;
}

function roster(members = [casar], title = "<title-info><congress-num>119</congress-num></title-info>"): string {
  return `<MemberData>${title}<members>${members.map(memberXml).join("")}</members></MemberData>`;
}

function request(name = "Greg Casar", identifiers?: Record<string, string>): CandidateResearchRequest {
  return {
    candidate: { id: "ballot-candidate", name, ...(identifiers ? { identifiers } : {}) },
    position: { office: "us_house", jurisdiction: "configured-jurisdiction", district: "37" },
    month: 11,
    year: 2026,
  };
}

type DocumentOptions = Parameters<IdentitySnapshotClient["get"]>[1];
function snapshot(url: string, text: string, options: DocumentOptions): Snapshot {
  const contentHash = createHash("sha256").update(text).digest("hex");
  return {
    id: `${publicUrl(url)}:${contentHash}`,
    sourceUrl: publicUrl(url), // SnapshotClient removes credentials before provenance.
    fetchedAt: "2026-10-24T00:00:00Z",
    contentHash,
    text,
    format: options.format,
  };
}

function mockClient(
  house: string | Error = roster(),
  api: (url: URL) => string | Promise<string> = () => { throw new Error("Unexpected API lookup"); },
) {
  return {
    get: vi.fn(async (url: string, options: DocumentOptions) => {
      if (url === HOUSE_ROSTER_URL) {
        if (house instanceof Error) throw house;
        return snapshot(url, house, options);
      }
      return snapshot(url, await api(new URL(url)), options);
    }),
  } satisfies IdentitySnapshotClient;
}

function pastMember(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    member: {
      bioguideId: "O000170",
      firstName: "Beto",
      lastName: "O'Rourke",
      directOrderName: "Beto O'Rourke",
      state: "Texas",
      currentMember: false,
      terms: [{ chamber: "House of Representatives", stateCode: "TX", startYear: 2013, endYear: 2019 }],
      party: "Democratic",
      ...overrides,
    },
  });
}

function listing(members: { bioguideId: string; name: string; state: string }[], count = members.length): string {
  return JSON.stringify({ members, pagination: { count } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network is forbidden in identity tests"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("parseHouseRoster", () => {
  it("reads the official MemberData hierarchy without projecting party", () => {
    const parsed = parseHouseRoster(roster());
    expect(parsed.congress).toBe(119);
    expect(parsed.members).toEqual([{ ...casar, locator: "/MemberData/members/member[1]" }]);
    expect(JSON.stringify(parsed)).not.toContain("party");
  });

  it("supports an attribute congress number and singleton member elements", () => {
    expect(parseHouseRoster(roster([casar], '<title-info congress-num="119"/>')).members).toHaveLength(1);
  });

  it("preserves names, leading district zeros, middle names and suffixes", () => {
    const begich = { ...casar, bioguideId: "B001323", firstName: "Nicholas", middleName: "J.",
      lastName: "Begich", suffix: "III", officialName: "Nicholas J. Begich III",
      state: "AK", district: "At Large", stateDistrict: "AK00" };
    expect(parseHouseRoster(roster([begich])).members[0]).toMatchObject(begich);
  });

  it("skips vacancies but keeps locators indexed into the original member nodes", () => {
    const vacancy = memberXml({ ...casar, bioguideId: "", officialName: "Vacant", firstName: "", lastName: "VACANT" })
      .replace('<state postal-code="TX"><state-fullname>Texas</state-fullname></state>', "");
    const source = roster().replace("<members>", `<members>${vacancy}`);
    expect(parseHouseRoster(source).members[0].locator).toBe("/MemberData/members/member[2]");
  });

  it("allows an explicitly empty members collection", () => {
    expect(parseHouseRoster(roster([])).members).toEqual([]);
  });

  it.each([
    "<html><body>Blocked</body></html>",
    "<MemberData>",
    '<!DOCTYPE MemberData [<!ENTITY bad "Greg">]><MemberData/>',
    roster([{ ...casar, bioguideId: "" }]),
    roster([{ ...casar, stateDistrict: "CA35" }]),
    roster([{ ...casar, stateDistrict: "AQ00" }]),
  ])("rejects invalid or unsafe roster documents", (source) => {
    expect(() => parseHouseRoster(source)).toThrow();
  });
});

describe("resolveHouseMember: current official roster", () => {
  it("enriches a unique exact name, retains other IDs, and does not mutate the request", async () => {
    const original = request("Greg Casar", { fec: "H2TX35144" });
    const client = mockClient();
    const result = await resolveHouseMember(original, client, { state: "TX" });
    expect(result.status).toBe("resolved");
    expect(result.request.candidate.identifiers).toEqual({ fec: "H2TX35144", bioguide: "C001131" });
    expect(original.candidate.identifiers).toEqual({ fec: "H2TX35144" });
    expect(result.request.position.district).toBe("37");
    expect(client.get).toHaveBeenCalledExactlyOnceWith(HOUSE_ROSTER_URL, { format: "xml", root: "MemberData" });
    expect(result.evidence).toEqual([expect.objectContaining({
      sourceUrl: HOUSE_ROSTER_URL,
      locator: "/MemberData/members/member[1]",
      adapter: "official-house-identity/v1",
      fetchedAt: "2026-10-24T00:00:00Z",
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })]);
    expect(Object.keys(result).sort()).toEqual(["evidence", "reason", "request", "status"]);
    expect(JSON.stringify(result)).not.toContain('"party"');
    expect(result.reason).toContain("before 2026-11-01 (exclusive)");
    expect(result.reason).toContain("does not establish tenure");
  });

  it.each(["governor", "us_senate", "city_council"])("looks for previous federal service regardless of the sought office %s", async (office) => {
    const input = request();
    input.position = { office, jurisdiction: "not-a-state", district: "new-district" };
    const result = await resolveHouseMember(input, mockClient(), { state: "TX" });
    expect(result.status).toBe("resolved");
    expect(result.request.position).toEqual(input.position);
  });

  it("requires a supplied verified alias for Gregorio versus Greg", async () => {
    const client = mockClient();
    const input = request("Gregorio Casar");
    expect((await resolveHouseMember(input, client)).status).toBe("unresolved");
    input.candidate.aliases = ["Greg Casar"];
    expect((await resolveHouseMember(input, client)).status).toBe("resolved");
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it("accepts the officially supplied first-plus-last name when the official name has a middle name", async () => {
    const client = mockClient(roster([{ ...casar, officialName: "Gregorio E. Casar", firstName: "Gregorio", middleName: "E." }]));
    expect((await resolveHouseMember(request("Gregorio Casar"), client)).status).toBe("resolved");
    expect((await resolveHouseMember(request("Greg Casar"), client)).status).toBe("unresolved");
  });

  it("normalizes official Unicode, case and whitespace, but does not remove accents", async () => {
    const client = mockClient(roster([{ ...casar, officialName: "José Velásquez", firstName: "José", lastName: "Velásquez" }]));
    expect((await resolveHouseMember(request(" JOSE\u0301   VELA\u0301SQUEZ "), client)).status).toBe("resolved");
    expect((await resolveHouseMember(request("Jose Velasquez"), client)).status).toBe("unresolved");
  });

  it("never matches a surname alone, even if it is unique", async () => {
    expect((await resolveHouseMember(request("Casar"), mockClient())).status).toBe("unresolved");
  });

  it("does not mistake a multiword surname for a full name", async () => {
    const client = mockClient(roster([{ ...casar, officialName: "De La Cruz", firstName: "Monica", lastName: "De La Cruz" }]));
    expect((await resolveHouseMember(request("De La Cruz"), client)).status).toBe("unresolved");
    expect((await resolveHouseMember(request("Monica De La Cruz"), client)).status).toBe("resolved");
  });

  it("does not confuse two members with the same surname", async () => {
    const client = mockClient(roster([casar, { ...casar, bioguideId: "C001132", officialName: "Robert Casar", firstName: "Robert", district: "36th", stateDistrict: "TX36" }]));
    expect((await resolveHouseMember(request("Greg Casar"), client)).request.candidate.identifiers?.bioguide).toBe("C001131");
    expect((await resolveHouseMember(request("Casar"), client)).status).toBe("unresolved");
  });

  it("abstains when first-plus-last is not unique", async () => {
    const client = mockClient(roster([
      { ...casar, officialName: "John A. Smith", firstName: "John", middleName: "A.", lastName: "Smith" },
      { ...casar, bioguideId: "S000002", officialName: "John B. Smith", firstName: "John", middleName: "B.", lastName: "Smith" },
    ]));
    const result = await resolveHouseMember(request("John Smith"), client, { state: "TX" });
    expect(result.status).toBe("ambiguous");
    expect(result.request.candidate.identifiers).toBeUndefined();
    expect(result.evidence.map((proof) => proof.locator)).toEqual(["/MemberData/members/member[1]", "/MemberData/members/member[2]"]);
  });

  it("treats duplicate roster entries as ambiguous, including a supplied ID", async () => {
    const client = mockClient(roster([casar, casar]));
    expect((await resolveHouseMember(request(), client)).status).toBe("ambiguous");
    expect((await resolveHouseMember(request("Greg Casar", { bioguide: "C001131" }), client)).status).toBe("ambiguous");
  });

  it("uses only an explicit state filter and never the race district to disambiguate", async () => {
    const otherState = { ...casar, bioguideId: "C001132", state: "CA", stateDistrict: "CA37", district: "37th" };
    const client = mockClient(roster([casar, otherState]));
    const input = request();
    input.position.jurisdiction = "TX";
    expect((await resolveHouseMember(input, client)).status).toBe("ambiguous");
    expect((await resolveHouseMember(input, client, { state: " tx " })).request.candidate.identifiers?.bioguide).toBe("C001131");
  });

  it("abstains if aliases match multiple distinct people", async () => {
    const client = mockClient(roster([casar, { ...casar, bioguideId: "S000001", officialName: "John Smith", firstName: "John", lastName: "Smith" }]));
    const input = request();
    input.candidate.aliases = ["John Smith"];
    expect((await resolveHouseMember(input, client)).status).toBe("ambiguous");
  });

  it("reuses one frozen roster snapshot across concurrent resolutions", async () => {
    const client = mockClient();
    const results = await Promise.all([resolveHouseMember(request(), client), resolveHouseMember(request(), client)]);
    expect(results.map((result) => result.status)).toEqual(["resolved", "resolved"]);
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it("does not treat an invalid state configuration as an unrestricted lookup", async () => {
    const client = mockClient();
    await expect(resolveHouseMember(request(), client, { state: "Texas" })).rejects.toThrow("postal code");
    expect(client.get).not.toHaveBeenCalled();
  });
});

describe("supplied bioguide IDs", () => {
  it("verifies an explicit ID when a full name agrees", async () => {
    const result = await resolveHouseMember(request("Greg Casar", { bioguide: "C001131" }), mockClient());
    expect(result.status).toBe("resolved");
  });

  it("does not silently replace a wrong member ID with a name-matched ID", async () => {
    const other = { ...casar, bioguideId: "S000001", officialName: "John Smith", firstName: "John", lastName: "Smith" };
    const client = mockClient(roster([casar, other]));
    const input = request("Greg Casar", { bioguide: "S000001" });
    const result = await resolveHouseMember(input, client, { congressApiKey: "unused-key" });
    expect(result.status).toBe("conflict");
    expect(result.request).toBe(input);
    expect(result.evidence[0].locator).toBe("/MemberData/members/member[2]");
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it("conflicts when a supplied ID fails the explicit state filter", async () => {
    expect((await resolveHouseMember(request("Greg Casar", { bioguide: "C001131" }), mockClient(), { state: "CA" })).status).toBe("conflict");
  });

  it.each(["C1131", "c001131", "C001131 ", "../member", ""])("conflicts on invalid ID %j without fetching", async (bioguide) => {
    const client = mockClient();
    const result = await resolveHouseMember(request("Greg Casar", { bioguide }), client);
    expect(result.status).toBe("conflict");
    expect(result.evidence).toEqual([]);
    expect(client.get).not.toHaveBeenCalled();
  });

  it("keeps an ID absent from the current roster unresolved without a configured historical key", async () => {
    const input = request("Beto O'Rourke", { bioguide: "O000170" });
    const client = mockClient();
    const result = await resolveHouseMember(input, client);
    expect(result.status).toBe("unresolved");
    expect(result.request).toBe(input);
    expect(result.reason).toContain("former member");
    expect(result.reason).toContain("never held office");
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it("does not call an absent ID a conflict merely because a current member shares the name", async () => {
    const result = await resolveHouseMember(request("Greg Casar", { bioguide: "C000001" }), mockClient());
    expect(result.status).toBe("unresolved");
    expect(result.request.candidate.identifiers?.bioguide).toBe("C000001");
  });
});

describe("official Congress.gov historical verification", () => {
  it("verifies a former member by ID, regardless of office sought, without exposing the key", async () => {
    const client = mockClient(roster(), () => pastMember());
    const input = request("Beto O'Rourke", { bioguide: "O000170" });
    input.position.office = "governor";
    const result = await resolveHouseMember(input, client, { state: "TX", congressApiKey: "private-key" });
    expect(result.status).toBe("resolved");
    expect(new URL(client.get.mock.calls[1][0]).pathname).toBe("/v3/member/O000170");
    expect(new URL(client.get.mock.calls[1][0]).searchParams.get("api_key")).toBe("private-key");
    expect(result.evidence.at(-1)?.locator).toBe("/member");
    expect(result.evidence.at(-1)?.sourceUrl).toBe("https://api.congress.gov/v3/member/O000170?format=json");
    expect(JSON.stringify(result)).not.toContain("private-key");
    expect(JSON.stringify(result)).not.toContain("api_key");
    expect(JSON.stringify(result)).not.toContain('"party"');
  });

  it("accepts officially recorded previous-state service as an identity filter", async () => {
    const client = mockClient(roster(), () => pastMember({ state: "New Mexico" }));
    expect((await resolveHouseMember(request("Beto O'Rourke", { bioguide: "O000170" }), client, { state: "TX", congressApiKey: "key" })).status).toBe("resolved");
  });

  it("conflicts when the official API returns a different ID", async () => {
    const client = mockClient(roster(), () => pastMember({ bioguideId: "O000171" }));
    expect((await resolveHouseMember(request("Beto O'Rourke", { bioguide: "O000170" }), client, { congressApiKey: "key" })).status).toBe("conflict");
  });

  it("conflicts when the ID names a different person instead of guessing a nickname", async () => {
    const client = mockClient(roster(), () => pastMember());
    const result = await resolveHouseMember(request("Robert O'Rourke", { bioguide: "O000170" }), client, { congressApiKey: "key" });
    expect(result.status).toBe("conflict");
    const input = request("Robert O'Rourke", { bioguide: "O000170" });
    input.candidate.aliases = ["Beto O'Rourke"];
    expect((await resolveHouseMember(input, client, { congressApiKey: "key" })).status).toBe("resolved");
  });

  it("verifies the documented name field even when separate first/last fields are absent", async () => {
    const client = mockClient(roster(), () => JSON.stringify({ member: { bioguideId: "O000170", name: "O'Rourke, Beto" } }));
    expect((await resolveHouseMember(request("Beto O'Rourke", { bioguide: "O000170" }), client, { congressApiKey: "key" })).status).toBe("resolved");
  });

  it("does not leak credential-bearing client errors or equate failed verification with conflict", async () => {
    const client = mockClient(roster(), () => { throw new Error("HTTP 403: https://api.congress.gov/?api_key=private-key"); });
    const result = await resolveHouseMember(request("Beto O'Rourke", { bioguide: "O000170" }), client, { congressApiKey: "private-key" });
    expect(result.status).toBe("unresolved");
    expect(JSON.stringify(result)).not.toContain("private-key");
  });

  it("reports invalid official API documents as unresolved", async () => {
    const client = mockClient(roster(), () => JSON.stringify({ error: "not found" }));
    expect((await resolveHouseMember(request("Beto O'Rourke", { bioguide: "O000170" }), client, { congressApiKey: "key" })).status).toBe("unresolved");
  });

  it("does not call a member document without a full name an identity conflict", async () => {
    const client = mockClient(roster(), () => JSON.stringify({ member: { bioguideId: "O000170" } }));
    expect((await resolveHouseMember(request("Beto O'Rourke", { bioguide: "O000170" }), client, { congressApiKey: "key" })).status).toBe("unresolved");
  });

  it("cannot verify a configured state from missing state metadata", async () => {
    const client = mockClient(roster(), () => JSON.stringify({ member: { bioguideId: "O000170", name: "O'Rourke, Beto" } }));
    const result = await resolveHouseMember(request("Beto O'Rourke", { bioguide: "O000170" }), client, { state: "TX", congressApiKey: "key" });
    expect(result.status).toBe("unresolved");
    expect(result.reason).toContain("enough state information");
  });

  it("never accepts a surname-only API name as a full name", async () => {
    const client = mockClient(roster(), () => JSON.stringify({ member: { bioguideId: "D000001", firstName: " ", lastName: "De La Cruz", name: "De La Cruz, " } }));
    const result = await resolveHouseMember(request("De La Cruz", { bioguide: "D000001" }), client, { congressApiKey: "key" });
    expect(result.status).toBe("unresolved");
  });

  it("can use the official API when the current roster is unavailable", async () => {
    const client = mockClient(new Error("Unavailable"), () => pastMember());
    const result = await resolveHouseMember(request("Beto O'Rourke", { bioguide: "O000170" }), client, { congressApiKey: "key" });
    expect(result.status).toBe("resolved");
    expect(result.reason).toContain("roster was unavailable");
  });

  it("does not search historical names without an explicit state or supplied ID", async () => {
    const input = request("Beto O'Rourke");
    input.position.jurisdiction = "TX";
    const client = mockClient();
    const result = await resolveHouseMember(input, client, { congressApiKey: "key" });
    expect(result.status).toBe("unresolved");
    expect(result.reason).toContain("no state was inferred");
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it("looks up and verifies a unique historical name in a configured state", async () => {
    const client = mockClient(roster(), (url) => url.pathname === "/v3/member/TX" ?
      listing([{ bioguideId: "O000170", name: "O'Rourke, Beto", state: "Texas" }]) : pastMember());
    const result = await resolveHouseMember(request("Beto O'Rourke"), client, { state: "TX", congressApiKey: "key" });
    expect(result.status).toBe("resolved");
    expect(result.request.candidate.identifiers?.bioguide).toBe("O000170");
    const listUrl = new URL(client.get.mock.calls[1][0]);
    expect(listUrl.searchParams.get("currentMember")).toBe("false");
    expect(listUrl.searchParams.get("limit")).toBe("250");
    expect(listUrl.searchParams.get("offset")).toBe("0");
    expect(listUrl.searchParams.has("district")).toBe(false);
    expect(result.evidence.map((proof) => proof.locator)).toEqual(["/MemberData/members", "/members/0", "/member"]);
  });

  it("checks later pages for name collisions before selecting the first match", async () => {
    const first = [{ bioguideId: "O000170", name: "O'Rourke, Beto", state: "Texas" },
      ...Array.from({ length: 249 }, (_, i) => ({ bioguideId: `B${String(i).padStart(6, "0")}`, name: `Other${i}, Person`, state: "Texas" }))];
    const client = mockClient(roster(), (url) => url.searchParams.get("offset") === "0" ?
      listing(first, 251) : listing([{ bioguideId: "O000171", name: "O'Rourke, Beto", state: "Texas" }], 251));
    const result = await resolveHouseMember(request("Beto O'Rourke"), client, { state: "TX", congressApiKey: "key" });
    expect(result.status).toBe("ambiguous");
    expect(result.request.candidate.identifiers).toBeUndefined();
    expect(new URL(client.get.mock.calls[2][0]).searchParams.get("offset")).toBe("250");
    expect(client.get).toHaveBeenCalledTimes(3);
  });

  it("does not resolve a potential match from an incomplete historical listing", async () => {
    const client = mockClient(roster(), (url) => url.searchParams.get("offset") === "0" ?
      listing([{ bioguideId: "O000170", name: "O'Rourke, Beto", state: "Texas" }], 2) : listing([], 2));
    const result = await resolveHouseMember(request("Beto O'Rourke"), client, { state: "TX", congressApiKey: "key" });
    expect(result.status).toBe("unresolved");
    expect(result.reason).toContain("uniqueness was not established");
  });

  it("does not trust a historical name listing without item-level name verification", async () => {
    const client = mockClient(roster(), (url) => url.pathname === "/v3/member/TX" ?
      listing([{ bioguideId: "O000170", name: "O'Rourke, Robert", state: "Texas" }]) : pastMember());
    expect((await resolveHouseMember(request("Robert O'Rourke"), client, { state: "TX", congressApiKey: "key" })).status).toBe("conflict");
  });

  it("keeps a wrong-state historical listing from resolving a same-name person", async () => {
    const client = mockClient(roster(), () => listing([{ bioguideId: "O000170", name: "O'Rourke, Beto", state: "California" }]));
    expect((await resolveHouseMember(request("Beto O'Rourke"), client, { state: "TX", congressApiKey: "key" })).status).toBe("unresolved");
    expect(client.get).toHaveBeenCalledTimes(2);
  });
});

describe("lookup coverage", () => {
  it("does not imply never-held-office when no current match or historical capability exists", async () => {
    const client = mockClient();
    const result = await resolveHouseMember(request("Unknown Candidate"), client);
    expect(result.status).toBe("unresolved");
    expect(result.reason).toContain("not a history of all previous offices");
    expect(result.reason).toContain("not proof that a candidate never held office");
    expect(result.reason).toContain("requires an explicitly configured congressApiKey");
    expect(result.evidence[0].locator).toBe("/MemberData/members");
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it("does not use a blank key or an implicit DEMO_KEY", async () => {
    const client = mockClient();
    expect((await resolveHouseMember(request("Unknown Candidate"), client, { state: "TX", congressApiKey: "  " })).status).toBe("unresolved");
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  it("reports an invalid roster as unavailable, not a successful empty lookup", async () => {
    const result = await resolveHouseMember(request(), mockClient("<MemberData/>"));
    expect(result.status).toBe("unresolved");
    expect(result.reason).toContain("roster was unavailable or invalid");
    expect(result.evidence).toEqual([]);
  });

  it("uses the beginning of the election month, not a wall-clock action cutoff", async () => {
    const input = request();
    input.month = 1;
    input.year = 2025;
    const result = await resolveHouseMember(input, mockClient());
    expect(result.reason).toContain("before 2025-01-01 (exclusive)");
  });
});
