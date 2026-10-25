import { describe, expect, it, vi } from "vitest";
import type { CandidateResearchRequest } from "@ftb/types";
import type { AdapterContext } from "../adapters";
import { publicUrl, sha256 } from "../fetch";
import type { SnapshotClient } from "../fetch";
import type { Snapshot } from "../model";
import { parseTloReport, tloGovernorReportAdapter, tloReportUrl } from "./reports";

const row = (bill: string, authors: string, action: string, caption: string, session = "89R") => `
        <div class="row">
          <div class="bill-search-result-label"><a href="http://capitol.texas.gov/BillLookup/History.aspx?LegSess=${session}&amp;Bill=${bill.replace(" ", "")}">${bill}  </a></div>
          <div class="bill-search-result-data"></div>
          <div class="bill-search-result-data"><b>Author</b>:
		</div>
          <div class="bill-search-result-data">${authors}</div>
          <div class="bill-search-result-label"><b>Last Action:</b></div>
          <div class="bill-search-result-data">${action}</div>
          <div class="bill-search-result-label"><b>Caption</b>:
		</div>
          <div class="bill-search-result-data">${caption}</div>
        </div>`;

const page = (title: string, rows: string[], subject = "") => `<html lang="en-US"><head><title>${title}</title></head><body><main>
  <center><h2>${title}</h2></center><center><span class="TitleItem">${subject}</span></center>
  <center><span class="TitleSubItem">89th Legislature Regular Session</span></center>
  <div class="bill-search-results">${rows.join("")}</div></main></body></html>`;

describe("parseTloReport", () => {
  it("reads bill rows, author lists and dated last actions", () => {
    const report = parseTloReport(page("Bills Vetoed by the Governor", [
      row("HB 305", "Hayes", "06/22/2025 E Vetoed by the Governor", "Relating to hearings."),
      row("HB 413", "Jones, Jolanda | Curry", "06/22/2025 E Vetoed by the Governor", "Relating to release."),
    ]));
    expect(report.rows).toHaveLength(2);
    expect(report.rows[1]).toMatchObject({
      bill: "HB 413", billType: "HB", billNumber: 413, authors: ["Jones, Jolanda", "Curry"],
      lastActionDate: "2025-06-22", lastActionText: "E Vetoed by the Governor",
      billUrl: "https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=HB413",
    });
  });

  it("partitions member reports into authored and joint-authored sections", () => {
    const html = page("Bills Authored / Joint Authored", []).replace(
      '<div class="bill-search-results">',
      `<a name="author"></a><div class="bill-search-results">${row("HB 1", "Hinojosa", "03/07/2025 H Referred", "A.")}</div>` +
      `<a name="jointauthor"></a><div class="bill-search-results">${row("HR 2", "Flores | Hinojosa", "04/21/2025 H Reported enrolled", "B.")}`,
    );
    const report = parseTloReport(html);
    expect(report.rows.map((r) => [r.bill, r.section])).toEqual([["HB 1", "author"], ["HR 2", "jointauthor"]]);
  });

  it("rejects pages with no title or an unrecognised bill label", () => {
    expect(() => parseTloReport("<html><body>nope</body></html>")).toThrow(/no title/);
    expect(() => parseTloReport(page("X", [row("Bill One", "A", "01/01/2025 x", "c")]))).toThrow(/Unrecognised bill label/);
  });

  it("builds canonical, validated report URLs", () => {
    expect(tloReportUrl("89R", "author", "A3210")).toBe("https://capitol.texas.gov/reports/report.aspx?LegSess=89R&ID=author&Code=A3210");
    expect(() => tloReportUrl("89X", "author")).toThrow();
    expect(() => tloReportUrl("89R", "author", "../x")).toThrow();
  });
});

