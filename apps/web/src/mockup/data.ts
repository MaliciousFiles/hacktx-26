// Mockup data layer. Stands in for `GET /ballot`, `GET /reveal/:contestId` and `GET /daily`
// using the shared contract fixture. Nothing here talks to a server.
import type {
  Api,
  CandidateIdentity,
  CandidateProfile,
  Contest,
  EvidenceRef,
  IssueId,
  Mask,
  MaskSession,
  SourceCitation,
} from "@ftb/types";
import fixture from "../../../../fixtures/release-fixture.json";
import type { State } from "./state";

export type BallotResponse = Api["GET /ballot"]["res"];

export const release = fixture as unknown as BallotResponse;

export function contestById(id: string): Contest {
  const c = release.contests.find((x) => x.id === id);
  if (!c) throw new Error(`unknown contest ${id}`);
  return c;
}

export function candidatesFor(contest: Contest): CandidateProfile[] {
  return release.candidates.filter((c) => contest.candidateIds.includes(c.id));
}

export function citationFor(ref: EvidenceRef): SourceCitation | undefined {
  return ref.kind === "source" ? release.citations.find((c) => c.id === ref.id) : undefined;
}

// Labels only; the real app reads these from config/issues.yaml in the release.
export const issueLabels: Record<IssueId, string> = {
  "housing.zoning": "Zoning & land use",
  "education.funding": "Education funding",
  "economy.taxation": "Taxation",
  infrastructure: "Infrastructure",
  "judicial.text_vs_purpose": "Text vs. purpose",
  "judicial.restraint_vs_review": "Deference vs. review",
  "judicial.precedent": "Precedent",
  "judicial.procedural_strictness": "Procedural strictness",
};

export const issueLabel = (id: IssueId) => issueLabels[id] ?? id;

// Mock ballot styles for the manual selector (the real list comes from the official ballot).
export const ballotStyles = [
  { id: "travis-2026-style-001", label: "Style 001 — Central Austin (fixture)" },
  { id: "travis-2026-style-002", label: "Style 002 — not in fixture" },
];

// ── Reveal (mock `GET /reveal/:contestId`) ──────────────────────────────────
// Placeholder identities: the fixture deliberately has none, since they are reveal-only.
const identities: Record<string, CandidateIdentity> = {
  "cand-a": { id: "cand-a", name: "Placeholder Candidate One", party: "Party X" },
  "cand-b": { id: "cand-b", name: "Placeholder Candidate Two", party: "Party Y" },
  "judge-a": { id: "judge-a", name: "Placeholder Judge One", party: "Party Y" },
  "judge-b": { id: "judge-b", name: "Placeholder Judge Two", party: "Party X" },
};

export function reveal(contestId: string): Api["GET /reveal/:contestId"]["res"] {
  const contest = contestById(contestId);
  return {
    releaseId: release.release.id,
    contestId,
    identities: contest.candidateIds.map((id) => identities[id]),
  };
}

// ── Masks (device-only, crypto-random per session) ───────────────────────────
const maskCast: Omit<Mask, "imageUrl">[] = [
  { character: "Circle", title: "Teal" },
  { character: "Square", title: "Amber" },
  { character: "Triangle", title: "Violet" },
  { character: "Diamond", title: "Coral" },
  { character: "Hexagon", title: "Slate" },
  { character: "Star", title: "Olive" },
];

function randomInt(n: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
}

export function shuffle<T>(xs: T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function newMaskSession(): MaskSession {
  const map: Record<string, Mask> = {};
  for (const contest of release.contests) {
    const cast = shuffle(maskCast);
    contest.candidateIds.forEach((id, i) => {
      map[id] = { ...cast[i], imageUrl: "" };
    });
  }
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    scope: "ballot",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
    map,
  };
}

export const maskName = (m: Mask | undefined) => (m ? `${m.title} ${m.character}` : "Masked");

/** Mask label before reveal; name and party after. */
export function displayName(
  s: Pick<State, "revealed" | "masks">,
  contestId: string,
  candidateId: string,
): string {
  const ident = s.revealed[contestId]?.find((i) => i.id === candidateId);
  if (ident) return ident.party ? `${ident.name} (${ident.party})` : ident.name;
  return maskName(s.masks.map[candidateId]);
}

/** One-line, honest coverage summary for the ballot list (Invariant 20). */
export function coverageNote(contest: Contest): string {
  if (contest.measure) return "Ballot text, effects and arguments";
  if (contest.unopposed) return "Unopposed — objective info only";
  if (contest.officeKind === "judicial") return "Philosophy + objective qualifications";
  const cands = candidatesFor(contest);
  const objective = cands.filter((c) => c.coverage === "objective_only").length;
  if (objective === cands.length) return "Objective info only";
  if (objective > 0) return `${objective} of ${cands.length} candidates: objective info only`;
  return "Full evidence comparison";
}
