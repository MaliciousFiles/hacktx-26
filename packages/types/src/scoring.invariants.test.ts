import { describe, expect, it } from "vitest";
import { computeContestMatch, computeMatchResult, computeUserVector } from "./scoring";
import type {
  CandidateProfile,
  EvidenceState,
  PoleCard,
  StanceAgg,
  Swipe,
  UserVector,
} from "./index";

const card = (id: string, issueId: string, weight = 1): PoleCard => ({
  id,
  kind: "pole",
  deck: "policy",
  anchor: false,
  issueId,
  poleA: "A",
  poleB: "B",
  vector: { [issueId]: { a: 1, b: -1, weight } },
});
const pole = (cardId: string, chosen: "a" | "b" | "skip", starred = false): Swipe => ({
  cardId,
  kind: "pole",
  chosen,
  starred,
});
const stance = (position: number): StanceAgg => ({
  position,
  evidenceStrength: 0.9,
  bySourceType: {},
});
const issues = ["i1", "i2", "i3"];
const certain = (position: number): UserVector =>
  Object.fromEntries(issues.map((id) => [id, { position, userCertainty: 1, salience: 1 }]));
const states = (state: EvidenceState) => Object.fromEntries(issues.map((id) => [id, state]));
const ids = { agreements: [], disagreements: [] };

describe("user vector (§6.3)", () => {
  it("⭐ raises salience but never flips direction", () => {
    const cards = [card("c1", "i1")];
    const plain = computeUserVector([pole("c1", "b")], cards, {})["i1"]!;
    const star = computeUserVector([pole("c1", "b", true)], cards, {})["i1"]!;
    expect(star.salience).toBeGreaterThan(plain.salience);
    expect(star.position).toBe(plain.position);
  });

  it("contradictory answers are not certain; consistent ones are", () => {
    const cards = ["c1", "c2", "c3"].map((id) => card(id, "i1"));
    const mixed = computeUserVector([pole("c1", "a"), pole("c2", "b"), pole("c3", "a")], cards, {})[
      "i1"
    ]!;
    const consistent = computeUserVector(
      [pole("c1", "a"), pole("c2", "a"), pole("c3", "a")],
      cards,
      {},
    )["i1"]!;
    expect(consistent.userCertainty).toBe(1);
    expect(mixed.userCertainty).toBeLessThan(0.2);
  });

  it("skip and zero-weight mappings stay missing, never neutral", () => {
    expect(computeUserVector([pole("c1", "skip")], [card("c1", "i1")], {})["i1"]).toBeUndefined();
    expect(computeUserVector([pole("c1", "a")], [card("c1", "i1", 0)], {})["i1"]).toBeUndefined();
  });
});

describe("matching (§6.5–6.6)", () => {
  it("no evidence is Clouded, never Worlds Apart, and never 'no strong match'", () => {
    const empty = computeMatchResult(certain(1), "p", "c", {}, {}, ids);
    expect(empty.bucket).toBe("clouded");
    expect(empty.matchClarity).toBe(0);
    const profile = {
      id: "p",
      stances: {},
      issueEvidenceState: {},
      evidence: [],
    } as unknown as CandidateProfile;
    expect(
      computeContestMatch(certain(1), { id: "c", candidateIds: ["p"], officeKind: "legislative" }, [
        profile,
      ]).noStrongMatch,
    ).toBe(false);
  });

  it("thin issues and low-certainty user answers don't count toward coverage", () => {
    const stances = Object.fromEntries(issues.map((id) => [id, stance(1)]));
    expect(computeMatchResult(certain(1), "p", "c", stances, states("thin"), ids).bucket).toBe(
      "clouded",
    );
    const shaky: UserVector = Object.fromEntries(
      issues.map((id) => [id, { position: 1, userCertainty: 0.1, salience: 1 }]),
    );
    expect(computeMatchResult(shaky, "p", "c", stances, states("sufficient"), ids).bucket).toBe(
      "clouded",
    );
  });

  it("user certainty changes weight: a provisional answer moves the score less", () => {
    const stances = { i1: stance(1), i2: stance(1), i3: stance(1), i4: stance(-1) };
    const evidence = { ...states("sufficient"), i4: "sufficient" as const };
    const base: UserVector = { ...certain(1), i4: { position: 1, userCertainty: 1, salience: 1 } };
    const provisional: UserVector = {
      ...base,
      i4: { position: 1, userCertainty: 0.34, salience: 1 },
    };
    const full = computeMatchResult(base, "p", "c", stances, evidence, ids);
    const less = computeMatchResult(provisional, "p", "c", stances, evidence, ids);
    expect(full.bucket).toBe("good_company"); // 0.75
    expect(less.bucket).toBe("happily_ever_after"); // the disagreement is down-weighted
  });

  it("near a cutoff with modest clarity, the result is Clouded rather than a confident bucket", () => {
    const stances = Object.fromEntries(
      issues.map((id) => [id, { position: 0.6, evidenceStrength: 0.5, bySourceType: {} }]),
    );
    const result = computeMatchResult(certain(1), "p", "c", stances, states("sufficient"), ids); // avg 0.8
    expect(result.bucket).toBe("clouded");
  });
});
