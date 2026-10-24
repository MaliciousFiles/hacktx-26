// Calendar for the sample election. Display only: scoring never reads the wall clock.
export const ELECTION = {
  name: "Travis County general election",
  electionDay: "2026-11-03",
  earlyVotingStart: "2026-10-19",
  earlyVotingEnd: "2026-10-30",
} as const;

export type ElectionPhase =
  | { kind: "before_early"; daysToEarly: number; daysToElection: number }
  | { kind: "early_voting"; daysLeftInEarly: number; daysToElection: number }
  | { kind: "between"; daysToElection: number }
  | { kind: "election_day" }
  | { kind: "after" };

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The phone's local calendar date as YYYY-MM-DD. */
export function localIsoDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function electionPhase(today: string): ElectionPhase {
  const daysToElection = daysBetween(today, ELECTION.electionDay);
  if (daysToElection < 0) return { kind: "after" };
  if (daysToElection === 0) return { kind: "election_day" };
  const daysToEarly = daysBetween(today, ELECTION.earlyVotingStart);
  if (daysToEarly > 0) return { kind: "before_early", daysToEarly, daysToElection };
  const daysLeftInEarly = daysBetween(today, ELECTION.earlyVotingEnd);
  if (daysLeftInEarly >= 0) return { kind: "early_voting", daysLeftInEarly, daysToElection };
  return { kind: "between", daysToElection };
}
