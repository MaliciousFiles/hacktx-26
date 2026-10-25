// Explore deck order and the display→data pole mapping (APP_BUILD.md §1.6, PLAN.md Suite D).
// Pure: no React Native imports.
import type { ID, PolicyCard, Swipe } from "@ftb/types";

/** Policy cards first (anchors, then the rest), then the judicial mini-deck. Stable within groups. */
export function orderDeck(cards: readonly PolicyCard[]): PolicyCard[] {
  const policy = cards.filter((card) => card.deck === "policy");
  const judicial = cards.filter((card) => card.deck === "judicial");
  const anchorsFirst = (group: PolicyCard[]) => [
    ...group.filter((card) => card.anchor),
    ...group.filter((card) => !card.anchor),
  ];
  return [...anchorsFirst(policy), ...anchorsFirst(judicial)];
}

export type DeckChoice = "a" | "b" | "accept" | "decline";
export type Verdict = "agree" | "disagree";

/**
 * Statement cards show one pole. Which one is the persisted per-device flip, so neither pole is
 * favored across phones. Swiping right agrees with it; left records the other pole.
 */
export function shownSide(flipped: boolean): "a" | "b" {
  return flipped ? "b" : "a";
}

/** The one statement on the card: the shown pole, or the tradeoff's goal. */
export function statementFor(card: PolicyCard, flipped: boolean): string {
  if (card.kind === "tradeoff") return card.policy;
  return shownSide(flipped) === "a" ? card.poleA : card.poleB;
}

/** The data choice a swipe means. Tradeoffs: right = worth it, left = not worth it. */
export function choiceForVerdict(card: PolicyCard, flipped: boolean, verdict: Verdict): DeckChoice {
  if (card.kind === "tradeoff") return verdict === "agree" ? "accept" : "decline";
  const shown = shownSide(flipped);
  if (verdict === "agree") return shown;
  return shown === "a" ? "b" : "a";
}

export function swipeForVerdict(
  card: PolicyCard,
  flipped: boolean,
  verdict: Verdict,
  starred: boolean,
): Swipe {
  return swipeFor(card, choiceForVerdict(card, flipped, verdict), starred);
}

/** Reads a stored swipe back as the verdict it was on this phone's card. */
export function verdictOf(
  card: PolicyCard,
  flipped: boolean,
  swipe: Swipe | undefined,
): Verdict | "skip" | null {
  if (!swipe) return null;
  if (swipe.chosen === "skip") return "skip";
  return choiceForVerdict(card, flipped, "agree") === swipe.chosen ? "agree" : "disagree";
}

export function swipeFor(card: PolicyCard, choice: DeckChoice | "skip", starred: boolean): Swipe {
  if (card.kind === "tradeoff") {
    const chosen = choice === "accept" || choice === "decline" ? choice : "skip";
    return { kind: "tradeoff", cardId: card.id, chosen, starred };
  }
  const chosen = choice === "a" || choice === "b" ? choice : "skip";
  return card.kind === "judicial_pole"
    ? { kind: "judicial_pole", cardId: card.id, chosen, starred }
    : { kind: "pole", cardId: card.id, chosen, starred };
}

function answeredIds(swipes: readonly Swipe[]): Set<ID> {
  return new Set(swipes.map((swipe) => swipe.cardId));
}

/** Leaving Explore needs every anchor card answered or skipped (UX.md §2.1). */
export function anchorsDone(cards: readonly PolicyCard[], swipes: readonly Swipe[]): boolean {
  const done = answeredIds(swipes);
  return cards.filter((card) => card.anchor).every((card) => done.has(card.id));
}

/** A contested judicial race opens only after the judicial mini-deck (PLAN.md §1). */
export function judicialDeckDone(cards: readonly PolicyCard[], swipes: readonly Swipe[]): boolean {
  const done = answeredIds(swipes);
  return cards.filter((card) => card.deck === "judicial").every((card) => done.has(card.id));
}
