import type {
  Bucket,
  IssueId,
  MatchResult,
  PolicyCard,
  Position,
  Prob,
  Swipe,
  UserVector,
} from "@ftb/types";
import {
  computeUserVector,
  issueAlignment,
  userIssuePosition,
  type WeightedPoleChoice,
} from "@ftb/types/scoring";

/** ⭐ doubles an issue's weight; it never changes the sign (APP_BUILD.md §1.4). */
export function salienceFrom(
  cards: readonly PolicyCard[],
  swipes: readonly Swipe[],
): Record<IssueId, number> {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const salience: Record<IssueId, number> = {};
  for (const swipe of swipes) {
    if (!swipe.starred) continue;
    const card = byId.get(swipe.cardId);
    if (!card) continue;
    const issues =
      card.kind === "pole"
        ? Object.keys(card.vector)
        : card.kind === "judicial_pole"
          ? [`judicial.${card.dimension}`]
          : [...card.policyIssues, ...card.costIssues];
    for (const issueId of issues) salience[issueId] = 2;
  }
  return salience;
}

export function userVectorFor(cards: readonly PolicyCard[], swipes: readonly Swipe[]): UserVector {
  return computeUserVector([...swipes], [...cards], salienceFrom(cards, swipes));
}

/** UI rule over scoring output: no clarity means Clouded, whatever the bucket (§1.6). */
export function displayBucket(result: Pick<MatchResult, "bucket" | "matchClarity">): Bucket {
  return result.matchClarity === 0 ? "clouded" : result.bucket;
}

/** Pole choices only. A skip is left out, so it stays missing instead of becoming zero. */
export function polePositions(
  cards: readonly PolicyCard[],
  swipes: readonly Swipe[],
): Partial<Record<IssueId, Position>> {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const grouped = new Map<IssueId, WeightedPoleChoice[]>();

  for (const swipe of swipes) {
    if (swipe.kind !== "pole" || swipe.chosen === "skip") continue;
    const card = cardsById.get(swipe.cardId);
    if (!card || card.kind !== "pole") continue;
    for (const [issueId, mapping] of Object.entries(card.vector)) {
      const choices = grouped.get(issueId) ?? [];
      choices.push({
        position: swipe.chosen === "a" ? mapping.a : mapping.b,
        weight: mapping.weight,
      });
      grouped.set(issueId, choices);
    }
  }

  const positions: Partial<Record<IssueId, Position>> = {};
  for (const [issueId, choices] of grouped) {
    const position = userIssuePosition(choices);
    if (position != null) positions[issueId] = position;
  }
  return positions;
}

/**
 * Plain words for one issue. These are not the fairy-tale buckets:
 * a bucket needs the coverage gates in PLAN.md §6, which this screen does not apply.
 */
export function proximityLabel(score: Prob): string {
  if (score >= 0.8) return "Near your answer";
  if (score >= 0.6) return "Some overlap";
  if (score >= 0.4) return "A different emphasis";
  return "Far from your answer";
}

export function proximity(user: Position, candidate: Position): { score: Prob; label: string } {
  const score = issueAlignment(user, candidate);
  return { score, label: proximityLabel(score) };
}

export function judicialAnswers(
  cards: readonly PolicyCard[],
  swipes: readonly Swipe[],
): { cardId: string; label: string; answer: string }[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const answers: { cardId: string; label: string; answer: string }[] = [];
  for (const swipe of swipes) {
    if (swipe.kind !== "judicial_pole") continue;
    const card = cardsById.get(swipe.cardId);
    if (!card || card.kind !== "judicial_pole") continue;
    answers.push({
      cardId: card.id,
      label: card.dimension,
      answer: swipe.chosen === "skip" ? "Skipped" : swipe.chosen === "a" ? card.poleA : card.poleB,
    });
  }
  return answers;
}

export function choiceText(card: PolicyCard, swipe: Swipe | undefined): string {
  if (!swipe) return "Not answered yet";
  if (swipe.chosen === "skip") return "Skipped";
  if ((card.kind === "pole" || card.kind === "judicial_pole") && "poleA" in card) {
    return swipe.chosen === "a" ? card.poleA : card.poleB;
  }
  if (card.kind === "tradeoff" && swipe.kind === "tradeoff") {
    return swipe.chosen === "accept" ? "Worth this cost" : "Not worth this cost";
  }
  return "Answered";
}
