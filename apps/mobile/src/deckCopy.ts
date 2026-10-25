// Icons and titles for Explore cards, shared by the deck and the E5 summary.
import type { PolicyCard } from "@ftb/types";
import type { IconName } from "@/components/art";
import { issueLabel } from "@/data/release";
import { JUDICIAL_LABEL } from "@/labels";

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
