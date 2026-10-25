import { describe, expect, it } from "vitest";
import type { Evidence, OfficialAction } from "@ftb/types";
import { normalizeSource, redactPartyMarkers, redactTerms } from "./normalize.js";
import { aggregateCandidate } from "./aggregate.js";
import { identityLeakGate } from "./validate.js";

describe("Invariant 6/7: masking before classification and presentation", () => {
  it("redacts names case-insensitively, longest first, including bare surnames", () => {
    expect(redactTerms("GREG CASAR said Casar's plan; greg  casar agreed.", ["Greg Casar"])).toBe(
      "[REDACTED] said [REDACTED]'s plan; [REDACTED] agreed.",
    );
    // Whole words only: no damage to unrelated words containing the name.
    expect(redactTerms("Anaheim banana Ana", ["Ana"])).toBe("Anaheim banana [REDACTED]");
  });

  it("masks party shorthand in names_and_party mode only", () => {
    expect(redactPartyMarkers("Rep. Smith (R) and [D-TX-35] and R-Texas")).not.toMatch(
      /\(R\)|D-TX|R-Texas/,
    );
    const source = {
      id: "s",
      contestId: "c",
      type: "news" as const,
      url: "https://x.example",
      fetchedAt: "2026-10-24",
      eventDate: { basis: "unknown" as const, precision: "day" as const },
      contentHash: "h",
      originalText: "",
      text: "Democrats and Smith (D) back it.",
    };
    expect(
      normalizeSource(source, {
        mode: "names_only",
        projectionVersion: "v",
        candidateNames: ["Jo Smith"],
      }).text,
    ).toBe("Democrats and [REDACTED] (D) back it.");
    expect(
      normalizeSource(source, {
        mode: "names_and_party",
        projectionVersion: "v",
        candidateNames: ["Jo Smith"],
        partyLabels: ["Democrats"],
      }).text,
    ).toBe("[REDACTED] and [REDACTED] [REDACTED] back it.");
  });

  it("leak gate matches whole words, not substrings", () => {
    expect(
      identityLeakGate('{"t":"banana bread"}', { candidateNames: ["Ana"], partyLabels: [] }).clean,
    ).toBe(true);
    expect(
      identityLeakGate('{"t":"ANA said"}', { candidateNames: ["Ana"], partyLabels: [] }).clean,
    ).toBe(false);
  });
});

describe("Invariants 1, 11, 12: abstention and action weighting", () => {
  const ev = (id: string, issueId: string, extra: Partial<Evidence> = {}): Evidence => ({
    id,
    sourceId: `s-${id}`,
    contestId: "c",
    candidateId: "p",
    issueId,
    kind: "voice",
    sourceType: "campaign_site",
    eventDate: { basis: "published", date: "2026-10-01", precision: "day" },
    quote: "q",
    quoteSpan: { start: 0, end: 1 },
    position: 0.8,
    distribution: { probs: {}, confidence: 0.9 },
    relevance: 1,
    isOwnSpeech: 1,
    claimType: "advocacy",
    claimTypeDist: { probs: {}, confidence: 0.9 },
    specificity: 0,
    withinAuthority: "influence",
    ...extra,
  });
  const base = {
    candidateId: "p",
    contestId: "c",
    incumbent: false,
    recordInOffice: "none" as const,
    moneyFlows: [],
    entities: new Map(),
    asOfDate: "2026-10-24",
  };
  const vote = (
    id: string,
    margin: OfficialAction["margin"],
    extra: Partial<OfficialAction> = {},
  ): OfficialAction => ({
    id,
    actorId: "p",
    issueIds: ["a"],
    role: "r",
    type: "floor_vote",
    stance: "yes",
    date: "2025-05-01",
    title: "t",
    officialText: "t",
    sourceUrl: "https://x.gov",
    ...(margin ? { margin } : {}),
    ...extra,
  });

  it("thin evidence abstains to Objective Info Mode", () => {
    const result = aggregateCandidate({
      ...base,
      evidence: [ev("1", "a"), ev("2", "a")],
      actions: [],
    });
    expect(result.evidenceState).toBe("thin");
    expect(result.coverage).toBe("objective_only");
  });

  it("unanimous, voice and consent votes weigh about zero and don't count as independent events", () => {
    const actions = [
      vote("unanimous", { yes: 140, no: 0 }),
      vote("voice", undefined, {
        vote: { value: "yes", raw: "aye", question: "q", method: "voice" },
      }),
      vote("contested", { yes: 80, no: 60 }),
    ];
    const opposite = { position: -0.8 };
    const result = aggregateCandidate({
      ...base,
      actions,
      evidence: [
        ev("u", "a", {
          kind: "action",
          actionId: "unanimous",
          sourceType: "official_action",
          ...opposite,
        }),
        ev("v", "a", {
          kind: "action",
          actionId: "voice",
          sourceType: "official_action",
          ...opposite,
        }),
        ev("c", "a", { kind: "action", actionId: "contested", sourceType: "official_action" }),
      ],
    });
    // The contested vote dominates; the two near-zero votes barely move it.
    expect(result.stances.a!.position).toBeGreaterThan(0.7);
    // Only one independent event remains → not sufficient for this issue.
    expect(result.issueEvidenceState.a).toBe("thin");
  });
});
