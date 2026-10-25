import type { CandidateProfile, Contest } from "@ftb/types";
import { useBallotData } from "@/ballotData";
import { useSession } from "@/session";

/** What to call a candidate right now: a session mask before reveal, the real name after. */
export function useCandidateName(contest: Contest, profile: CandidateProfile) {
  const session = useSession();
  const { identityFor } = useBallotData();
  const revealed = session.revealed[contest.id] === true;
  const mask = revealed ? session.openedMasks[profile.id] : session.masks?.map[profile.id];
  const name = revealed
    ? (identityFor(profile.id)?.name ?? "Name unavailable")
    : (mask?.character ?? "Masked candidate");
  const subtitle = revealed
    ? "Same evidence as before the name."
    : (mask?.title ?? "A character for this session only");
  return { name, subtitle, revealed, character: mask?.character };
}
