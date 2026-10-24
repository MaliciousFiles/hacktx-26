import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { CandidateResearchRequest } from "@ftb/types";
import { describe, expect, it, vi } from "vitest";
import { publicUrl, SnapshotClient } from "../fetch";
import type { DateWindow, Snapshot } from "../model";
import {
  govinfoBillstatusAdapter, govinfoCrecAdapter, houseClerkAdapter,
  parseGovinfoBillstatus, parseGovinfoCrec, parseHouseClerk,
} from "./index";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.synthetic.xml`, import.meta.url), "utf8");
const house = fixture("house-rollcall");
const speaker = fixture("house-speaker");
const crec = fixture("crec");
const crecPackage = fixture("crec-package");
const bill = fixture("billstatus");
const legacyBill = fixture("billstatus-legacy");
const houseUrl = "https://clerk.house.gov/evs/2025/roll007.xml";
const speakerUrl = "https://clerk.house.gov/evs/2025/roll002.xml";
// Verified official MODS endpoint; fixtures are synthetic and tests never fetch it.
const crecUrl = "https://www.govinfo.gov/metadata/granule/CREC-2025-07-23/CREC-2025-07-23-pt1-PgS4581-2/mods.xml";
const crecPackageUrl = "https://www.govinfo.gov/metadata/pkg/CREC-2025-07-23/mods.xml";
const billUrl = "https://www.govinfo.gov/bulkdata/BILLSTATUS/119/hr/BILLSTATUS-119hr42.xml";
const legacyUrl = "https://www.govinfo.gov/bulkdata/BILLSTATUS/118/s/BILLSTATUS-118s17.xml";

function context(
  documents: Record<string, string>,
  id: string | undefined = "C001131",
  window: DateWindow = { since: "2020-01-01", before: "2025-11-01" },
) {
  const request: CandidateResearchRequest = {
    candidate: { id: "pipeline-person", name: "Same Surname", identifiers: id ? { bioguide: id } : {} },
    position: { office: "us_house", jurisdiction: "us", district: "35" }, month: 11, year: 2025,
  };
  // Mock at the immutable snapshot boundary, with no network or filesystem writes.
  const client = new SnapshotClient({ directory: "unused-fixture-cache", mode: "offline" });
  const get = vi.spyOn(client, "get").mockImplementation(async (url, options): Promise<Snapshot> => {
    const xml = documents[url];
    if (xml === undefined) throw new Error(`Unexpected fixture URL: ${publicUrl(url)}`);
    const hash = createHash("sha256").update(xml).digest("hex");
    return {
      id: createHash("sha256").update(`${publicUrl(url)}:${hash}`).digest("hex"),
      sourceUrl: publicUrl(url), contentHash: hash, fetchedAt: "2026-10-24T12:00:00Z", format: options.format, text: xml,
    };
  });
  return { request, window, client, get };
}

describe("federal identity/configuration and XML boundary", () => {
  const adapters = [
    { adapter: houseClerkAdapter, parse: parseHouseClerk, xml: house, url: houseUrl },
    { adapter: govinfoCrecAdapter, parse: parseGovinfoCrec, xml: crec, url: crecUrl },
    { adapter: govinfoBillstatusAdapter, parse: parseGovinfoBillstatus, xml: bill, url: billUrl },
  ];
  for (const { adapter, parse, xml, url } of adapters) {
    it(`${adapter.kind} requires a verified official ID, never a matching name`, async () => {
      for (const id of ["", "not-an-official-id"]) {
        const ctx = context({ [url]: xml }, id);
        expect(await adapter.collect(ctx, { urls: [url] })).toMatchObject({ status: "needs_review", actions: [] });
        expect(ctx.get).not.toHaveBeenCalled();
      }
    });

    it(`${adapter.kind} validates its URL list with zod`, async () => {
      const ctx = context({ [url]: xml });
      for (const urls of [[], ["https://example.com/fake.xml"], [url.replace("https:", "http:")]]) {
        await expect(adapter.collect(ctx, { urls })).rejects.toThrow();
      }
      expect(ctx.get).not.toHaveBeenCalled();
    });

    it(`${adapter.kind} rejects malformed, HTML, and wrong-root responses`, () => {
      for (const invalid of ["<html><body>Blocked</body></html>", "<wrong/>", "<mods><broken></mods>"]) {
        expect(() => parse(invalid)).toThrow();
      }
      expect(() => parse('<!DOCTYPE x [<!ENTITY x "expanded">]><x>&x;</x>')).toThrow();
    });
  }
});

describe("House Clerk roll calls", () => {
  it("attributes by ID despite identical surnames, retaining the exact motion and aggregate totals", async () => {
    const ctx = context({ [houseUrl]: house });
    const result = await houseClerkAdapter.collect(ctx, { urls: [houseUrl], role: "Historical House role" });
    expect(result.status).toBe("complete");
    expect(result.reason).toContain("only the supplied");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      id: "us-congress:house:2025:roll:7:member:C001131", actorId: "pipeline-person", issueIds: [],
      role: "Historical House role", date: "2025-01-09", type: "floor_vote", stance: "no",
      margin: { yes: 1, no: 1, present: 1, notVoting: 1 },
      vote: { raw: "Nay", value: "no", question: "On Motion to Recommit", method: "roll_call", legisNum: "H R 42" },
      title: "H.R. 42 — Synthetic Clean Water Measure",
      measureUrl: "https://www.congress.gov/bill/119th-congress/house-bill/42",
      sourceUrl: houseUrl, extraction: "xml", attribution: { method: "member_id", sourceActorId: "C001131" },
      provenance: expect.arrayContaining([
        expect.objectContaining({ adapter: "house-clerk/v1", contentHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
        expect.objectContaining({ locator: "/rollcall-vote/vote-data/recorded-vote[1]" }),
        expect.objectContaining({ locator: "/rollcall-vote/vote-metadata/legis-num" }),
      ]),
    });
    expect(result.actions[0].provenance).toHaveLength(3);
    expect(result.actions[0].officialText).toContain("Measure URL: https://www.congress.gov/bill/119th-congress/house-bill/42");
    expect(JSON.stringify(result.actions)).not.toMatch(/DO-NOT-PROJECT|Not classification input|party/);
    expect(ctx.get).toHaveBeenCalledWith(houseUrl, { format: "xml", root: "rollcall-vote" });
  });

  it.each([
    ["C001133", "Present", "present"], ["C001134", "Not Voting", "not_voting"],
  ])("preserves %s's non-binary raw vote without turning it into abstention", async (id, raw, value) => {
    const result = await houseClerkAdapter.collect(context({ [houseUrl]: house }, id), { urls: [houseUrl] });
    expect(result.actions[0]).toMatchObject({ stance: "n/a", vote: { raw, value } });
  });

  it("validates named Speaker choices without inventing yes/no totals or stances", async () => {
    const result = await houseClerkAdapter.collect(context({ [speakerUrl]: speaker }), { urls: [speakerUrl] });
    expect(result.actions[0]).toMatchObject({ stance: "n/a", vote: { value: "other", raw: "Candidate Alpha", question: "Election of the Speaker" } });
    expect(result.actions[0].margin).toBeUndefined();
    expect(parseHouseClerk(speaker).candidateTotals).toContainEqual({ candidate: "Candidate Alpha", total: 1 });
    const present = await houseClerkAdapter.collect(context({ [speakerUrl]: speaker }, "C001133"), { urls: [speakerUrl] });
    expect(present.actions[0]).toMatchObject({ stance: "n/a", vote: { value: "present" } });
    expect(() => parseHouseClerk(speaker.replace("<candidate-total>1</candidate-total>", "<candidate-total>2</candidate-total>"))).toThrow(/aggregate/);
  });

  it("rejects missing IDs, duplicate members, unknown/blank votes, and aggregate mismatches", () => {
    expect(() => parseHouseClerk(house.replace('name-id="C001131"', ""))).toThrow();
    expect(() => parseHouseClerk(house.replace('name-id="C001132"', 'name-id="C001131"'))).toThrow(/Duplicate member/);
    expect(() => parseHouseClerk(house.replace("<yea-total>1</yea-total>", "<yea-total>2</yea-total>"))).toThrow(/aggregate/);
    expect(() => parseHouseClerk(house.replace("<vote>Nay</vote>", "<vote/>"))).toThrow();
    expect(() => parseHouseClerk(house.replace("<vote>Nay</vote>", "<vote>Unknown</vote>"))).toThrow(/Unrecognized/);
    expect(() => parseHouseClerk(house.replace("9-Jan-2025", "31-Feb-2025"))).toThrow(/date/);
  });

  it("uses an inclusive since and exclusive cutoff without treating a missing record as absence", async () => {
    const included = await houseClerkAdapter.collect(context({ [houseUrl]: house }, "C001131", { since: "2025-01-09", before: "2025-01-10" }), { urls: [houseUrl] });
    expect(included.actions).toHaveLength(1);
    const excluded = await houseClerkAdapter.collect(context({ [houseUrl]: house }, "C001131", { since: "2020-01-01", before: "2025-01-09" }), { urls: [houseUrl] });
    expect(excluded).toMatchObject({ status: "partial", actions: [] });
    expect(excluded.reason).toContain("not proof of absence");
    const other = await houseClerkAdapter.collect(context({ [houseUrl]: house }, "C001199"), { urls: [houseUrl] });
    expect(other).toMatchObject({ status: "partial", actions: [] });
    expect(other.reason).toContain("missing votes are not coded as absence");
  });

  it("deduplicates repeated official events, retaining both snapshots and canonical URLs", async () => {
    const alternate = `${houseUrl}?edition=2`;
    const ctx = context({ [houseUrl]: house, [alternate]: house });
    const result = await houseClerkAdapter.collect(ctx, { urls: [alternate, houseUrl, houseUrl] });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].provenance!.length).toBeGreaterThanOrEqual(4);
    expect(ctx.get).toHaveBeenCalledTimes(2);
  });
});

describe("GovInfo Congressional Record structured votes", () => {
  it("extracts each congVote separately, ignoring speakers and nested host extensions", async () => {
    const result = await govinfoCrecAdapter.collect(context({ [crecUrl]: crec }, "C001098"), { urls: [crecUrl] });
    expect(result.actions).toHaveLength(2);
    expect(result.actions.map((action) => action.vote?.value)).toEqual(["no", "yes"]);
    expect(result.actions.map((action) => action.date)).toEqual(["2025-07-22", "2025-07-23"]);
    expect(result.actions[1]).toMatchObject({
      id: "us-congress:senate:2025:roll:426:member:C001098", actorId: "pipeline-person", stance: "yes",
      margin: { yes: 1, no: 1, present: 1, notVoting: 1 },
      officialText: "On the Cloture Motion (Synthetic Nomination)",
      vote: { raw: "VOTED YES", question: "On the Cloture Motion (Synthetic Nomination)" },
      provenance: expect.arrayContaining([expect.objectContaining({ locator: "/mods/extension[2]/congVote[1]/congMember[1]" })]),
    });
    expect(result.status).toBe("partial");
    expect(result.reason).toContain("document date");
    expect(result.reason).toContain("actual vote dates remain unverified");
    expect(JSON.stringify(result.actions)).not.toMatch(/DO-NOT-PROJECT|OTHER|party|SPEAKER-PARTY/);
    const speakerOnly = await govinfoCrecAdapter.collect(context({ [crecUrl]: crec }, "C001102"), { urls: [crecUrl] });
    expect(speakerOnly).toMatchObject({ status: "partial", actions: [] });
  });

  it.each([["C001100", "present", "PRESENT - P"], ["C001101", "not_voting", "NOT VOTING - NV"]])(
    "preserves %s's non-yes/no role", async (id, value, raw) => {
      const result = await govinfoCrecAdapter.collect(context({ [crecUrl]: crec }, id), { urls: [crecUrl] });
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0]).toMatchObject({ stance: "n/a", vote: { value, raw } });
    },
  );

  it("uses the granule title only when there is no separate question, flagging that limitation", async () => {
    const xml = crec.replace("<question>On the Cloture Motion (Synthetic Nomination)</question>", "");
    const result = await govinfoCrecAdapter.collect(context({ [crecUrl]: xml }, "C001098"), { urls: [crecUrl] });
    expect(result.actions[1].vote?.question).toBe("Synthetic Senate Proceedings");
    expect(result.reason).toContain("no separate question");
  });

  it("can report source-scoped completeness when vote dates and questions are explicit", async () => {
    const xml = crec.replace("<inDailyDigest>false</inDailyDigest>", "<voteDate>2025-07-23</voteDate><inDailyDigest>false</inDailyDigest>");
    const result = await govinfoCrecAdapter.collect(context({ [crecUrl]: xml }, "C001098"), { urls: [crecUrl] });
    expect(result.status).toBe("complete");
    expect(result.reason).toContain("only the supplied");
  });

  it("handles no structured votes gracefully without using speaking identities", async () => {
    const xml = crec.replace(/<congVote\b[\s\S]*?<\/congVote>/g, "");
    const result = await govinfoCrecAdapter.collect(context({ [crecUrl]: xml }, "C001102"), { urls: [crecUrl] });
    expect(result).toMatchObject({ status: "partial", actions: [] });
    expect(result.reason).toContain("no structured votes");
  });

  it("rejects count mismatches, missing IDs, duplicate members, and missing document dates", () => {
    expect(() => parseGovinfoCrec(crec.replace('yescount="1"', 'yescount="2"'))).toThrow(/aggregate/);
    expect(() => parseGovinfoCrec(crec.replace('bioGuideId="C001098"', ""))).toThrow();
    expect(() => parseGovinfoCrec(crec.replace('bioGuideId="C001099"', 'bioGuideId="C001098"'))).toThrow(/Duplicate member/);
    expect(() => parseGovinfoCrec(crec.replace("<granuleDate>2025-07-23</granuleDate>", ""))).toThrow(/granuleDate/);
    expect(() => parseGovinfoCrec(crec.replace('presentcount="1"', ""))).toThrow(/aggregate/);
    expect(() => parseGovinfoCrec(crec.replace('role="VOTED YES"', 'role="SPEAKING"'))).toThrow(/Unrecognized/);
  });

  it("ignores Daily Digest-flagged republications rather than adding new events", async () => {
    const digestUrl = "https://www.govinfo.gov/metadata/granule/CREC-2025-07-24/CREC-2025-07-24-pt1-PgD1/mods.xml";
    const digest = crec.replace("<granuleDate>2025-07-23</granuleDate>", "<granuleDate>2025-07-24</granuleDate>")
      .replaceAll("<inDailyDigest>false</inDailyDigest>", "<inDailyDigest>true</inDailyDigest>")
      .replace("Synthetic Senate Proceedings", "Synthetic Daily Digest");
    const result = await govinfoCrecAdapter.collect(context({ [crecUrl]: crec, [digestUrl]: digest }, "C001098"), { urls: [digestUrl, crecUrl] });
    expect(result.actions).toHaveLength(2);
    for (const action of result.actions) {
      expect(action.sourceUrl).toBe(crecUrl);
      expect(new Set(action.provenance?.map((ref) => ref.sourceUrl))).toEqual(new Set([crecUrl]));
    }
    expect(result.actions[1].date).toBe("2025-07-23");
    expect(result.actions[1].title).toBe("Synthetic Senate Proceedings");
    expect(result.reason).toContain("inDailyDigest=true");
  });

  it("supports package constituents without mixing granule titles, members, or publication dates", async () => {
    const parsed = parseGovinfoCrec(crecPackage);
    expect(parsed.votes).toHaveLength(3); // two events, one unflagged republication
    expect(parsed.ignoredDailyDigest).toBe(1);
    expect(parsed.votes.map((vote) => vote.session)).toEqual([1, 1, 1]);
    expect(parsed.votes[0]).toMatchObject({
      documentDate: "2025-07-23", title: "Synthetic First Nomination Cloture",
      dateLocator: "/mods/originInfo[1]/dateIssued", sessionLocator: "/mods/extension[2]/session",
    });
    expect(parsed.votes[1]).toMatchObject({ documentDate: "2025-07-24", title: "Synthetic Second Nomination Confirmation" });
    const ctx = context({ [crecPackageUrl]: crecPackage }, "C001098");
    const result = await govinfoCrecAdapter.collect(ctx, { urls: [crecPackageUrl] });
    expect(result.actions).toHaveLength(2);
    expect(result.actions.map((action) => [action.date, action.title, action.vote?.value])).toEqual([
      ["2025-07-23", "Synthetic First Nomination Cloture", "yes"],
      ["2025-07-24", "Synthetic Second Nomination Confirmation", "no"],
    ]);
    expect(result.actions[0].provenance).toContainEqual(expect.objectContaining({ locator: "/mods/relatedItem[3]/extension[1]/congVote[1]/congMember[1]" }));
    expect(result.actions[0].provenance).toContainEqual(expect.objectContaining({ locator: "/mods/relatedItem[5]/extension[1]/congVote[1]" }));
    expect(result.actions[0].provenance).toContainEqual(expect.objectContaining({ locator: "/mods/extension[2]/session" }));
    expect(result.actions.every((action) => action.sourceUrl === crecPackageUrl)).toBe(true);
    expect(JSON.stringify(result.actions)).not.toMatch(/PACKAGE TITLE|HOST TITLE|Unrelated House|party|DO-NOT-PROJECT/);
    expect(ctx.get).toHaveBeenCalledTimes(1);
  });

  it("filters package votes by their own inherited/overridden document dates", async () => {
    const ctx = context({ [crecPackageUrl]: crecPackage }, "C001098", { since: "2025-07-01", before: "2025-07-24" });
    const result = await govinfoCrecAdapter.collect(ctx, { urls: [crecPackageUrl] });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].date).toBe("2025-07-23");
    expect(JSON.stringify(result.actions)).not.toContain("Synthetic Second Nomination");
  });

  it("validates the relevant package granule's counts and congress without traversing host votes", () => {
    const badCounts = crecPackage.replace('number="427" yescount="0" nocount="1"', 'number="427" yescount="0" nocount="2"');
    expect(() => parseGovinfoCrec(badCounts)).toThrow(/aggregate/);
    const badCongress = crecPackage.replace('chamber="SENATE" congress="119" number="427"', 'chamber="SENATE" congress="118" number="427"');
    expect(() => parseGovinfoCrec(badCongress)).toThrow(/congress conflicts/);
    const missingGranuleTitle = crecPackage.replace("<titleInfo><title>Synthetic First Nomination Cloture</title></titleInfo>", "");
    expect(() => parseGovinfoCrec(missingGranuleTitle)).toThrow(/neither a question nor a granule title/);
  });

  it("preserves provenance while deduplicating a vote supplied as both a granule and a package", async () => {
    const firstGranule = '<mods><titleInfo><title>Synthetic First Nomination Cloture</title></titleInfo><extension><granuleDate>2025-07-23</granuleDate><congVote chamber="SENATE" congress="119" number="426" yescount="1" nocount="1" nvcount="0"><congMember bioGuideId="C001098" role="VOTED YES"/><congMember bioGuideId="C001099" role="VOTED NO"/></congVote></extension></mods>';
    const ctx = context({ [crecPackageUrl]: crecPackage, [crecUrl]: firstGranule }, "C001098");
    const result = await govinfoCrecAdapter.collect(ctx, { urls: [crecPackageUrl, crecUrl] });
    expect(result.actions).toHaveLength(2);
    expect(new Set(result.actions[0].provenance?.map((ref) => ref.sourceUrl))).toEqual(new Set([crecPackageUrl, crecUrl]));
  });

  it("rejects conflicting duplicate publications, even if aggregate totals still balance", async () => {
    const alternate = `${crecUrl}?edition=2`;
    const conflict = crec.replace('bioGuideId="C001098" role="VOTED YES"', 'bioGuideId="C001098" role="VOTED NO"')
      .replace('bioGuideId="C001099" role="VOTED NO"', 'bioGuideId="C001099" role="VOTED YES"');
    await expect(govinfoCrecAdapter.collect(context({ [crecUrl]: crec, [alternate]: conflict }, "C001098"), { urls: [crecUrl, alternate] })).rejects.toThrow(/Conflicting/);
  });

  it("excludes documents at the cutoff even when a separate vote date is earlier", async () => {
    const ctx = context({ [crecUrl]: crec }, "C001098", { since: "2020-01-01", before: "2025-07-23" });
    expect(await govinfoCrecAdapter.collect(ctx, { urls: [crecUrl] })).toMatchObject({ status: "partial", actions: [] });
  });

  it("stores canonical credential-free snapshot URLs, not configured API-key URLs", async () => {
    const secretUrl = "https://api.govinfo.gov/packages/CREC-2025-07-23/granules/CREC-2025-07-23-pt1-PgS4581-2/mods?api_key=fixture-secret";
    const result = await govinfoCrecAdapter.collect(context({ [secretUrl]: crec }, "C001098"), { urls: [secretUrl] });
    expect(result.actions[0].sourceUrl).toBe(publicUrl(secretUrl));
    expect(JSON.stringify(result.actions)).not.toMatch(/api_key|fixture-secret/);
  });
});

describe("GovInfo BILLSTATUS sponsorship", () => {
  it("emits only the identified primary sponsor's act with introduction-version text", async () => {
    const ctx = context({ [billUrl]: bill });
    const result = await govinfoBillstatusAdapter.collect(ctx, { urls: [billUrl] });
    expect(result.status).toBe("complete");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      id: "us-congress:bill:119:hr:42:authored:C001131:2025-01-09", actorId: "pipeline-person",
      type: "authored", stance: "author", date: "2025-01-09", title: "Synthetic Clean Water Measure",
      officialText: "Synthetic Clean Water Measure\nIntroduced in House", sourceUrl: billUrl,
      attribution: { method: "member_id", sourceActorId: "C001131" },
      provenance: expect.arrayContaining([expect.objectContaining({ locator: "/billStatus/bill/titles/item[2]/title" })]),
    });
    expect(JSON.stringify(result.actions)).not.toMatch(/FUTURE|DO-NOT-PROJECT|party|Passed House|Signed by|Later Display Title/);
    expect(result.actions[0].vote).toBeUndefined();
    expect(ctx.get).toHaveBeenCalledTimes(1); // recordedVotes URLs are not followed or imputed to sponsors.
  });

  it("uses actual late-cosponsor dates, not the introduction date or another person's name", async () => {
    const ctx = context({ [billUrl]: bill }, "C001132", { since: "2025-03-01", before: "2025-04-01" });
    const result = await govinfoBillstatusAdapter.collect(ctx, { urls: [billUrl] });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({ type: "cosponsored", date: "2025-03-15", stance: "n/a", officialText: "Synthetic Clean Water Measure" });
    const beforeAccession = context({ [billUrl]: bill }, "C001132", { since: "2025-01-01", before: "2025-03-15" });
    expect((await govinfoBillstatusAdapter.collect(beforeAccession, { urls: [billUrl] })).actions).toEqual([]);
    const differentPerson = await govinfoBillstatusAdapter.collect(context({ [billUrl]: bill }, "C001199"), { urls: [billUrl] });
    expect(differentPerson).toMatchObject({ status: "partial", actions: [] });
  });

  it("does not backfill missing cosponsor dates even when original-cosponsor metadata is true", async () => {
    const xml = bill.replace("<sponsorshipDate>2025-03-15</sponsorshipDate>", "").replace("<isOriginalCosponsor>False", "<isOriginalCosponsor>True");
    const result = await govinfoBillstatusAdapter.collect(context({ [billUrl]: xml }, "C001132"), { urls: [billUrl] });
    expect(result).toMatchObject({ status: "partial", actions: [] });
    expect(result.reason).toContain("no introduction date was substituted");
  });

  it("excludes sponsorships exactly at the cutoff", async () => {
    const result = await govinfoBillstatusAdapter.collect(context({ [billUrl]: bill }, "C001133"), { urls: [billUrl] });
    expect(result).toMatchObject({ status: "partial", actions: [] });
    expect(result.reason).not.toContain("never held office");
    expect(result.reason).toContain("not proof");
  });

  it("supports legacy identifiers and actions.actions.item without attributing a presidential veto", async () => {
    const result = await govinfoBillstatusAdapter.collect(context({ [legacyUrl]: legacyBill }, "C001098"), { urls: [legacyUrl] });
    expect(result).toMatchObject({ status: "partial", actions: [{ type: "authored", stance: "n/a", date: "2023-02-01", body: "U.S. Senate" }] });
    expect(result.actions[0].officialText).toBe("Synthetic Legacy Water Measure\nIntroduced in Senate");
    expect(result.reason).toContain("By-request");
    expect(result.actions[0].provenance).toContainEqual(expect.objectContaining({ locator: "/billStatus/bill/actions/actions/item[1]" }));
    expect(JSON.stringify(result.actions)).not.toMatch(/FUTURE|Vetoed/);
  });

  it("flags a documented withdrawal without labeling historical cosponsorship as a yes vote", async () => {
    const result = await govinfoBillstatusAdapter.collect(context({ [legacyUrl]: legacyBill }, "C001099"), { urls: [legacyUrl] });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({ type: "cosponsored", date: "2023-05-01", stance: "n/a" });
    expect(result.status).toBe("partial");
    expect(result.reason).toContain("withdrawal is documented on 2023-07-15");
    expect(result.actions[0].officialText).not.toContain("withdraw");
    const early = await govinfoBillstatusAdapter.collect(context({ [legacyUrl]: legacyBill }, "C001099", { since: "2023-01-01", before: "2023-07-01" }), { urls: [legacyUrl] });
    expect(early.status).toBe("complete");
    expect(JSON.stringify(early)).not.toContain("2023-07-15");
    expect(early.reason).not.toContain("withdrawal");
  });

  it("rejects conflicting/missing identity, duplicate sponsors, and impossible sponsorship dates", () => {
    expect(() => parseGovinfoBillstatus(bill.replace("<bioguideId>C001131</bioguideId>", ""))).toThrow();
    expect(() => parseGovinfoBillstatus(bill.replace("<bioguideId>C001132</bioguideId>", "<bioguideId>C001131</bioguideId>"))).toThrow(/Duplicate/);
    expect(() => parseGovinfoBillstatus(bill.replace("<bioguideId>C001131</bioguideId>", "<bioguideId>C001131</bioguideId><identifiers><bioguideId>C001199</bioguideId></identifiers>"))).toThrow(/Conflicting/);
    expect(() => parseGovinfoBillstatus(bill.replace("2025-03-15", "2024-12-31"))).toThrow(/precedes/);
    expect(() => parseGovinfoBillstatus(legacyBill.replace("2023-07-15", "2023-04-01"))).toThrow(/withdrawal precedes/);
  });

  it("accepts empty optional collections and deduplicates supplied bill snapshots", async () => {
    const xml = bill.replace(/<cosponsors>[\s\S]*?<\/cosponsors>/, "<cosponsors/>");
    const other = `${billUrl}?edition=2`;
    const result = await govinfoBillstatusAdapter.collect(context({ [billUrl]: xml, [other]: xml }), { urls: [billUrl, other] });
    expect(result.actions).toHaveLength(1);
    expect(new Set(result.actions[0].provenance?.map((ref) => ref.sourceUrl))).toEqual(new Set([billUrl, other]));
  });
});
