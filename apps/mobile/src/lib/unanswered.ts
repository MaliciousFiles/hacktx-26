// "Questions nobody answered" on a contest screen (UX.md §3.3 B2, PLAN.md §6.7).
import type { CandidateProfile, IssueId, Plan } from "@ftb/types";

const SLOTS = ["goal", "mechanism", "cost", "funding", "timeline", "whoActs"] as const;
export type PlanSlotKey = (typeof SLOTS)[number];

export interface Unanswered {
  /** Ballot-relevant issues where no candidate has any evidence. */
  issues: IssueId[];
  /** Plan slots that every candidate with a plan on that issue left "not stated". */
  slots: { issueId: IssueId; slot: PlanSlotKey }[];
}

export function unansweredQuestions(
  profiles: readonly CandidateProfile[],
  relevantIssues: readonly IssueId[],
): Unanswered {
  if (profiles.length === 0) return { issues: [], slots: [] };

  const issues = relevantIssues.filter((issueId) =>
    profiles.every((profile) => (profile.issueEvidenceState[issueId] ?? "none") === "none"),
  );

  const plansByIssue = new Map<IssueId, Plan[]>();
  for (const profile of profiles) {
    for (const plan of profile.plans) {
      plansByIssue.set(plan.issueId, [...(plansByIssue.get(plan.issueId) ?? []), plan]);
    }
  }

  const slots: Unanswered["slots"] = [];
  for (const [issueId, plans] of plansByIssue) {
    // Only a gap across the field when every candidate has a plan on this issue.
    const candidatesWithPlan = new Set(
      profiles.filter((profile) => profile.plans.some((plan) => plan.issueId === issueId)),
    );
    if (candidatesWithPlan.size !== profiles.length) continue;
    for (const slot of SLOTS) {
      if (plans.every((plan) => plan[slot].state === "not_stated")) slots.push({ issueId, slot });
    }
  }

  return { issues, slots };
}
