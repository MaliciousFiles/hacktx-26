// Pure release-storage helpers. No database, models, filesystem, or Node imports.
import type { Api, CandidateIdentity } from "./index";

export type PublishedBallot = Api["GET /ballot"]["res"];
export interface RevealArtifact {
  releaseId: string;
  manifestHash: string;
  identities: CandidateIdentity[];
  sources?: { id: string; url: string; outlet?: string; eventDate?: unknown }[];
}
export interface ReleaseBundle {
  release: PublishedBallot;
  reveal: RevealArtifact;
}

export function canonicalJson(value: unknown): string {
  const normalized = JSON.parse(JSON.stringify(value));
  const visit = (item: unknown): string => {
    if (item === null || typeof item !== "object") return JSON.stringify(item);
    if (Array.isArray(item)) return `[${item.map(visit).join(",")}]`;
    return `{${Object.keys(item)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${visit((item as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  };
  return visit(normalized);
}

/** SHA-256 this string to obtain the pipeline's existing manifest hash. */
export function releaseManifestInput(payload: PublishedBallot): string {
  return canonicalJson({ ...payload, release: { ...payload.release, manifestHash: "" } });
}

const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
function fail(message: string): never {
  throw new Error(`Invalid release bundle: ${message}`);
}
function ids(rows: unknown[], label: string): Set<string> {
  const values = rows.map((row) =>
    typeof row === "string" ? row : object(row) ? row.id : undefined,
  );
  if (values.some((id) => typeof id !== "string" || !id)) fail(`${label} has invalid IDs`);
  const set = new Set(values as string[]);
  if (set.size !== values.length) fail(`${label} has duplicate IDs`);
  return set;
}
function equalIds(a: Set<string>, b: Set<string>, label: string): void {
  if (a.size !== b.size || [...a].some((id) => !b.has(id))) fail(`${label} ID inventory differs`);
}

const forbidden = new Set([
  "name",
  "party",
  "photoUrl",
  "website",
  "url",
  "sourceUrl",
  "originalText",
  "originalExcerpt",
  "officialText",
  "quote",
  "actorId",
  "role",
  "attributions",
  "swipes",
  "picks",
  "userVector",
  "address",
  "coordinates",
  "latitude",
  "longitude",
  "rawSources",
  "research",
]);
function noPrivateFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const child of value) noPrivateFields(child);
    return;
  }
  if (!object(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) fail(`private field ${key} in masked payload`);
    noPrivateFields(child);
  }
}

/** Structural/ownership checks shared by DB writes and reads. Citation semantics,
 * exact quote proof and identity text scanning remain pipeline publication gates. */
export function assertReleaseBundle(value: unknown): asserts value is ReleaseBundle {
  if (!object(value) || !object(value.release) || !object(value.reveal))
    fail("missing release/reveal");
  const payload = value.release;
  const reveal = value.reveal;
  const keys = ["release", "ballot", "contests", "candidates", "cards", "citations"];
  if (Object.keys(payload).sort().join() !== keys.sort().join())
    fail("unexpected masked payload fields");
  if (!object(payload.release) || !object(payload.ballot)) fail("missing release metadata/ballot");
  for (const key of ["contests", "candidates", "cards", "citations"])
    if (!Array.isArray(payload[key])) fail(`missing ${key}`);
  const metadata = payload.release;
  if (
    typeof metadata.id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(metadata.id) ||
    typeof metadata.manifestHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(metadata.manifestHash)
  )
    fail("invalid release identity/hash");
  if (
    payload.ballot.releaseId !== metadata.id ||
    reveal.releaseId !== metadata.id ||
    reveal.manifestHash !== metadata.manifestHash
  )
    fail("release or reveal version mismatch");
  if (
    typeof payload.ballot.ballotStyleId !== "string" ||
    !payload.ballot.ballotStyleId ||
    !Array.isArray(payload.ballot.contestIds)
  )
    fail("missing official style/contests");
  const contestIds = ids(payload.contests, "contests");
  equalIds(ids(payload.ballot.contestIds, "ballot contests"), contestIds, "ballot contests");
  const candidateIds = ids(payload.candidates, "profiles");
  ids(payload.cards, "cards");
  ids(payload.citations, "citations");
  const declared: string[] = [];
  for (const contest of payload.contests) {
    if (!object(contest) || !Array.isArray(contest.candidateIds)) fail("invalid contest");
    ids(contest.candidateIds, `contest ${contest.id} candidates`);
    declared.push(...contest.candidateIds);
  }
  equalIds(ids(declared, "declared candidates"), candidateIds, "profiles/contests");
  const evidenceIds = new Set<string>();
  for (const profile of payload.candidates) {
    if (
      !object(profile) ||
      typeof profile.id !== "string" ||
      !contestIds.has(profile.contestId) ||
      !Array.isArray(profile.evidence)
    )
      fail("invalid profile");
    const contest = payload.contests.find((item: any) => item.id === profile.contestId);
    if (!contest.candidateIds.includes(profile.id)) fail("profile assigned to wrong contest");
    if (profile.coverage !== "full" && profile.coverage !== "objective_only")
      fail("unknown coverage state");
    if (
      contest.officeKind === "judicial" &&
      (!object(profile.stances) || Object.keys(profile.stances).length)
    )
      fail("judicial policy stances");
    for (const evidence of profile.evidence) {
      if (
        !object(evidence) ||
        evidence.candidateId !== profile.id ||
        evidence.contestId !== profile.contestId ||
        typeof evidence.id !== "string"
      )
        fail("evidence ownership");
      if (evidenceIds.has(evidence.id)) fail("duplicate evidence ID");
      evidenceIds.add(evidence.id);
    }
  }
  if (!Array.isArray(reveal.identities)) fail("missing reveal identities");
  equalIds(ids(reveal.identities, "identities"), candidateIds, "reveal/profile");
  for (const identity of reveal.identities)
    if (!object(identity) || typeof identity.name !== "string" || !identity.name.trim())
      fail("invalid reveal name");
  noPrivateFields(payload);
}
