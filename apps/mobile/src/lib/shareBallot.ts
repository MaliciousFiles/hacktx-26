// The "fairy-tale ballot": the voter's picks wearing their storybook characters. It holds
// characters only, never a real name or party, so it is safe to share before the unmasking.
import type { Contest, ID, Mask } from "@ftb/types";
import type { ContestPick } from "./picks";

export type BallotRow =
  | { kind: "character"; contestId: ID; contest: string; mask: Mask }
  | { kind: "write_in" | "undecided" | "skip" | "none"; contestId: ID; contest: string };

/**
 * Propositions are left off on purpose: the card is a fun "I voted" keepsake and must not reveal
 * an opinion on a ballot measure, even as a For/Against.
 */
export function ballotRows(
  contests: readonly Pick<Contest, "id" | "title" | "measure">[],
  picks: Readonly<Record<ID, ContestPick>>,
  maskFor: (candidateId: ID) => Mask | undefined,
): BallotRow[] {
  return contests
    .filter((contest) => !contest.measure)
    .map((contest) => {
      const base = { contestId: contest.id, contest: contest.title };
      const pick = picks[contest.id];
      if (!pick) return { ...base, kind: "none" };
      if (pick.kind === "measure") return { ...base, kind: "none" };
      if (pick.kind === "candidate") {
        const mask = maskFor(pick.candidateId);
        return mask ? { ...base, kind: "character", mask } : { ...base, kind: "undecided" };
      }
      return { ...base, kind: pick.kind };
    });
}

export function rowText(row: BallotRow): string {
  switch (row.kind) {
    case "character":
      return row.mask.character;
    case "write_in":
      return "A write-in";
    case "undecided":
      return "Undecided";
    case "skip":
      return "Skipped";
    case "none":
      return "Not picked yet";
  }
}

/** Rows the voter actually chose something for. */
export function isChosen(row: BallotRow): boolean {
  return row.kind === "character" || row.kind === "write_in";
}

export function shareMessage(rows: readonly BallotRow[], sample: boolean): string {
  const chosen = rows.filter(isChosen);
  const lines = chosen.map((row) => `• ${row.contest}: ${rowText(row)}`);
  return [
    "My Fairy Tale Ballot",
    ...lines,
    sample ? "Fictional sample ballot." : "Names and parties stay hidden until the unmasking.",
  ].join("\n");
}
