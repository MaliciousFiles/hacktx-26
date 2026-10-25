import { describe, expect, it } from "vitest";
import { buildHistoryPlan } from "./plan";

const base = {
  candidate: { id: "c1", name: "Greg Casar" },
  month: 11,
  year: 2026,
} as const;

function adapters(plan: ReturnType<typeof buildHistoryPlan>["plan"]): string[] {
  return [...new Set(plan.sources.map((source) => source.adapter))];
}

describe("buildHistoryPlan", () => {
  it("uses published House inventories and earlier federal years without selection caps in exhaustive mode", () => {
    const { plan, gaps } = buildHistoryPlan({ ...base, position: { office: "us_house", jurisdiction: "us/tx" } }, { since: "2015-01-01", exhaustive: true });
    expect(plan.exhaustive).toBe(true);
    // Roll calls are the one unbounded-per-year source: the default operator scope is the last 2 years.
    const rollYears = plan.sources.filter((s) => s.adapter === "house-clerk").map((s) => s.id);
    expect(rollYears).toEqual(["house-clerk-2025", "house-clerk-2026"]);
    expect(plan.sources.find((s) => s.id === "house-clerk-2025")?.discovery?.kind).toBe("house-clerk-index");
    // Senate roll calls (Congressional Record) follow the same 2-year roll-call scope as the House.
    const crecYears = plan.sources.filter((s) => s.adapter === "govinfo-crec").map((s) => s.id);
    expect(crecYears).toEqual(["govinfo-crec-2025", "govinfo-crec-2026"]);
    expect(plan.sources.some((s) => s.adapter === "tlo-billhistory")).toBe(false);
    expect(plan.sources.some((s) => s.adapter === "tx-legislator")).toBe(true);
    expect(gaps.some((gap) => /House roll-call votes are scoped to the 2 most recent/.test(gap))).toBe(true);
  });
  it("widens the House roll-call scope only when houseRollYears is raised explicitly", () => {
    const { plan } = buildHistoryPlan({ ...base, position: { office: "us_house", jurisdiction: "us/tx" } }, { since: "2015-01-01", exhaustive: true, houseRollYears: 6 });
    const rollYears = plan.sources.filter((s) => s.adapter === "house-clerk").map((s) => s.id);
    expect(rollYears[0]).toBe("house-clerk-2021");
    expect(rollYears.at(-1)).toBe("house-clerk-2026");
  });
  it("probes every supported office family regardless of race sought", () => {
    const { plan, rationale, gaps } = buildHistoryPlan(
      {
        ...base,
        position: { office: "us_senate", jurisdiction: "us/tx" },
      },
      { since: "2025-01-01", houseRollCap: 20, documentCap: 5 },
    );

    expect(plan.identity?.provider).toBe("house");
    expect(adapters(plan)).toEqual(
      expect.arrayContaining(["house-clerk", "govinfo-billstatus", "govinfo-crec"]),
    );
    // No upstream-verified district → the dataset-resolving adapter, never a name-only socrata source.
    expect(plan.sources.some((source) => source.adapter === "socrata-votes")).toBe(false);
    expect(plan.sources.some((source) => source.adapter === "austin-council-votes")).toBe(true);
    expect(gaps.some((gap) => /Austin Council votes cover 2023 onward/.test(gap))).toBe(true);
    // Casar is House, not on OAG series — no AG source, honest gap
    expect(plan.sources.some((source) => source.adapter === "ag-opinions")).toBe(false);
    expect(gaps.some((gap) => /OAG opinion series/i.test(gap))).toBe(true);
    expect(gaps.some((gap) => /TLO bill-history/i.test(gap))).toBe(true);
    expect(plan.sources.some((source) => source.adapter === "tx-legislator")).toBe(true);
    expect(plan.sources.find((source) => source.adapter === "tx-court-opinions")?.config).toEqual({});
    for (const kind of ["acc-board-minutes", "aisd-board-minutes", "travis-office-records"]) {
      expect(plan.sources.find((source) => source.adapter === kind)?.config).toMatchObject({ maxDocuments: 5 });
    }
    expect(plan.sources.find((source) => source.id === "travis-commissioners-court")?.config).toMatchObject({ baseUrl: "https://traviscotx.api.civicclerk.com/v1" });
    expect(gaps.some((gap) => /former members/i.test(gap))).toBe(true);
    expect(gaps.some((gap) => /executive orders/i.test(gap))).toBe(true);
    expect(gaps.some((gap) => /judicial/i.test(gap))).toBe(true);
    expect(rationale[0]).toMatch(/bioguide identity/i);
    expect(rationale.some((line) => /Bounded history scan/i.test(line))).toBe(true);
    expect(gaps.some((line) => /2023 onward/.test(line))).toBe(true);
  });

  it("for Ken Paxton us_senate still includes House+Senate probes plus AG opinions by name", () => {
    const { plan } = buildHistoryPlan(
      {
        ...base,
        candidate: { id: "c3", name: "Ken Paxton" },
        position: { office: "us_senate", jurisdiction: "us/tx" },
      },
      { since: "2025-01-01", documentCap: 5 },
    );
    expect(plan.identity?.provider).toBe("house");
    expect(plan.sources.some((source) => source.adapter === "house-clerk")).toBe(true);
    expect(plan.sources.some((source) => source.adapter === "govinfo-crec")).toBe(true);
    expect(plan.sources.some((source) => source.adapter === "ag-opinions")).toBe(true);
    expect(plan.sources.some((source) => source.adapter === "socrata-votes")).toBe(false);
  });

  it("binds Austin council votes to a verified prior district, never name alone", () => {
    const { plan } = buildHistoryPlan(
      {
        ...base,
        candidate: { id: "c1", name: "Greg Casar", identifiers: { austin_council_district: "4" } },
        position: { office: "us_house", jurisdiction: "us/tx", district: "37" },
      },
      { since: "2015-01-01" },
    );
    const source = plan.sources.find((item) => item.adapter === "socrata-votes");
    expect(source?.config).toMatchObject({ candidateDistrict: "4" });
  });

  it("for city_council still probes federal and AG families", () => {
    const { plan } = buildHistoryPlan(
      {
        ...base,
        candidate: { id: "c3", name: "Ken Paxton" },
        position: { office: "city_council", jurisdiction: "us/tx/austin" },
      },
      { since: "2025-01-01" },
    );
    expect(plan.sources.some((source) => source.adapter === "house-clerk")).toBe(true);
    expect(plan.sources.some((source) => source.adapter === "govinfo-crec")).toBe(true);
    expect(plan.sources.some((source) => source.adapter === "ag-opinions")).toBe(true);
    expect(plan.sources.some((source) => source.adapter === "socrata-votes")).toBe(false);
  });

  it("plans governor vetoes/signings and AG opinions for Greg Abbott from verified tenures", () => {
    const { plan } = buildHistoryPlan(
      { ...base, candidate: { id: "gov-abbott", name: "Greg Abbott" }, position: { office: "governor", jurisdiction: "us/tx", district: "TX" } },
      { since: "2003-01-01", documentCap: 5 },
    );
    const governor = plan.sources.find((source) => source.adapter === "tlo-governor-report");
    expect(governor?.config).toMatchObject({
      tenure: { candidateId: "gov-abbott", start: "2015-01-20", sourceUrl: "https://www.tsl.texas.gov/ref/abouttx/governors.html" },
    });
    expect(governor?.config).not.toHaveProperty("tenure.end");
    const ag = plan.sources.find((source) => source.adapter === "ag-opinions");
    expect(ag?.id).toBe("oag-opinions-greg-abbott");
    expect(ag?.config).toMatchObject({ tenure: { start: "2002-12-02", end: "2015-01-04" } });
  });

  it("does not plan governor actions for a namesake outside the tenure table", () => {
    const { plan } = buildHistoryPlan(
      { ...base, candidate: { id: "c9", name: "Gregory Abbott Jr." }, position: { office: "county_judge", jurisdiction: "us/tx" } },
      { since: "2003-01-01" },
    );
    expect(plan.sources.some((source) => source.adapter === "tlo-governor-report")).toBe(false);
  });

  it("opt-in includeTloFtp adds the TLO adapter", () => {
    const { plan } = buildHistoryPlan(
      {
        ...base,
        position: { office: "tx_house", jurisdiction: "us/tx", district: "50" },
      },
      { includeTloFtp: true, documentCap: 5 },
    );
    expect(plan.sources.some((source) => source.adapter === "tlo-billhistory")).toBe(true);
  });

  it("notes TX sources when jurisdiction is outside Texas", () => {
    const { plan, gaps } = buildHistoryPlan(
      {
        ...base,
        position: { office: "us_house", jurisdiction: "us/ca" },
      },
      { since: "2025-01-01" },
    );
    expect(plan.sources.some((source) => source.adapter === "socrata-votes")).toBe(false);
    expect(plan.sources.some((source) => ["tx-legislator", "austin-council-votes"].includes(source.adapter))).toBe(false);
    expect(gaps.some((gap) => /not Texas/i.test(gap))).toBe(true);
    expect(plan.sources.some((source) => source.adapter === "house-clerk")).toBe(true);
  });
});
