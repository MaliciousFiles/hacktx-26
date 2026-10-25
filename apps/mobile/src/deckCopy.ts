// Icons, titles and "More info" for Explore cards, shared by the deck and the E5 summary.
import type { PolicyCard } from "@ftb/types";
import type { IconName } from "@/components/art";
import { issueById, issueLabel } from "@/data/release";
import { JUDICIAL_DETAIL, JUDICIAL_LABEL } from "@/labels";
import { shownSide, statementFor } from "@/lib/deck";

const ISSUE_ICONS: Record<string, IconName> = {
  housing: "house",
  mobility: "bus",
  infrastructure: "bus",
  fiscal: "coins",
  economy: "coins",
  education: "book",
};

export function cardIcon(card: PolicyCard): IconName {
  if (card.kind === "tradeoff") return "scale";
  if (card.kind === "judicial_pole") return "gavel";
  return ISSUE_ICONS[card.issueId.split(".")[0] ?? ""] ?? "sparkle";
}

export function cardTitle(card: PolicyCard): string {
  if (card.kind === "tradeoff") return "Is this worth the cost?";
  if (card.kind === "judicial_pole") return JUDICIAL_LABEL[card.dimension];
  return issueLabel(card.issueId);
}

export interface CardDetail {
  /** Short lines of plain background, shown first. */
  about: string[];
  /** What each swipe records, so neither answer is a mystery. */
  agree: string;
  disagree: string;
  note: string;
}

/** "More info" for a card, built from the card itself and the bundled issue catalog. */
export function cardDetail(card: PolicyCard, flipped: boolean): CardDetail {
  if (card.kind === "tradeoff") {
    const touches = [...card.policyIssues, ...card.costIssues].map(issueLabel);
    return {
      about: [
        `The goal: ${card.policy}.`,
        `The cost: ${card.cost}.`,
        `This touches ${[...new Set(touches)].join(" and ").toLowerCase()}.`,
      ],
      agree: `Worth it: you'd accept ${lower(card.cost)} to get this.`,
      disagree: `Not worth it: the cost is too high for you. That doesn't mean you oppose the goal.`,
      note: "Tradeoff answers only shape your reflection summary. They never feed matching.",
    };
  }
  const shown = statementFor(card, flipped);
  const other = shownSide(flipped) === "a" ? card.poleB : card.poleA;
  if (card.kind === "judicial_pole") {
    return {
      about: [JUDICIAL_DETAIL[card.dimension]],
      agree: `Agree records: ${shown}`,
      disagree: `Disagree records the other view: ${other}`,
      note: "Judges are never scored on policy. This only shows how a judge reads the law.",
    };
  }
  const issue = issueById(card.issueId);
  return {
    about: [
      `This card is about ${issueLabel(card.issueId).toLowerCase()}.`,
      ...(issue
        ? [
            `The two ends of this issue are "${issue.negativePole}" and "${issue.positivePole}". Neither end is the better one.`,
          ]
        : []),
    ],
    agree: `Agree records: ${shown}`,
    disagree: `Disagree records the other view: ${other}`,
    note: card.anchor
      ? "An anchor question: answer or skip it before walking your ballot."
      : "Skipping is fine. It counts as no answer, never as neutral.",
  };
}

function lower(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
