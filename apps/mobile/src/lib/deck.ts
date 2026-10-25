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

/**
 * The two options in screen order. Pole sides swap when `flipped`; tradeoff buttons never swap,
 * so "Worth it" is always first. The returned `choice` always names the data side, never the slot.
 */
export function displayChoices(card: PolicyCard, flipped: boolean): [DeckChoice, DeckChoice] {
  if (card.kind === "tradeoff") return ["accept", "decline"];
  return flipped ? ["b", "a"] : ["a", "b"];
}

/** Text for one option. */
export function choiceLabel(card: PolicyCard, choice: DeckChoice): string {
  if (card.kind === "tradeoff") return choice === "accept" ? "Worth it" : "Not worth it";
  return choice === "a" ? card.poleA : card.poleB;
}

/** The swipe recorded when the option in display `slot` (0 = top, 1 = bottom) is chosen. */
export function swipeForSlot(
  card: PolicyCard,
  flipped: boolean,
  slot: 0 | 1,
  starred: boolean,
): Swipe {
  const choice = displayChoices(card, flipped)[slot];
  return swipeFor(card, choice, starred);
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
