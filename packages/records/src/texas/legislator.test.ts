import { describe, expect, it, vi } from "vitest";
import type { CandidateResearchRequest } from "@ftb/types";
import type { AdapterContext } from "../adapters";
import { publicUrl, sha256 } from "../fetch";
import type { SnapshotClient } from "../fetch";
import type { Snapshot } from "../model";
import {
  displayNameFor, houseJournalDayUrl, journalLabelsFor, nameTokens, selectContestedVotes, parseMemberInfoName, parseRoster,
  progressRank, rankAuthored, sameFullName, txLegislatorAdapter,
} from "./legislator";
import type { TloReportRow } from "./reports";
import { tloReportUrl } from "./reports";
import { texasSessionCodes } from "./sessions";

describe("name matching", () => {
  it("compares first and last names, ignoring accents, middle names, suffixes and nicknames", () => {
    expect(sameFullName("Gina Hinojosa", "Gina  Hinojosa")).toBe(true);
    expect(sameFullName("Lauren B. Peña", "Lauren Pena")).toBe(true);
    expect(sameFullName("Zohaib \"Zo\" Qadri", "Zohaib Qadri")).toBe(true);
    expect(sameFullName("Joe Smith Jr.", "Joe Smith")).toBe(true);
    expect(sameFullName("Gina Hinojosa", "Gary Hinojosa")).toBe(false);
    expect(sameFullName("Hinojosa", "Gina Hinojosa")).toBe(false);
    expect(nameTokens("Zohaib \"Zo\" Qadri")).toEqual(["zohaib", "qadri"]);
  });

  it("derives the House Journal labels from the TLO display name", () => {
    expect(journalLabelsFor("Hinojosa")).toEqual(["Hinojosa"]);
    expect(journalLabelsFor("Bell, Cecil")).toEqual(["Bell, C.", "Bell"]);
    expect(journalLabelsFor("Gutiérrez, Álvaro")).toEqual(["Gutiérrez, A.", "Gutiérrez"]);
  });

  it("keeps only contested votes, closest first, bounded by the cap", () => {
    const vote = (id: string, yes: number, no: number, date = "2025-01-01") => ({ id, date, margin: { yes, no } }) as never;
    const picked = selectContestedVotes([vote("a", 140, 5), vote("b", 75, 70), vote("c", 100, 45), vote("d", 150, 0)], 2);
    expect(picked.map((a) => a.id)).toEqual(["b", "c"]);
    expect(selectContestedVotes([vote("a", 140, 5), vote("b", 75, 70)], 0).map((a) => a.id)).toEqual(["b"]);
  });
});

const authoredRow = (bill: string, authors: string[], lastActionText: string): TloReportRow => ({
  bill, billType: bill.split(" ")[0], billNumber: Number(bill.split(" ")[1]), billUrl: "https://capitol.texas.gov/x",
  authors, sponsors: [], lastActionDate: "2025-03-07", lastActionText, caption: "c", section: "author",
});

describe("authored-bill selection", () => {
  it("ranks bills that advanced furthest first, then by bill number, and skips unknown bill types", () => {
    const rows = [
      authoredRow("HB 900", ["Hinojosa"], "H Referred to Education"),
      authoredRow("HB 5", ["Hinojosa"], "E Effective on 9/1/25"),
      authoredRow("HB 7", ["Hinojosa"], "H Reported favorably"),
      authoredRow("HB 3", ["Hinojosa"], "H Referred to Elections"),
      { ...authoredRow("HB 1", ["Hinojosa"], "H Referred"), billType: "ZZ" },
    ];
    expect(rankAuthored(rows, 3).map((r) => r.bill)).toEqual(["HB 5", "HB 7", "HB 3"]);
    expect(progressRank("H Referred to X")).toBe(1);
    expect(progressRank("E Signed by the Governor")).toBe(5);
  });

  it("finds the member's own display name as the author token common to every row", () => {
    const rows = [
      authoredRow("HB 1", ["Hinojosa", "Reynolds"], "x"),
      authoredRow("HB 2", ["Hinojosa"], "x"),
      authoredRow("HB 3", ["Cole", "Hinojosa"], "x"),
    ];
    expect(displayNameFor(rows, "hinojosa")).toBe("Hinojosa");
    expect(displayNameFor([authoredRow("HB 1", ["Bell, Cecil", "Cole"], "x")], "bell")).toBe("Bell, Cecil");
    // Two surname matches in common: fail closed rather than guess.
    expect(displayNameFor([authoredRow("HB 1", ["Garcia, Ina", "Garcia, Mary"], "x")], "garcia")).toBeUndefined();
    expect(displayNameFor([], "x")).toBeUndefined();
  });
});

