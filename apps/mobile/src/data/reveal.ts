// The only module that can see candidate identities (Inv. 7). Nothing on a pre-reveal screen
// imports this file; src/lib/lib.test.ts checks that.
import type { Api, CandidateIdentity, Contest, ID } from "@ftb/types";
import { checkReveal } from "@/lib/reveal";
import identities from "../../../../fixtures/identities-fixture.json";

type RevealRes = Api["GET /reveal/:contestId"]["res"];

const fixture = identities as {
  releaseId: string;
  contests: Record<ID, CandidateIdentity[]>;
};

async function fetchOne(contest: Contest): Promise<RevealRes> {
  // Fixture source: the same shape /reveal returns, with a short pause so the ceremony can load.
  await new Promise((resolve) => setTimeout(resolve, 250));
  return {
    releaseId: fixture.releaseId,
    contestId: contest.id,
    identities: fixture.contests[contest.id] ?? [],
  };
}

/**
 * Fetches every contest one at a time and validates each. Throws on the first failure, so the
 * caller keeps the masks on unless every contest succeeded.
 */
export async function revealAll(
  contests: readonly Contest[],
  releaseId: string,
): Promise<Record<ID, CandidateIdentity[]>> {
  const result: Record<ID, CandidateIdentity[]> = {};
  for (const contest of contests) {
    let res: RevealRes;
    try {
      res = await fetchOne(contest);
    } catch {
      res = await fetchOne(contest); // one retry per contest
    }
    result[contest.id] = checkReveal(contest, releaseId, res);
  }
  return result;
}
