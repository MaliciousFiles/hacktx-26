import { describe, expect, it } from "vitest";
import { pages, sourceDateSchema } from "./common";
import { mockContext } from "./test-helpers";

const endpoint = new URL("https://county.example.gov/v1/Events?$filter=date%20ge%202026-01-01&$orderby=date,id");

describe("local JSON paging safeguards", () => {
  it("accepts a complete counted page without an unnecessary empty-page request", async () => {
    const { context, urls } = mockContext(() => ({ value: [1, 2], "@odata.count": 2 }));
    const result = await pages({ context, url: endpoint, pageSize: 2, maxPages: 1, parse: Number });
    expect(result.complete).toBe(true);
    expect(result.rows.map((row) => row.value)).toEqual([1, 2]);
    expect(urls).toHaveLength(1);
  });

  it("reports a count/row discrepancy rather than declaring a short page complete", async () => {
    const { context } = mockContext(() => ({ value: [1], "@odata.count": 4 }));
    const result = await pages({ context, url: endpoint, pageSize: 2, maxPages: 1, parse: Number });
    expect(result.complete).toBe(false);
    expect(result.problems.join(" ")).toMatch(/count/);
  });

  it("detects a looping continuation and does not fetch a page twice", async () => {
    const { context, urls } = mockContext(() => ({ value: [1], "@odata.nextLink": "?$skiptoken=loop" }));
    const result = await pages({ context, url: endpoint, pageSize: 2, maxPages: 5, parse: Number });
    expect(result.complete).toBe(false);
    expect(result.problems.join(" ")).toMatch(/repeated a page URL/);
    expect(urls).toHaveLength(2);
  });

  it("rejects a continuation that changes the requested filter", async () => {
    const { context, urls } = mockContext(() => ({ value: [1], "@odata.nextLink": "?$filter=date%20ge%202030-01-01" }));
    const result = await pages({ context, url: endpoint, pageSize: 2, maxPages: 5, parse: Number });
    expect(result.complete).toBe(false);
    expect(urls).toHaveLength(1);
  });

  it("reports publisher error objects as schema errors", async () => {
    const { context } = mockContext(() => ({ error: { message: "Invalid query" } }));
    const result = await pages({ context, url: endpoint, pageSize: 2, maxPages: 5, parse: Number });
    expect(result.complete).toBe(false);
    expect(result.rows).toEqual([]);
    expect(result.problems.join(" ")).toMatch(/schema error/);
  });

  it.each(["2026-02-30", "2026-01-01Tgarbage", "2026-01-01T25:00:00", "not a date"])("rejects invalid source date %s", (date) => {
    expect(sourceDateSchema.safeParse(date).success).toBe(false);
  });

  it.each(["2026-01-01", "2026-01-01T00:00:00", "2026-01-01T00:00:00.1234567Z"])("accepts source date %s", (date) => {
    expect(sourceDateSchema.parse(date)).toBe("2026-01-01");
  });
});
