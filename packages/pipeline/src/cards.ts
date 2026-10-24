// cards.ts — Generates PolicyCard[] (PoleCard, TradeoffCard, JudicialCard) from taxonomy and reviewed configurations (PLAN.md §6.2, §6.7).
import type {
  PolicyCard,
  PoleCard,
  TradeoffCard,
  JudicialCard,
  Issue,
  JudicialDim,
} from "@ftb/types";

/**
 * Creates PoleCard entries from defined issues.
 */
export function buildPoleCardsFromIssues(issues: Issue[]): PoleCard[] {
  // Only child issues or concrete policy axes get pole cards
  return issues
    .filter((issue) => !issue.id.startsWith("judicial."))
    .map((issue) => ({
      id: `card-pole-${issue.id.replace(/\./g, "-")}`,
      kind: "pole",
      deck: "policy",
      anchor: issue.parentId === undefined, // parent issues as anchor cards
      issueId: issue.id,
      poleA: issue.positivePole,
      poleB: issue.negativePole,
      vector: {
        [issue.id]: {
          a: 1.0,
          b: -1.0,
          weight: 1.0,
        },
      },
    }));
}

/**
 * Standard judicial philosophy mini-deck (PLAN.md §2 "Special contest types", §6.3).
 * Required when walking any contested judicial race.
 */
export function buildJudicialCards(): JudicialCard[] {
  return [
    {
      id: "card-judicial-text-vs-purpose",
      kind: "judicial_pole",
      deck: "judicial",
      anchor: true,
      dimension: "text_vs_purpose",
      poleA: "Reads the law's exact words strictly as written, even if the result seems unintended.",
      poleB: "Reads laws in light of their underlying purpose and practical consequences.",
      coordinates: { a: -1.0, b: 1.0 },
    },
    {
      id: "card-judicial-restraint-vs-review",
      kind: "judicial_pole",
      deck: "judicial",
      anchor: true,
      dimension: "restraint_vs_review",
      poleA: "Defers to elected lawmakers and upholds statutes unless clearly unconstitutional.",
      poleB: "Actively exercises judicial review to strike down overreaching laws and protect rights.",
      coordinates: { a: -1.0, b: 1.0 },
    },
    {
      id: "card-judicial-precedent",
      kind: "judicial_pole",
      deck: "judicial",
      anchor: false,
      dimension: "precedent",
      poleA: "Sticks firmly with past rulings and established precedent for stability.",
      poleB: "Willing to overturn precedent when past decisions are deemed incorrect.",
      coordinates: { a: -1.0, b: 1.0 },
    },
    {
      id: "card-judicial-procedural-strictness",
      kind: "judicial_pole",
      deck: "judicial",
      anchor: false,
      dimension: "procedural_strictness",
      poleA: "Allows reasonable flexibility on procedural formalities when justice requires.",
      poleB: "Holds government actors strictly to every procedural rule and constitutional limit.",
      coordinates: { a: -1.0, b: 1.0 },
    },
  ];
}

/**
 * Standard tradeoff deck (PLAN.md §2 "Explore deck").
 */
export function buildTradeoffCards(): TradeoffCard[] {
  return [
    {
      id: "card-tradeoff-transit-taxes",
      kind: "tradeoff",
      deck: "policy",
      anchor: false,
      policy: "Expand high-capacity public transit infrastructure across the region",
      cost: "Funded by a dedicated increase in local property or sales tax",
      policyIssues: ["infrastructure"],
      costIssues: ["economy.taxation"],
    },
    {
      id: "card-tradeoff-housing-density",
      kind: "tradeoff",
      deck: "policy",
      anchor: false,
      policy: "Permit multifamily apartments in single-family residential zones by right",
      cost: "Changes existing neighborhood character and street parking availability",
      policyIssues: ["housing.zoning", "housing.affordability"],
      costIssues: ["housing.zoning"],
    },
    {
      id: "card-tradeoff-clean-energy-costs",
      kind: "tradeoff",
      deck: "policy",
      anchor: false,
      policy: "Accelerate 100% clean-energy transition targets for public utilities",
      cost: "Short-term electricity rate surcharges during facility buildouts",
      policyIssues: ["environment.climate", "environment.energy"],
      costIssues: ["economy.spending"],
    },
  ];
}

/**
 * Build the full default PolicyCard deck.
 */
export function buildCardDeck(issues: Issue[]): PolicyCard[] {
  const poleCards = buildPoleCardsFromIssues(issues);
  const judicialCards = buildJudicialCards();
  const tradeoffCards = buildTradeoffCards();
  return [...poleCards, ...tradeoffCards, ...judicialCards];
}
