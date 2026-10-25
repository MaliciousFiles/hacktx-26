import type { Api, Contest } from "@ftb/types";

export function validateBallot(data: Api["GET /ballot"]["res"], style: string, release: string) {
  if (
    data?.release?.id !== release ||
    data?.ballot?.releaseId !== release ||
    data?.ballot?.ballotStyleId !== style
  ) {
    throw new Error("The API returned a different ballot or release. Check the IDs and retry.");
  }
  if (
    ![data.contests, data.candidates, data.cards, data.citations, data.ballot.contestIds].every(
      Array.isArray,
    )
  ) {
    throw new Error("This release is incomplete.");
  }
  for (const items of [data.contests, data.candidates, data.cards, data.citations]) {
    if (new Set(items.map((item) => item.id)).size !== items.length)
      throw new Error("Duplicate IDs in this release.");
  }
  if (
    data.ballot.contestIds.some((id) => !data.contests.some((contest) => contest.id === id)) ||
    data.contests.some((contest) =>
      contest.candidateIds.some((id) => !data.candidates.some((candidate) => candidate.id === id)),
    )
  ) {
    throw new Error("This release is missing contests or candidate profiles.");
  }
}

export function validateReveal(
  data: Api["GET /reveal/:contestId"]["res"],
  contest: Contest,
  release: string,
) {
  if (
    data?.releaseId !== release ||
    data?.contestId !== contest.id ||
    !Array.isArray(data.identities) ||
    data.identities.length !== contest.candidateIds.length ||
    new Set(data.identities.map((item) => item.id)).size !== data.identities.length ||
    data.identities.some((item) => !contest.candidateIds.includes(item.id) || !item.name)
  ) {
    throw new Error(
      "Names did not match this pinned release. Your masks are still on; please retry.",
    );
  }
}
