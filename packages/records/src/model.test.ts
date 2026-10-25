import { describe, expect, it } from "vitest";
import { candidateNames, dateWindow, inWindow, isContested, isoDate, normalizeVote, voteStance } from "./model";
import type { CandidateResearchRequest } from "@ftb/types";

const request: CandidateResearchRequest = {
  candidate: { id: "fixture-person", name: "José García", aliases: ["Jose Garcia"] },
  position: { office: "city_council", jurisdiction: "fixture/city" },
  month: 11, year: 2026,
};

describe("election context", () => {
  it("collects history before the election month, not only that month's actions", () => {
    const window = dateWindow(request);
    expect(window.before).toBe("2026-11-01");
    expect(inWindow("2023-02-01", window)).toBe(true);
    expect(inWindow("2026-10-31", window)).toBe(true);
    expect(inWindow("2026-11-01", window)).toBe(false);
  });
  it("rejects impossible dates and months", () => {
    expect(() => dateWindow({ ...request, month: 13 })).toThrow();
    expect(() => dateWindow(request, "2025-02-30")).toThrow();
    expect(() => isoDate("2025-02-30")).toThrow();
    expect(isoDate("2024-02-29T09:00:00Z")).toBe("2024-02-29");
  });
});

describe("conservative identity and vote semantics", () => {
  it("only uses full names and explicitly supplied aliases", () => {
    expect(candidateNames(request).has("josé garcía")).toBe(true);
    expect(candidateNames(request).has("garcía")).toBe(false);
  });
  it("does not turn not voting, present, or recusal into opposition or abstention", () => {
    for (const raw of ["Not Voting", "Present", "Recused", "Off Dais"]) {
      expect(voteStance(normalizeVote(raw))).toBe("n/a");
    }
    expect(voteStance(normalizeVote("Abstain"))).toBe("abstain");
    expect(normalizeVote("Jeffries")).toBe("other");
  });
  it("uses only yes/no votes and the preregistered 10% threshold", () => {
    expect(isContested({ yes: 9, no: 1, present: 90 })).toBe(true);
    expect(isContested({ yes: 10, no: 1 })).toBe(false);
    expect(isContested({ yes: 3, no: 0, abstain: 2 })).toBe(false);
    expect(isContested({ yes: 0, no: 0 })).toBe(false);
    expect(() => isContested({ yes: -1, no: 2 })).toThrow();
  });
});
