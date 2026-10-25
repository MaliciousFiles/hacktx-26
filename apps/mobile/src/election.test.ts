import { describe, expect, it } from "vitest";
import { daysBetween, electionPhase, localIsoDate } from "./election";

describe("electionPhase", () => {
  it("counts down to early voting", () => {
    expect(electionPhase("2026-10-01")).toEqual({
      kind: "before_early",
      daysToEarly: 18,
      daysToElection: 33,
    });
  });

  it("covers both ends of early voting", () => {
    expect(electionPhase("2026-10-19")).toMatchObject({
      kind: "early_voting",
      daysLeftInEarly: 11,
    });
    expect(electionPhase("2026-10-30")).toMatchObject({ kind: "early_voting", daysLeftInEarly: 0 });
  });

  it("handles the gap, election day, and after", () => {
    expect(electionPhase("2026-10-31")).toEqual({ kind: "between", daysToElection: 3 });
    expect(electionPhase("2026-11-03")).toEqual({ kind: "election_day" });
    expect(electionPhase("2026-11-04")).toEqual({ kind: "after" });
  });
});

describe("dates", () => {
  it("counts days across a month boundary", () => {
    expect(daysBetween("2026-10-24", "2026-11-03")).toBe(10);
  });

  it("formats the local calendar date", () => {
    expect(localIsoDate(new Date(2026, 9, 4, 23, 30))).toBe("2026-10-04");
  });
});