describe("TLO roster and member pages", () => {
  it("parses roster links and the member's printed full name", () => {
    const html = `<ul><li><a href='MemberInfo.aspx?Leg=89&Chamber=H&Code=A3210'>
        Hinojosa
      </a></li><li><a href='MemberInfo.aspx?Leg=89&Chamber=H&Code=A2335'>Bell, Cecil</a></li>
      <li><a href='MemberInfo.aspx?Leg=89&Chamber=S&Code=A0100'>Eckhardt</a></li></ul>`;
    expect(parseRoster(html, "H")).toEqual([
      { label: "Hinojosa", code: "A3210", chamber: "H" }, { label: "Bell, Cecil", code: "A2335", chamber: "H" },
    ]);
    expect(parseMemberInfoName("<h1>Information for Rep. Gina Hinojosa</h1><div>Legislature: &nbsp; 89th Legislature</div>"))
      .toEqual({ title: "Rep.", name: "Gina Hinojosa" });
  });

  it("builds zero-padded House Journal day URLs and session codes", () => {
    expect(houseJournalDayUrl("89R", 1)).toBe("https://journals.house.texas.gov/hjrnl/89r/html/89RDAY01FINAL.HTM");
    expect(houseJournalDayUrl("85R", 100)).toBe("https://journals.house.texas.gov/hjrnl/85r/html/85RDAY100FINAL.HTM");
    expect(texasSessionCodes(2023, 2026)).toEqual(["892", "891", "89R", "884", "883", "882", "881", "88R"]);
    expect(texasSessionCodes(2015, 2016)).toEqual(["84R"]);
  });
});

function contextFor(pages: Record<string, string>, name = "Gina Hinojosa") {
  const get = vi.fn(async (url: string, options: { format: string }): Promise<Snapshot> => {
    const text = pages[url];
    if (text === undefined) throw new Error(`HTTP 404: ${url}`);
    return {
      id: sha256(`${publicUrl(url)}:${text}`), sourceUrl: publicUrl(url), fetchedAt: "2026-10-25T00:00:00Z",
      contentHash: sha256(text), format: options.format as Snapshot["format"], text,
    };
  });
  const request: CandidateResearchRequest = {
    candidate: { id: "gov-gina", name },
    position: { office: "governor", jurisdiction: "us/tx", district: "TX" }, month: 11, year: 2026,
  };
  const context: AdapterContext = {
    request, window: { since: "2025-01-01", before: "2026-11-01" }, client: { get } as unknown as SnapshotClient,
  };
  return { context, get };
}

const roster = (code: string, label: string) => `<a href='MemberInfo.aspx?Leg=89&Chamber=H&Code=${code}'>${label}</a>`;
const info = (title: string, name: string) => `<h1>Information for ${title} ${name}</h1> Legislature: 89th Legislature`;
const TLO = "https://capitol.texas.gov";

