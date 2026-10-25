import { describe, expect, it, vi } from "vitest";
import type { CandidateResearchRequest } from "@ftb/types";
import type { AdapterContext } from "../adapters";
import { sha256 } from "../fetch";
import type { SnapshotClient } from "../fetch";
import type { Snapshot } from "../model";
import { lrlGovernorOrdersAdapter, lrlGovernorSearchUrl, parseLrlGovernorDocuments } from "./lrl-governor-orders";

const row = (href: string, title: string, author: string, date: string, session: string) => `
<tr><td><a href="${href}">${title}</a><span class="mobileShow"><br>(Type: Executive order)</span></td>
<td>${author}</td><td>${date} </td><td>${session}</td><td class="mobileHide">Executive order<br></td></tr>`;

const listing = `<html><body><table><tbody>
${row("/scanned/govdocs/Greg%20Abbott/2026/GA-57.pdf", "Executive Order GA-57 Relating to coordinated efforts to eliminate unlawful birth tourism scheme in Texas", "Greg Abbott", "07/21/2026", "89th R.S.")}
${row("http://www.lrl.state.tx.us/scanned/govdocs/Greg Abbott/2025/GA-56.pdf", "Executive Order GA-56 Relating to protecting children from hemp", "Greg Abbott", "09/10/2025", "89th R.S.")}
${row("/scanned/govdocs/Rick%20Perry/2014/RP-80.pdf", "Executive Order RP-80 Relating to E-Verify", "Rick Perry", "12/03/2014", "83rd R.S.")}
</tbody></table></body></html>`;
const abbottOnly = listing.replace(/<tr><td><a href="\/scanned\/govdocs\/Rick[\s\S]*?<\/tr>/, "");
const pdf57 = "Pursuant to his powers as Governor, Greg Abbott has issued the following:\nExecutive Order No. GA-57 relating to coordinated efforts";
const listingUrl = lrlGovernorSearchUrl(45, 5);

function contextFor(pages: Record<string, string>, window = { since: "2025-01-01", before: "2026-11-01" }) {
  const get = vi.fn(async (url: string, options: { format: string }): Promise<Snapshot> => {
    const text = pages[url];
    if (text === undefined) throw new Error(`HTTP 404: ${url}`);
    return { id: sha256(`${url}:${text}`), sourceUrl: url, fetchedAt: "2026-10-25T00:00:00Z", contentHash: sha256(text), format: options.format as Snapshot["format"], text };
  });
  const request: CandidateResearchRequest = {
    candidate: { id: "gov-abbott", name: "Greg Abbott" },
    position: { office: "governor", jurisdiction: "us/tx", district: "TX" }, month: 11, year: 2026,
  };
  return { context: { request, window, client: { get } as unknown as SnapshotClient } as AdapterContext, get };
}

const config = {
  authorId: 45, authorName: "Greg Abbott",
  tenure: { candidateId: "gov-abbott", start: "2015-01-20", sourceUrl: "https://www.tsl.texas.gov/ref/abouttx/governors.html" },
};

describe("LRL governor orders", () => {
  it("parses rows from both the current and legacy LRL link hosts", () => {
    const rows = parseLrlGovernorDocuments(listing);
    expect(rows.map((r) => [r.orderId, r.date, r.url])).toEqual([
      ["GA-57", "2026-07-21", "https://lrl.texas.gov/scanned/govdocs/Greg%20Abbott/2026/GA-57.pdf"],
      ["GA-56", "2025-09-10", "https://lrl.texas.gov/scanned/govdocs/Greg%20Abbott/2025/GA-56.pdf"],
      ["RP-80", "2014-12-03", "https://lrl.texas.gov/scanned/govdocs/Rick%20Perry/2014/RP-80.pdf"],
    ]);
  });

  it("emits dated tenure-attributed orders; a matching PDF becomes extra provenance and the source", async () => {
    const { context } = contextFor({
      [listingUrl]: abbottOnly,
      "https://lrl.texas.gov/scanned/govdocs/Greg%20Abbott/2026/GA-57.pdf": pdf57,
    });
    const result = await lrlGovernorOrdersAdapter.collect(context, config);
    expect(result.status).toBe("complete");
    expect(result.actions.map((a) => [a.date, a.type, a.extraction])).toEqual([
      ["2026-07-21", "executive_order", "pdf"], ["2025-09-10", "executive_order", "html"],
    ]);
    expect(result.actions[0]).toMatchObject({ attribution: { method: "office_tenure" }, sourceUrl: "https://lrl.texas.gov/scanned/govdocs/Greg%20Abbott/2026/GA-57.pdf" });
    expect(result.actions[0].provenance).toHaveLength(2);
    expect(result.actions[1].provenance).toHaveLength(1);
  });

  it("skips orders outside the verified tenure and rows by another author", async () => {
    const mixed = `${listing}${row("/scanned/govdocs/Greg%20Abbott/2010/GA-00.pdf", "Executive Order GA-00 Old", "Greg Abbott", "01/01/2010", "81st R.S.")}${row("/scanned/govdocs/X/1.pdf", "Executive Order XX-1 Other", "Someone Else", "02/02/2025", "89th R.S.")}`;
    const { context } = contextFor({ [listingUrl]: mixed }, { since: "2003-01-01", before: "2026-11-01" });
    const result = await lrlGovernorOrdersAdapter.collect(context, { ...config, fetchDocuments: false });
    expect(result.actions.map((a) => a.title.slice(0, 21))).toEqual(["Executive Order GA-57", "Executive Order GA-56"]);
    expect(result.status).toBe("partial");
  });

  it("requires the tenure to belong to the request candidate", async () => {
    const { context } = contextFor({ [listingUrl]: listing });
    const result = await lrlGovernorOrdersAdapter.collect(context, { ...config, tenure: { ...config.tenure, candidateId: "someone-else" } });
    expect(result).toMatchObject({ status: "needs_review", actions: [] });
  });
});
