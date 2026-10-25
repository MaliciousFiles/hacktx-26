import { describe, expect, it } from "vitest";
import {
  issueAlignment,
  computeUserVector,
  computeMatchResult,
  computeContestMatch,
  computeJudicialComparison,
  computeMeasureConnections,
  computeDarkShareInterval,
  computeSpecificityTier,
  userIssuePosition,
} from "./scoring";
import type {
  Swipe,
  PoleCard,
  CandidateProfile,
  StanceAgg,
  FundingMap,
} from "./index";

describe("issueAlignment", () => {
  it("is 1 for identical positions and 0 for opposite poles", () => {
    expect(issueAlignment(0.5, 0.5)).toBe(1);
    expect(issueAlignment(1, -1)).toBe(0);
  });

  it("never scores a closer candidate lower", () => {
    expect(issueAlignment(0, 0.2)).toBeGreaterThan(issueAlignment(0, 0.9));
  });
});

describe("computeUserVector", () => {
  it("computes user positions correctly from PoleCard swipes", () => {
    const cards: PoleCard[] = [
      {
        id: "card-1",
        kind: "pole",
        deck: "policy",
        anchor: true,
        issueId: "housing.zoning",
        poleA: "Allow apartments",
        poleB: "Restrict zoning",
        vector: {
          "housing.zoning": { a: 1.0, b: -1.0, weight: 1.0 },
        },
      },
    ];

    const swipes: Swipe[] = [
      { cardId: "card-1", kind: "pole", chosen: "a", starred: false },
    ];

    const vector = computeUserVector(swipes, cards, { "housing.zoning": 1 });
    expect(vector["housing.zoning"]).toBeDefined();
    expect(vector["housing.zoning"]?.position).toBe(1.0);
    expect(vector["housing.zoning"]?.salience).toBe(1);
  });

  it("ignores tradeoff swipes in user stance vector calculation", () => {
    const swipes: Swipe[] = [
      { cardId: "tradeoff-1", kind: "tradeoff", chosen: "accept", starred: false },
    ];
    const vector = computeUserVector(swipes, [], {});
    expect(Object.keys(vector).length).toBe(0);
  });
});

describe("computeMatchResult & computeContestMatch", () => {
  it("computes happily_ever_after for high alignment", () => {
    const stances: Record<string, StanceAgg> = {
      "housing.zoning": {
        position: 0.9,
        evidenceStrength: 0.9,
        bySourceType: {},
      },
      "economy.taxation": {
        position: -0.8,
        evidenceStrength: 0.9,
        bySourceType: {},
      },
      "safety.policing": {
        position: 0.7,
        evidenceStrength: 0.9,
        bySourceType: {},
      },
    };

    const userVector = {
      "housing.zoning": { position: 1.0, userCertainty: 1.0, salience: 1.0 },
      "economy.taxation": { position: -1.0, userCertainty: 1.0, salience: 1.0 },
      "safety.policing": { position: 0.8, userCertainty: 1.0, salience: 1.0 },
    };

    const match = computeMatchResult(
      userVector,
      "cand-1",
      "contest-1",
      stances,
      {
        "housing.zoning": "sufficient",
        "economy.taxation": "sufficient",
        "safety.policing": "sufficient",
      },
      { agreements: [], disagreements: [] },
    );

    expect(match.bucket).toBe("happily_ever_after");
    expect(match.issuesCompared).toBe(3);
    expect(match.matchClarity).toBeGreaterThan(0.8);
  });
});

describe("computeSpecificityTier", () => {
  it("correctly identifies tiers based on score thresholds", () => {
    expect(computeSpecificityTier(0.8)).toBe(2);
    expect(computeSpecificityTier(0.667)).toBe(2);
    expect(computeSpecificityTier(0.5)).toBe(1);
    expect(computeSpecificityTier(0.2)).toBe(0);
  });
});

describe("computeDarkShareInterval", () => {
  it("calculates dark share interval correctly", () => {
    const funding: FundingMap = {
      period: { start: "2026-01-01", end: "2026-10-01" },
      direct: { min: 10000, max: 10000 },
      outside: { min: 50000, max: 100000 },
      ads: {
        fcc: { min: 0, max: 0 },
        meta: { min: 0, max: 0 },
        google: { min: 0, max: 0 },
      },
      traced: {
        receipts: {
          itemized: { min: 8000, max: 8000 },
          unitemizedSmall: { min: 2000, max: 2000 },
          pacPassThrough: { min: 0, max: 0 },
        },
        outside: {
          disclosed: { min: 30000, max: 70000 },
          dark: { min: 20000, max: 30000 },
          unresolved: { min: 0, max: 0 },
        },
      },
      topIndustries: [],
    };

    const interval = computeDarkShareInterval(funding);
    expect(interval).toBeDefined();
    expect(interval?.min).toBe(0.2); // 20000 / 100000
    expect(interval?.max).toBe(0.6); // 30000 / 50000
    expect(interval?.basis).toBe("outside_spending");
  });
});

describe("userIssuePosition", () => {
  it("returns the chosen pole when there is one card", () => {
    expect(userIssuePosition([{ position: 1, weight: 1 }])).toBe(1);
    expect(userIssuePosition([{ position: -1, weight: 0.5 }])).toBe(-1);
  });

  it("averages by weight and treats a skip (no choices) as missing", () => {
    expect(userIssuePosition([])).toBeNull();
    expect(userIssuePosition([{ position: 1, weight: 0 }])).toBeNull();
    expect(
      userIssuePosition([
        { position: 1, weight: 1 },
        { position: -1, weight: 1 },
      ]),
    ).toBe(0);
    expect(
      userIssuePosition([
        { position: 1, weight: 3 },
        { position: -1, weight: 1 },
      ]),
    ).toBe(0.5);
  });

  it("ignores a negative weight instead of flipping the sign", () => {
    expect(
      userIssuePosition([
        { position: 1, weight: 1 },
        { position: -1, weight: -5 },
      ]),
    ).toBe(1);
  });
});
