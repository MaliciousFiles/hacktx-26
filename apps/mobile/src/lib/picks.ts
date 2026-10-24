// A voter's choice in one contest. Stays on the phone (PLAN.md Invariant 5).
import type { ID } from "@ftb/types";

export type ContestPick =
  | { kind: "candidate"; candidateId: ID }
  | { kind: "measure"; choice: "yes" | "no" }
  | { kind: "write_in" }
  | { kind: "undecided" }
  | { kind: "skip" };

export function pickLabel(pick: ContestPick | undefined, nameFor: (id: ID) => string): string {
  if (!pick) return "Not picked";
  switch (pick.kind) {
    case "candidate":
      return nameFor(pick.candidateId);
    case "measure":
      return pick.choice === "yes" ? "For" : "Against";
    case "write_in":
      return "Write-in";
    case "undecided":
      return "Undecided";
    case "skip":
      return "Skipping this race";
  }
}

/** A pick that names someone or a side, as opposed to undecided/skip. */
export function isDecided(pick: ContestPick | undefined): boolean {
  return pick?.kind === "candidate" || pick?.kind === "measure" || pick?.kind === "write_in";
}
