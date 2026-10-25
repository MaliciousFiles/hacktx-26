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
  it("probes every supported office family regardless of race sought", () => {
    const { plan, rationale, gaps } = buildHistoryPlan({
      ...base,
      position: { office: "us_senate", jurisdiction: "us/tx" },
    }, { since: "2025-01-01", houseRollCap: 20, documentCap: 5 });

    expect(plan.identity?.provider).toBe("house");
    expect(adapters(plan)).toEqual(
      expect.arrayContaining([
        "house-clerk",
        "govinfo-billstatus",
        "govinfo-crec",
        "socrata-votes",
      ]),
    );
    // Casar is House, not on OAG series — no AG source, honest gap
    expect(plan.sources.some((source) => source.adapter === "ag-opinions")).toBe(false);
    expect(gaps.some((gap) => /OAG opinion series/i.test(gap))).toBe(true);
    expect(gaps.some((gap) => /TLO bill-history/i.test(gap))).toBe(true);
    expect(gaps.some((gap) => /journal/i.test(gap))).toBe(true);
    expect(gaps.some((gap) => /Governor orders/i.test(gap))).toBe(true);
    expect(gaps.some((gap) => /judicial/i.test(gap))).toBe(true);
    expect(rationale[0]).toMatch(/bioguide identity/i);
    expect(rationale.some((line) => /Full-history scan/i.test(line))).toBe(true);
  });

  it("for Ken Paxton us_senate still includes House+Senate probes plus AG opinions by name", () => {
    const { plan } = buildHistoryPlan({
      ...base,
      candidate: { id: "c3", name: "Ken Paxton" },
      position: { office: "us_senate", jurisdiction: "us/tx" },
    }, { since: "2025-01-01", documentCap: 5 });
    expect(plan.identity?.provider).toBe("house");
    expect(plan.sources.some((source) => source.adapter === "house-clerk")).toBe(true);
    expect(plan.sources.some((source) => source.adapter === "govinfo-crec")).toBe(true);
    expect(plan.sources.some((source) => source.adapter === "ag-opinions")).toBe(true);
    expect(plan.sources.some((source) => source.adapter === "socrata-votes")).toBe(true);
  });

  it("for city_council still probes federal and AG families", () => {
    const { plan } = buildHistoryPlan({
      ...base,
      candidate: { id: "c3", name: "Ken Paxton" },
      position: { office: "city_council", jurisdiction: "us/tx/austin" },
    }, { since: "2025-01-01" });
    expect(plan.sources.some((source) => source.adapter === "house-clerk")).toBe(true);
    expect(plan.sources.some((source) => source.adapter === "govinfo-crec")).toBe(true);
    expect(plan.sources.some((source) => source.adapter === "ag-opinions")).toBe(true);
    expect(plan.sources.some((source) => source.adapter === "socrata-votes")).toBe(true);
  });

  it("opt-in includeTloFtp adds the TLO adapter", () => {
    const { plan } = buildHistoryPlan({
      ...base,
      position: { office: "tx_house", jurisdiction: "us/tx", district: "50" },
    }, { includeTloFtp: true, documentCap: 5 });
    expect(plan.sources.some((source) => source.adapter === "tlo-billhistory")).toBe(true);
  });

  it("notes TX sources when jurisdiction is outside Texas", () => {
    const { plan, gaps } = buildHistoryPlan({
      ...base,
      position: { office: "us_house", jurisdiction: "us/ca" },
    }, { since: "2025-01-01" });
    expect(plan.sources.some((source) => source.adapter === "socrata-votes")).toBe(false);
    expect(gaps.some((gap) => /not Texas/i.test(gap))).toBe(true);
    expect(plan.sources.some((source) => source.adapter === "house-clerk")).toBe(true);
  });
});
