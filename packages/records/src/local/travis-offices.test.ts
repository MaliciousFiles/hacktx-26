import { describe, expect, it, vi } from "vitest";
import { countyCourtLinks, officeIdentityMatches, travisOfficeRecordsAdapter, TRAVIS_OFFICE_SEEDS } from "./travis-offices";
import { sha256, type SnapshotClient } from "../fetch";
import type { AdapterContext } from "../adapters";

describe("non-voting county office context", () => {
  it("binds names from official headings, not a distribution-list mention", () => {
    expect(officeIdentityMatches('<h2>The Honorable Tanisa Jeffers</h2>', ["Tanisa Jeffers"])).toBe(true);
    expect(officeIdentityMatches('<h3>Dolores Ortega Carter, Treasurer</h3>', ["Dolores Ortega Carter"])).toBe(true);
    expect(officeIdentityMatches('<p>Dyana Limon-Mercado is the newly elected County Clerk.</p>', ["Dyana Limon-Mercado"])).toBe(true);
    expect(officeIdentityMatches('<p>Distribution: Tanisa Jeffers</p>', ["Tanisa Jeffers"])).toBe(false);
    expect(officeIdentityMatches('<h2>The Honorable Another Jeffers</h2>', ["Tanisa Jeffers"])).toBe(false);
  });
  it("keeps court traversal on official profile pages, never case searches or outside hosts", () => {
    const base = "https://www.traviscountytx.gov/courts/civil";
    const result = countyCourtLinks('<a href="/courts/civil/district/126">Court</a><a href="/justices-of-peace/jp5">JP</a><a href="https://evil.example/courts/civil/district/126">Other</a><a href="/courts/criminal/docket-search">Cases</a>', base);
    expect(result).toEqual(["https://www.traviscountytx.gov/courts/civil/district/126", "https://www.traviscountytx.gov/justices-of-peace/jp5"]);
  });
  it("collects office reports as unscored context with unknown dates and explicit failed/budget counts", async () => {
    const pages: Record<string, string> = {
      [TRAVIS_OFFICE_SEEDS[0].url]: "<html><h2>Velva Price</h2></html>",
      [TRAVIS_OFFICE_SEEDS[0].archive]: '<html><a href="/report1.pdf">Monthly Fee Report</a><a href="/report2.pdf">Monthly Fee Report</a></html>',
      "https://www.traviscountytx.gov/report1.pdf": "Official office report, not a personal action",
    };
    const get = vi.fn(async (url: string, options: { format: "html" | "pdf" }) => {
      if (!(url in pages)) throw new Error("HTTP 404");
      return { id: sha256(url), sourceUrl: url, contentHash: sha256(pages[url]), fetchedAt: "2026-10-25T00:00:00Z", format: options.format, text: pages[url] };
    });
    const ctx: AdapterContext = { request: { candidate: { id: "price", name: "Velva Price" }, position: { office: "district_clerk", jurisdiction: "us/tx" }, month: 11, year: 2026 }, window: { since: "2020-01-01", before: "2026-11-01" }, client: { get } as unknown as SnapshotClient };
    const result = await travisOfficeRecordsAdapter.collect(ctx, { maxDocuments: 1, maxPages: 1 });
    expect(result.actions).toEqual([]);
    expect(result.documents).toHaveLength(3);
    expect(result.documents?.every((d) => d.reviewRequired && d.date === null && d.relationship === "office_context")).toBe(true);
    expect(result.reason).toContain("1 beyond document budget");
    expect(result.status).toBe("partial");
  });
});
