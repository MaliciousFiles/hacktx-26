// Checks a /reveal response before any mask is destroyed (APP_BUILD.md §1.5).
import type { Api, CandidateIdentity, Contest } from "@ftb/types";

type RevealRes = Api["GET /reveal/:contestId"]["res"];

/** Returns the identities, or throws if the release or the candidate set doesn't match exactly. */
export function checkReveal(
  contest: Pick<Contest, "id" | "candidateIds">,
  releaseId: string,
  res: RevealRes,
): CandidateIdentity[] {
  if (res.releaseId !== releaseId)
    throw new Error("The reveal came from a different data release.");
  if (res.contestId !== contest.id) throw new Error("The reveal was for a different contest.");
  const ids = res.identities.map((identity) => identity.id);
  const expected = [...contest.candidateIds].sort();
  const got = [...ids].sort();
  const same =
    new Set(ids).size === ids.length &&
    got.length === expected.length &&
    got.every((id, index) => id === expected[index]);
  if (!same) throw new Error("The reveal didn't match the candidates on this contest.");
  return res.identities;
}
