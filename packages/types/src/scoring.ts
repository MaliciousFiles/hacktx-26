// Pure T1 scoring shared by the mobile app (on-device matching) and the pipeline.
// No I/O, no randomness, no model calls (PLAN.md §6, §7).
import type { Position, Prob } from "./index";

/** Per-issue proximity: 1 when identical, 0 at opposite poles (PLAN.md §6.5). */
export function issueAlignment(user: Position, candidate: Position): Prob {
  return 1 - Math.abs(user - candidate) / 2;
}

export interface WeightedPoleChoice {
  position: Position;
  /** Nonnegative card weight. Zero-weight choices do not move the mean. */
  weight: number;
}

/**
 * Weighted mean of pole choices on one issue (PLAN.md §6.3).
 * An empty list is "skipped", which is missing — not a neutral zero.
 * Negative weights are ignored so a bad card cannot flip the sign.
 */
export function userIssuePosition(choices: readonly WeightedPoleChoice[]): Position | null {
  let weighted = 0;
  let weightSum = 0;
  for (const choice of choices) {
    if (!(choice.weight > 0)) continue;
    weighted += choice.position * choice.weight;
    weightSum += choice.weight;
  }
  if (weightSum === 0) return null;
  return weighted / weightSum;
}
