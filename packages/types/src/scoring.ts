// Pure T1 scoring shared by the mobile app (on-device matching) and the pipeline.
// No I/O, no randomness, no model calls (PLAN.md §6, §7).
import type { Position, Prob } from "./index";

/** Per-issue proximity: 1 when identical, 0 at opposite poles (PLAN.md §6.5). */
export function issueAlignment(user: Position, candidate: Position): Prob {
  return 1 - Math.abs(user - candidate) / 2;
}
