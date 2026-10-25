import type { CandidateProfile, EvidenceState } from "@ftb/types";
import { describe, expect, it } from "vitest";
import { dividingIssues } from "./dividing";
import { demoBallot, issueById } from "./fixtures/travisDemo";

const council = demoBallot.candidates.filter((c) => c.contestId === "contest-council");

function withStance(
  base: CandidateProfile,
  id: string,
  position: number,
  state: EvidenceState = "sufficient",
): CandidateProfile {
  return {
    ...base,
    id,
    stances: { "housing.zoning": { position, evidenceStrength: 0.8, bySourceType: {} } },
    issueEvidenceState: { "housing.zoning": state },
  };
}

describe("dividingIssues", () => {
  const base = council[0]!;

  it("finds the issues the sample council candidates part ways on", () => {
    const issues = dividingIssues(council, issueById);
    expect(issues.map((issue) => issue.issueId)).toContain("housing.zoning");
    const housing = issues.find((issue) => issue.issueId === "housing.zoning")!;
    expect(housing.positive.length).toBeGreaterThan(0);
    expect(housing.positivePole).toBe("Allow more homes by right");
  });

  it("puts candidates on the side they lean toward and keeps near-zero in between", () => {
    const [issue] = dividingIssues(
      [withStance(base, "a", 0.9), withStance(base, "b", -0.8), withStance(base, "c", 0.05)],
      issueById,
    );
    expect(issue?.positive.map((e) => e.profile.id)).toEqual(["a"]);
    expect(issue?.negative.map((e) => e.profile.id)).toEqual(["b"]);
    expect(issue?.between.map((e) => e.profile.id)).toEqual(["c"]);
  });

  it("does not report agreement, a single candidate, or missing evidence as a split", () => {
    expect(
      dividingIssues([withStance(base, "a", 0.8), withStance(base, "b", 0.7)], issueById),
    ).toEqual([]);
    expect(dividingIssues([withStance(base, "a", 0.8)], issueById)).toEqual([]);
    expect(
      dividingIssues([withStance(base, "a", 0.8), withStance(base, "b", -0.8, "none")], issueById),
    ).toEqual([]);
  });

  it("keeps the caller's candidate order", () => {
    const [issue] = dividingIssues(
      [withStance(base, "z", 0.9), withStance(base, "y", 0.8), withStance(base, "x", -0.9)],
      issueById,
    );
    expect(issue?.positive.map((e) => e.profile.id)).toEqual(["z", "y"]);
  });
});
