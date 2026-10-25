// The release this walkthrough reads (APP_BUILD.md §1.5). Today that is the pipeline-shaped
// fixture, so `demo` is true and every screen shows the sample mark. Screens read only from here.
import type {
  Api,
  CandidateProfile,
  Contest,
  ID,
  Issue,
  PolicyCard,
  PresentedEvidence,
  SourceCitation,
} from "@ftb/types";
import fixture from "../../../../fixtures/release-fixture.json";
import { ISSUES } from "./issues";

export type BallotRelease = Api["GET /ballot"]["res"];

// JSON imports widen string unions, so the fixture is cast to the contract it was written against.
const data = fixture as unknown as BallotRelease;

/** True while the app runs on fixtures; never mix demo data with a real release. */
export const demo = true;

export const release = data.release;
export const ballot = data.ballot;
export const cards: readonly PolicyCard[] = data.cards;

/** Official ballot styles this build knows (O5). The fixture has one. */
export const ballotStyles = [
  {
    id: data.ballot.ballotStyleId,
    precinctId: data.ballot.precinctId,
    label: "Sample ballot style",
    detail: "Fixture data: a state house race, a district court and a city bond",
  },
];

const contestsById = new Map(data.contests.map((contest) => [contest.id, contest]));
const profilesById = new Map(data.candidates.map((profile) => [profile.id, profile]));
const citationsById = new Map(data.citations.map((citation) => [citation.id, citation]));
const evidenceById = new Map<ID, PresentedEvidence>(
  data.candidates.flatMap((profile) => profile.evidence.map((item) => [item.id, item] as const)),
);
const issuesById = new Map(ISSUES.map((issue) => [issue.id, issue]));

/** Contests in official ballot order (Inv. 20). */
export const contests: readonly Contest[] = data.ballot.contestIds.flatMap((id) => {
  const contest = contestsById.get(id);
  return contest ? [contest] : [];
});

export function contestById(id: ID | undefined): Contest | undefined {
  return id ? contestsById.get(id) : undefined;
}

export function profileById(id: ID | undefined): CandidateProfile | undefined {
  return id ? profilesById.get(id) : undefined;
}

export function citationById(id: ID): SourceCitation | undefined {
  return citationsById.get(id);
}

export function evidenceItem(id: ID): PresentedEvidence | undefined {
  return evidenceById.get(id);
}

export function issueById(id: string): Issue | undefined {
  return issuesById.get(id) ?? issuesById.get(id.split(".")[0] ?? "");
}

export function issueLabel(id: string): string {
  return issuesById.get(id)?.label ?? issueById(id)?.label ?? id;
}

/** Profiles in the device's persisted random order (Inv. 15), falling back to data order. */
export function orderedProfiles(contest: Contest, order: readonly ID[] | undefined) {
  const ids = order && order.length === contest.candidateIds.length ? order : contest.candidateIds;
  return ids.flatMap((id) => {
    const profile = profilesById.get(id);
    return profile ? [profile] : [];
  });
}

/** Objective Info Mode: unopposed, or no candidate has comparable evidence (UX.md §3.3). */
export function isObjectiveOnly(contest: Contest): boolean {
  if (contest.officeKind === "measure") return false;
  if (contest.unopposed) return true;
  const profiles = contest.candidateIds.flatMap((id) => profilesById.get(id) ?? []);
  return profiles.every((profile) => profile.coverage === "objective_only");
}

/** Ballot-relevant issues for a contest: anything a candidate or the measure touches. */
export function contestIssues(contest: Contest): string[] {
  const ids = new Set<string>();
  for (const id of contest.candidateIds) {
    const profile = profilesById.get(id);
    if (!profile) continue;
    for (const issueId of Object.keys(profile.issueEvidenceState)) ids.add(issueId);
    for (const issueId of Object.keys(profile.stances)) ids.add(issueId);
  }
  for (const issueId of Object.keys(contest.measure?.issueVector ?? {})) ids.add(issueId);
  return [...ids];
}
