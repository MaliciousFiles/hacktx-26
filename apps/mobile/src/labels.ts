import type { CredibilityFlagType, JudicialDim, OfficeKind, SourceType } from "@ftb/types";

export const SOURCE_LABEL: Record<SourceType, string> = {
  official_action: "Official action",
  official_doc: "Official document",
  questionnaire: "Questionnaire",
  debate_speech: "Debate or speech",
  campaign_site: "Campaign site",
  archived_campaign_site: "Archived campaign site",
  social_post: "Social post",
  social_snippet: "Social snippet",
  news: "News",
};

export const FLAG_COPY: Record<CredibilityFlagType, { title: string; detail: string }> = {
  beyond_power: {
    title: "Beyond this office's power",
    detail: "This counts against them. Another office would have to do it.",
  },
  needs_others: {
    title: "Needs others to act",
    detail: "They can ask. They cannot do it alone. This is an explanation, not a penalty.",
  },
  no_funding: {
    title: "No funding source stated",
    detail:
      "A cost shows up in the sample and no source is named. That is not proof that none exists.",
  },
  funded: {
    title: "A funding source is named",
    detail: "The plan names where the money would come from.",
  },
};

export const JUDICIAL_LABEL: Record<JudicialDim, string> = {
  text_vs_purpose: "Reading the law",
  restraint_vs_review: "Deferring to lawmakers",
  precedent: "Past rulings",
  procedural_strictness: "Holding government to procedure",
};

export function officeKindLabel(kind: OfficeKind): string {
  switch (kind) {
    case "legislative":
      return "Legislature";
    case "executive":
      return "Executive office";
    case "regulatory":
      return "Regulatory office";
    case "judicial":
      return "Court";
    case "board":
      return "Board";
    case "measure":
      return "Ballot measure";
  }
}

export function contestTone(kind: OfficeKind, objective: boolean): string {
  if (kind === "measure") return "No recommendation";
  if (kind === "judicial" || objective) return "Objective information";
  return "Evidence to compare";
}

export type BallotSection = "races" | "judicial" | "propositions";

export const SECTION_LABEL: Record<BallotSection, string> = {
  races: "Races",
  judicial: "Judicial",
  propositions: "Propositions",
};

/** Grouping on My Ballot. Order within the ballot is always the official order (Inv. 20). */
export function sectionOf(contest: { officeKind: OfficeKind }): BallotSection {
  if (contest.officeKind === "measure") return "propositions";
  if (contest.officeKind === "judicial") return "judicial";
  return "races";
}

export const SLOT_LABEL = {
  goal: "Goal",
  mechanism: "Mechanism",
  cost: "Cost",
  funding: "Funding",
  timeline: "Timeline",
  whoActs: "Who acts",
} as const;

export const TIER_LABEL = ["Limited detail", "Some detail", "Detailed"] as const;

export const BUCKET_COPY = {
  happily_ever_after: { emoji: "✨", label: "Happily Ever After" },
  good_company: { emoji: "🤝", label: "Good Company" },
  different_paths: { emoji: "🧭", label: "Different Paths" },
  worlds_apart: { emoji: "🌙", label: "Worlds Apart" },
  clouded: { emoji: "🪞", label: "Clouded Mirror" },
} as const;

/** Plain-language background for the judicial cards' "More info". */
export const JUDICIAL_DETAIL: Record<JudicialDim, string> = {
  text_vs_purpose:
    "Some judges read a law by its exact words. Others read it in light of the problem lawmakers were trying to solve. Both are mainstream approaches.",
  restraint_vs_review:
    "When a law is challenged, some judges lean toward leaving lawmakers' choices in place. Others are more willing to strike a law down.",
  precedent:
    "Past rulings guide future ones. Judges differ on how strong a reason they need before departing from them.",
  procedural_strictness:
    "Courts differ on how strictly they hold the government and the parties to deadlines, filing rules and procedure.",
};
