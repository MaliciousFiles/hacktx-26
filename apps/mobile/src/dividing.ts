import type { CandidateProfile, Issue, IssueId, PresentedEvidence } from "@ftb/types";

/** A candidate needs at least this much lean toward a pole to be placed on a side. */
const SIDE_THRESHOLD = 0.25;
/** The most- and least-positive candidates must be at least this far apart. */
const MIN_SPREAD = 0.5;

export interface DividingEntry {
  profile: CandidateProfile;
  /** "thin" is shown to the voter as limited evidence. Never hidden. */
  evidenceState: "sufficient" | "thin";
  /** One cited excerpt on this issue, preferring a recorded action. */
  evidence?: PresentedEvidence;
}

export interface DividingIssue {
  issueId: IssueId;
  label: string;
  /** Short descriptions of the two poles; neither pole is disfavored. */
  positivePole: string;
  negativePole: string;
  positive: DividingEntry[];
  negative: DividingEntry[];
  /** Has stance data but leans neither way, or mixes words and actions. */
  between: DividingEntry[];
}

function pickEvidence(profile: CandidateProfile, issueId: IssueId): PresentedEvidence | undefined {
  const onIssue = profile.evidence.filter((item) => item.issueId === issueId);
  return onIssue.find((item) => item.kind === "action") ?? onIssue[0];
}

/**
 * Issues where the candidates in one contest lean opposite ways. Pure and on-device.
 * Candidate order is the caller's (session) order, so no candidate is placed first by this code.
 * Issues keep their release order, not a ranking by how dramatic the split is.
 */
export function dividingIssues(
  profiles: readonly CandidateProfile[],
  issueFor: (id: IssueId) => Issue | undefined,
): DividingIssue[] {
  const issueIds: IssueId[] = [];
  for (const profile of profiles) {
    for (const issueId of Object.keys(profile.stances)) {
      if (!issueIds.includes(issueId)) issueIds.push(issueId);
    }
  }

  const result: DividingIssue[] = [];
  for (const issueId of issueIds) {
    const entries: (DividingEntry & { position: number })[] = [];
    for (const profile of profiles) {
      const stance = profile.stances[issueId];
      const state = profile.issueEvidenceState[issueId];
      if (!stance || (state !== "sufficient" && state !== "thin")) continue;
      entries.push({
        profile,
        evidenceState: state,
        evidence: pickEvidence(profile, issueId),
        position: stance.position,
      });
    }
    if (entries.length < 2) continue;

    const positions = entries.map((entry) => entry.position);
    if (Math.max(...positions) - Math.min(...positions) < MIN_SPREAD) continue;

    const strip = ({ position: _position, ...entry }: DividingEntry & { position: number }) =>
      entry;
    const positive = entries.filter((entry) => entry.position >= SIDE_THRESHOLD);
    const negative = entries.filter((entry) => entry.position <= -SIDE_THRESHOLD);
    // A wide spread with one candidate on a pole and another in between still divides them.
    if (positive.length === 0 && negative.length === 0) continue;

    const issue = issueFor(issueId);
    result.push({
      issueId,
      label: issue?.label ?? issueId,
      positivePole: issue?.positivePole ?? "One direction",
      negativePole: issue?.negativePole ?? "The other direction",
      positive: positive.map(strip),
      negative: negative.map(strip),
      between: entries
        .filter((entry) => Math.abs(entry.position) < SIDE_THRESHOLD)
        .map(strip),
    });
  }
  return result;
}