function contextFor(pages: Record<string, string>, window = { since: "2003-01-01", before: "2026-11-01" }) {
  const get = vi.fn(async (url: string, options: { format: string }): Promise<Snapshot> => {
    const text = pages[url];
    if (text === undefined) throw new Error(`HTTP 404: ${url}`);
    return {
      id: sha256(`${publicUrl(url)}:${text}`), sourceUrl: publicUrl(url), fetchedAt: "2026-10-25T00:00:00Z",
      contentHash: sha256(text), format: options.format as Snapshot["format"], text,
    };
  });
  const request: CandidateResearchRequest = {
    candidate: { id: "gov-abbott", name: "Greg Abbott" },
    position: { office: "governor", jurisdiction: "us/tx", district: "TX" }, month: 11, year: 2026,
  };
  return { context: { request, window, client: { get } as unknown as SnapshotClient } satisfies AdapterContext, get };
}

describe("tloGovernorReportAdapter", () => {
  const tenure = { candidateId: "gov-abbott", start: "2015-01-20", sourceUrl: "https://www.tsl.texas.gov/ref/abouttx/governors.html" };

  it("emits vetoes and priority-range signings within tenure, ignoring the other governor and non-priority bills", async () => {
    const { context, get } = contextFor({
      [tloReportUrl("89R", "vetoedbygov")]: page("Bills Vetoed by the Governor", [
        row("HB 305", "Hayes", "06/22/2025 E Vetoed by the Governor", "Relating to hearings."),
      ]),
      [tloReportUrl("89R", "signedbygov")]: page("Bills Signed by the Governor", [
        row("HB 2", "Buckley", "06/20/2025 E See remarks for effective date", "Relating to school finance."),
        row("HB 1157", "Hinojosa", "06/20/2025 E Effective on 9/1/25", "Not a priority number."),
        row("SCR 53", "Schwertner", "06/20/2025 E Signed by the Governor", "A resolution."),
      ]),
      // 84R straddles nothing here; the earlier governor's vetoes in a pre-tenure session are never requested.
    });
    const result = await tloGovernorReportAdapter.collect(context, { sessions: ["89R", "83R"], tenure });
    expect(get.mock.calls.map((call) => call[0]).some((url) => url.includes("83R"))).toBe(false);
    expect(result.actions.map((a) => [a.type, a.date, a.title.slice(0, 5)])).toEqual([
      ["signed", "2025-06-20", "HB 2:"],
      ["vetoed", "2025-06-22", "HB 30"],
    ]);
    const veto = result.actions.find((a) => a.type === "vetoed")!;
    expect(veto).toMatchObject({
      stance: "n/a", actorId: "gov-abbott", extraction: "html", dateBasis: "action_date",
      measureUrl: "https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=HB305",
      attribution: { method: "office_tenure", tenure: { start: "2015-01-20" } },
    });
    expect(veto.provenance?.[0].locator).toMatch(/^text:\d+-\d+$/);
    expect(result.reason).toContain("2 other signings were not emitted");
  });

  it("drops actions outside the verified tenure and rejects a tenure bound to another candidate", async () => {
    const { context } = contextFor({
      [tloReportUrl("84R", "vetoedbygov")]: page("Bills Vetoed by the Governor", [
        row("HB 9", "X", "01/10/2015 E Vetoed by the Governor", "Before Abbott took office.", "84R"),
        row("HB 10", "Y", "06/20/2015 E Vetoed by the Governor", "After.", "84R"),
      ]),
    });
    const result = await tloGovernorReportAdapter.collect(context, { sessions: ["84R"], signedPriorityMax: 0, tenure });
    expect(result.actions.map((a) => a.date)).toEqual(["2015-06-20"]);
    const wrong = await tloGovernorReportAdapter.collect(context, { tenure: { ...tenure, candidateId: "someone-else" } });
    expect(wrong).toMatchObject({ status: "needs_review", actions: [] });
  });

  it("reports an unavailable source instead of an empty success", async () => {
    const { context } = contextFor({});
    const result = await tloGovernorReportAdapter.collect(context, { sessions: ["89R"], tenure });
    expect(result.status).toBe("unavailable");
    expect(result.actions).toEqual([]);
  });
});
