import { describe, expect, it } from "vitest";
import { demoBallot, demoIdentities } from "../fixtures/travisDemo";
import { validateBallot, validateReveal } from "./releaseValidation";

describe("pinned mobile releases", () => {
  const check = (data = structuredClone(demoBallot)) =>
    validateBallot(data, demoBallot.ballot.ballotStyleId, demoBallot.release.id);
  it("accepts a complete snapshot", () => expect(() => check()).not.toThrow());
  it("rejects mismatched styles and releases", () => {
    const data = structuredClone(demoBallot);
    data.ballot.releaseId = "another-release";
    expect(() => check(data)).toThrow(/different/);
    expect(() => validateBallot(demoBallot, "another-style", demoBallot.release.id)).toThrow(
      /different/,
    );
  });
  it("rejects missing profiles and duplicate records", () => {
    const data = structuredClone(demoBallot);
    data.candidates.pop();
    expect(() => check(data)).toThrow(/missing/);
    const duplicate = structuredClone(demoBallot);
    duplicate.contests.push(duplicate.contests[0]!);
    expect(() => check(duplicate)).toThrow(/Duplicate/);
  });
  it("requires the exact identity set from the same contest and release", () => {
    const contest = demoBallot.contests[0]!;
    const result = {
      releaseId: demoBallot.release.id,
      contestId: contest.id,
      identities: demoIdentities.filter((identity) => contest.candidateIds.includes(identity.id)),
    };
    expect(() => validateReveal(result, contest, demoBallot.release.id)).not.toThrow();
    expect(() =>
      validateReveal({ ...result, releaseId: "new" }, contest, demoBallot.release.id),
    ).toThrow();
    expect(() =>
      validateReveal({ ...result, identities: [] }, contest, demoBallot.release.id),
    ).toThrow();
    expect(() =>
      validateReveal(
        { ...result, identities: [result.identities[0]!, result.identities[0]!] },
        contest,
        demoBallot.release.id,
      ),
    ).toThrow();
  });
});