describe("txLegislatorAdapter identity gate", () => {
  it("fails closed when no current member has the candidate's exact full name", async () => {
    const { context } = contextFor({
      [`${TLO}/Members/Members.aspx?Chamber=H`]: roster("A3210", "Hinojosa"),
      [`${TLO}/Members/Members.aspx?Chamber=S`]: "",
      [`${TLO}/Members/MemberInfo.aspx?Leg=89&Chamber=H&Code=A3210`]: info("Rep.", "Gary Hinojosa"),
    });
    const result = await txLegislatorAdapter.collect(context, { includeJournals: false });
    expect(result).toMatchObject({ status: "needs_review", actions: [] });
    expect(result.reason).toContain("No exact full-name match");
  });

  it("fails closed when several current members share the name", async () => {
    const { context } = contextFor({
      [`${TLO}/Members/Members.aspx?Chamber=H`]: roster("A1", "Hinojosa") + roster("A2", "Hinojosa, Gina"),
      [`${TLO}/Members/Members.aspx?Chamber=S`]: "",
      [`${TLO}/Members/MemberInfo.aspx?Leg=89&Chamber=H&Code=A1`]: info("Rep.", "Gina Hinojosa"),
      [`${TLO}/Members/MemberInfo.aspx?Leg=89&Chamber=H&Code=A2`]: info("Rep.", "Gina Hinojosa"),
    });
    const result = await txLegislatorAdapter.collect(context, { includeJournals: false });
    expect(result.status).toBe("needs_review");
    expect(result.reason).toContain("Ambiguous");
  });

  it("resolves the member and skips sessions whose author report names someone else", async () => {
    const { context, get } = contextFor({
      [`${TLO}/Members/Members.aspx?Chamber=H`]: roster("A3210", "Hinojosa"),
      [`${TLO}/Members/Members.aspx?Chamber=S`]: "",
      [`${TLO}/Members/MemberInfo.aspx?Leg=89&Chamber=H&Code=A3210`]: info("Rep.", "Gina Hinojosa"),
      [tloReportUrl("89R", "author", "A3210")]:
        `<html><head><title>x</title></head><body><h2>Bills Authored / Joint Authored</h2><span class="TitleItem">Rep. Someone Else</span>` +
        `<a name="author"></a><div class="bill-search-results"><div class="row"><div class="bill-search-result-label"><a href="http://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&amp;Bill=HB1">HB 1</a></div>` +
        `<div class="bill-search-result-label"><b>Last Action:</b></div><div class="bill-search-result-data">03/07/2025 H Referred</div></div></div></body></html>`,
    });
    const result = await txLegislatorAdapter.collect(context, { sessions: ["89R"], includeJournals: false });
    expect(result.actions).toEqual([]);
    expect(result.reason).toContain("does not match Gina Hinojosa; skipped");
    expect(get.mock.calls.some((call) => String(call[0]).includes("ftp:"))).toBe(false);
  });
});

describe("LRL directory and journal labels", () => {
  const profileHtml = `<h1>Full Name: Warren Kenneth &quot;Ken&quot; Paxton, Jr.</h1>
    <h3>Terms of Service</h3>
    <table><tr>\n<th>Chamber</th>\n<th>District</th>\n<th>Dates of Service</th>\n<th>Legislatures</th>\n</tr>
    <tr>\n<td>S</td>\n<td>16</td>\n<td>Jan 14, 2025 - Jan 9, 2029</td>\n<td>90th 89th</td>\n</tr>
    <tr>\n<td>H</td>\n<td>70</td>\n<td>Jan 11, 2011 - Jan 8, 2013</td>\n<td>82nd (1)</td>\n</tr></table>`;

  it("parses terms (multi-legislature rows) and nickname-aware names", async () => {
    const { parseLrlProfile, chamberInLegislature } = await import("./lrl");
    const profile = parseLrlProfile(profileHtml)!;
    expect(profile.nickname).toBe("Ken");
    expect(profile.terms.map((t) => [t.chamber, t.district, t.legislatures])).toEqual([["S", "16", [90, 89]], ["H", "70", [82]]]);
    expect(chamberInLegislature(profile, 89)).toBe("S");
    expect(chamberInLegislature(profile, 82)).toBe("H");
    expect(chamberInLegislature(profile, 85)).toBeUndefined();
    const { lrlNameMatches } = await import("./legislator");
    expect(lrlNameMatches(["Ken Paxton"], profile)).toBe(true);
    expect(lrlNameMatches(["Angela Paxton"], profile)).toBe(false);
  });

  it("builds chamber-specific journal labels with initials", async () => {
    const { nameJournalLabels } = await import("./legislator");
    expect(nameJournalLabels(["Ken Paxton"], "H", ["Warren"]).sort()).toEqual(["Paxton", "Paxton, K.", "Paxton, W."]);
    expect(nameJournalLabels(["Sarah Eckhardt"], "S")).toEqual(["Eckhardt", "S. Eckhardt"]);
  });
});
