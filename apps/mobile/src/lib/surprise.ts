// "Surprised?" stats after the Unmasking (UX.md §3.4 U4). Computed on the phone only.
import type { CandidateIdentity, Contest, ID } from "@ftb/types";
import type { ContestPick } from "./picks";

export interface SurpriseStats {
  partisanPicks: number;
  /** Distinct parties among the picked candidates. */
  partyCount: number;
  /** Share (0..100) of partisan picks not from the party picked most often. */
  acrossAislePct: number;
}

/** Fewer than this many partisan picks gives no stats rather than a misleading number. */
export const MIN_PARTISAN_PICKS = 2;

export function surpriseStats(
  contests: readonly Pick<Contest, "id" | "partisan">[],
  picks: Readonly<Record<ID, ContestPick>>,
  identities: Readonly<Record<ID, readonly CandidateIdentity[]>>,
): SurpriseStats | null {
  const counts = new Map<string, number>();
  let partisanPicks = 0;

  for (const contest of contests) {
    if (!contest.partisan) continue;
    const pick = picks[contest.id];
    if (pick?.kind !== "candidate") continue;
    const party = identities[contest.id]?.find((item) => item.id === pick.candidateId)?.party;
    if (!party) continue;
    partisanPicks += 1;
    counts.set(party, (counts.get(party) ?? 0) + 1);
  }

  if (partisanPicks < MIN_PARTISAN_PICKS) return null;
  const largest = Math.max(...counts.values());
  return {
    partisanPicks,
    partyCount: counts.size,
    acrossAislePct: Math.round((100 * (partisanPicks - largest)) / partisanPicks),
  };
}
