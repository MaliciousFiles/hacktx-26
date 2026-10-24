import { describe, expect, it } from "vitest";
import {
  validateQuote,
  validatePublication,
  identityLeakGate,
  snapshotSources,
  normalizeSource,
  buildCardDeck,
} from "./index";
import type {
  Evidence,
  Source,
  Release,
  CandidateProfile,
  Contest,
  SourceCitation,
  OfficialAction,
  Issue,
} from "@ftb/types";

describe("validateQuote", () => {
  const source: Source = {
    id: "src-1",
    contestId: "contest-1",
    candidateId: "cand-1",
    type: "official_action",
    url: "https://example.com/vote",
    fetchedAt: "2026-10-24",
    eventDate: { date: "2026-10-20", basis: "published", precision: "day" },
    contentHash: "hash123",
    originalText: "The legislature approved HB 100 on Tuesday morning.",
    text: "The legislature approved HB 100 on Tuesday morning.",
  };

  it("passes when quote is an exact UTF-16 substring of originalText", () => {
    const evidence: Evidence = {
      id: "ev-1",
      contestId: "contest-1",
      sourceId: "src-1",
      candidateId: "cand-1",
      issueId: "economy.taxation",
      kind: "action",
      sourceType: "official_action",
      eventDate: { date: "2026-10-24", basis: "official_record", precision: "day" },
      quote: "approved HB 100",
      quoteSpan: { start: 16, end: 31 },
      position: 0.5,
      distribution: { probs: {}, confidence: 0.9 },
      relevance: 1.0,
      isOwnSpeech: 0.0,
      claimType: "advocacy",
      claimTypeDist: { probs: {}, confidence: 0.9 },
      specificity: 0.8,
      withinAuthority: "direct",
    };

    const res = validateQuote(evidence, [source]);
    expect(res.valid).toBe(true);
  });

  it("fails if quote has off-by-one span", () => {
    const evidence: Evidence = {
      id: "ev-1",
      contestId: "contest-1",
      sourceId: "src-1",
      candidateId: "cand-1",
      issueId: "economy.taxation",
      kind: "action",
      sourceType: "official_action",
      eventDate: { date: "2026-10-24", basis: "official_record", precision: "day" },
      quote: "approved HB 100",
      quoteSpan: { start: 15, end: 30 }, // shifted
      position: 0.5,
      distribution: { probs: {}, confidence: 0.9 },
      relevance: 1.0,
      isOwnSpeech: 0.0,
      claimType: "advocacy",
      claimTypeDist: { probs: {}, confidence: 0.9 },
      specificity: 0.8,
      withinAuthority: "direct",
    };

    const res = validateQuote(evidence, [source]);
    expect(res.valid).toBe(false);
  });

  it("fails if candidate ID does not match attribution", () => {
    const evidence: Evidence = {
      id: "ev-1",
      contestId: "contest-1",
      sourceId: "src-1",
      candidateId: "cand-wrong",
      issueId: "economy.taxation",
      kind: "action",
      sourceType: "official_action",
      eventDate: { date: "2026-10-24", basis: "official_record", precision: "day" },
      quote: "approved HB 100",
      quoteSpan: { start: 16, end: 31 },
      position: 0.5,
      distribution: { probs: {}, confidence: 0.9 },
      relevance: 1.0,
      isOwnSpeech: 0.0,
      claimType: "advocacy",
      claimTypeDist: { probs: {}, confidence: 0.9 },
      specificity: 0.8,
      withinAuthority: "direct",
    };

    const res = validateQuote(evidence, [source]);
    expect(res.valid).toBe(false);
  });
});

describe("identityLeakGate", () => {
  it("detects candidate names and party labels in serialized response", () => {
    const payload = JSON.stringify({
      text: "Candidate Jane Smith expressed support for the bill.",
    });

    const gate = identityLeakGate(payload, {
      candidateNames: ["Jane Smith"],
      partyLabels: ["Democrat", "Republican"],
    });

    expect(gate.clean).toBe(false);
    expect(gate.leaks.length).toBeGreaterThan(0);
  });

  it("passes when no blocked identity or party tokens are found", () => {
    const payload = JSON.stringify({
      text: "The representative supported increasing funding for local infrastructure.",
    });

    const gate = identityLeakGate(payload, {
      candidateNames: ["Jane Smith"],
      partyLabels: ["Democrat", "Republican"],
    });

    expect(gate.clean).toBe(true);
    expect(gate.leaks.length).toBe(0);
  });
});

describe("normalizeSource", () => {
  it("redacts candidate names in names_only mode", () => {
    const source: Source = {
      id: "src-1",
      contestId: "contest-1",
      type: "news",
      url: "https://news.org/1",
      fetchedAt: "2026-10-24",
      eventDate: { date: "2026-10-20", basis: "published", precision: "day" },
      contentHash: "abc",
      originalText: "Senator Alice Walker introduced the bill.",
      text: "Senator Alice Walker introduced the bill.",
    };

    const norm = normalizeSource(source, {
      mode: "names_only",
      projectionVersion: "p-v1",
      candidateNames: ["Alice Walker"],
    });

    expect(norm.text).toContain("[REDACTED]");
    expect(norm.text).not.toContain("Alice Walker");
  });
});

describe("buildCardDeck", () => {
  it("builds pole cards, judicial cards, and tradeoff cards", () => {
    const issues: Issue[] = [
      {
        id: "housing.zoning",
        label: "Zoning",
        levels: ["state", "local"],
        negativePole: "Restrict zoning",
        positivePole: "Allow apartments",
      },
    ];

    const deck = buildCardDeck(issues);
    expect(deck.length).toBeGreaterThan(3);
    expect(deck.some((c) => c.kind === "pole")).toBe(true);
    expect(deck.some((c) => c.kind === "tradeoff")).toBe(true);
    expect(deck.some((c) => c.kind === "judicial_pole")).toBe(true);
  });
});
