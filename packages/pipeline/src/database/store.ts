import {
  canonicalJson,
  assertReleaseBundle,
  releaseManifestInput,
  type ReleaseBundle,
} from "@ftb/types/releases";
import { z } from "zod";
import type { Evidence, Source } from "@ftb/types";
import { identityLeakGate, validatePublication, validateQuote } from "../validate.js";
import { PARTY_LABELS } from "../normalize.js";
import { sha256, type ResearchArchive } from "./archive.js";

/** A dedicated connection, not a pool, for transaction-scoped writes. */
export interface SqlConnection {
  query(sql: string, parameters?: any[]): Promise<{ rows: any[] }>;
}

async function transaction<T>(db: SqlConnection, work: () => Promise<T>): Promise<T> {
  await db.query("BEGIN");
  try {
    const result = await work();
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
const json = (value: unknown) => JSON.stringify(value);
async function object(db: SqlConnection, hash: string, bytes: Uint8Array): Promise<void> {
  if (sha256(bytes) !== hash) throw new Error("Object bytes/hash mismatch");
  await db.query(
    "INSERT INTO research.objects (content_hash, bytes) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [hash, bytes],
  );
}

export async function importResearchArchive(db: SqlConnection, archive: ResearchArchive) {
  return transaction(db, async () => {
    const inserted = await db.query(
      `INSERT INTO research.runs (run_id,input_hash,archive_hash,experimental,analysis_evaluated,as_of_date)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING run_id`,
      [
        archive.runId,
        archive.inputHash,
        archive.archiveHash,
        archive.experimental,
        archive.analysisEvaluated,
        archive.asOfDate,
      ],
    );
    if (!inserted.rows.length) {
      const prior = await db.query("SELECT archive_hash FROM research.runs WHERE run_id=$1", [
        archive.runId,
      ]);
      if (prior.rows[0]?.archive_hash !== archive.archiveHash)
        throw new Error("Run ID already contains different immutable data");
      return { runId: archive.runId, reused: true };
    }
    for (const document of archive.documents) {
      await object(db, document.hash, document.bytes);
      await db.query(
        "INSERT INTO research.artifacts (run_id,kind,content_hash,data) VALUES ($1,$2,$3,$4::jsonb)",
        [archive.runId, document.kind, document.hash, json(document.data)],
      );
    }
    for (const contest of archive.input.spec.ballot.contests)
      for (const candidate of contest.candidates) {
        const coverage = archive.research.coverage.find(
          (entry) => entry.candidateId === candidate.id,
        );
        if (!coverage) throw new Error("Missing candidate coverage");
        await db.query(
          "INSERT INTO research.people (run_id,candidate_id,contest_id,name,analysis,coverage) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)",
          [
            archive.runId,
            candidate.id,
            contest.id,
            candidate.name,
            json(archive.research.candidateAnalysis[candidate.id] ?? {}),
            json(coverage),
          ],
        );
      }
    for (const issue of archive.input.policy.issues)
      await db.query(
        "INSERT INTO research.issues (run_id,issue_id,definition) VALUES ($1,$2,$3::jsonb)",
        [archive.runId, issue.id, json(issue)],
      );
    for (const source of new Map(
      archive.research.sources.map((source) => [source.id, source]),
    ).values())
      await db.query(
        "INSERT INTO research.sources (run_id,source_id,candidate_id,contest_id,source_type,content_hash,data) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)",
        [
          archive.runId,
          source.id,
          source.candidateId ?? null,
          source.contestId,
          source.type,
          source.contentHash,
          json(source),
        ],
      );
    for (const action of new Map(
      archive.research.actions.map((action) => [action.id, action]),
    ).values())
      await db.query(
        "INSERT INTO research.actions (run_id,action_id,actor_id,action_date,action_type,data) VALUES ($1,$2,$3,$4,$5,$6::jsonb)",
        [archive.runId, action.id, action.actorId, action.date, action.type, json(action)],
      );
    for (const evidence of archive.research.evidence)
      await db.query(
        "INSERT INTO research.evidence (run_id,evidence_id,candidate_id,source_id,issue_id,kind,data) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)",
        [
          archive.runId,
          evidence.id,
          evidence.candidateId,
          evidence.sourceId,
          evidence.issueId,
          evidence.kind,
          json(evidence),
        ],
      );
    for (const [index, attempt] of archive.research.classificationAttempts.entries())
      await db.query(
        "INSERT INTO research.classification_attempts (run_id,ordinal,candidate_id,source_id,issue_id,data) VALUES ($1,$2,$3,$4,$5,$6::jsonb)",
        [
          archive.runId,
          index,
          attempt.candidateId,
          attempt.sourceId,
          attempt.issueId,
          json(attempt),
        ],
      );
    for (const [index, review] of archive.research.review.entries())
      await db.query(
        "INSERT INTO research.review_items (run_id,ordinal,data) VALUES ($1,$2,$3::jsonb)",
        [archive.runId, index, json(review)],
      );
    for (const snapshot of archive.snapshots) {
      await object(db, snapshot.contentHash, snapshot.bytes);
      await db.query(
        "INSERT INTO research.snapshots (run_id,snapshot_id,kind,content_hash,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)",
        [archive.runId, snapshot.id, snapshot.kind, snapshot.contentHash, json(snapshot.metadata)],
      );
    }
    for (const model of archive.models) {
      await object(db, model.hash, model.bytes);
      await db.query(
        "INSERT INTO research.model_calls (run_id,cache_key,content_hash,data) VALUES ($1,$2,$3,$4::jsonb)",
        [archive.runId, model.key, model.hash, json(model.data)],
      );
    }
    return { runId: archive.runId, reused: false };
  });
}

export const approvalSchema = z
  .object({
    reviewedBy: z.string().trim().min(1),
    reviewedAt: z.string().datetime(),
    archiveHash: z.string().regex(/^[a-f0-9]{64}$/),
    manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
    decision: z.literal("publish"),
  })
  .strict();
export type ReleaseApproval = z.infer<typeof approvalSchema>;

/** Publishing is a separate explicit action, never a side effect of importing a
 * scraped dataset. A real reviewed approval must bind the exact archive/release. */
export async function publishStoredRelease(
  db: SqlConnection,
  archive: ResearchArchive,
  candidate: unknown,
  approvalInput: unknown,
) {
  assertReleaseBundle(candidate);
  const bundle: ReleaseBundle = candidate;
  const { release: payload, reveal } = bundle;
  const approval = approvalSchema.parse(approvalInput);
  if (archive.experimental || archive.input.spec.demo)
    throw new Error("Experimental samples cannot become app releases");
  if (
    archive.input.spec.researchOnly ||
    archive.documents.find((document) => document.kind === "input")?.data.researchOnly
  )
    throw new Error("Research-only run is not a published release");
  if (payload.release.id !== archive.runId || payload.release.asOfDate !== archive.asOfDate)
    throw new Error("Publication/run mismatch");
  if (
    sha256(releaseManifestInput(payload)) !== payload.release.manifestHash ||
    approval.manifestHash !== payload.release.manifestHash ||
    approval.archiveHash !== archive.archiveHash
  )
    throw new Error("Approval or manifest hash mismatch");
  if (
    payload.candidates.some((profile) => profile.coverage === "full") &&
    !archive.analysisEvaluated
  )
    throw new Error("Unvalidated classification cannot power app comparisons");
  const roster = archive.input.spec.ballot.contests.flatMap((contest) =>
    contest.candidates.map((candidate) => ({ ...candidate, contestId: contest.id })),
  );
  if (
    roster.length !== payload.candidates.length ||
    archive.input.spec.ballot.contests.length !== payload.contests.length ||
    archive.input.spec.ballot.contests.some(
      (contest) => !payload.contests.some((published) => published.id === contest.id),
    )
  )
    throw new Error("Publication roster differs from research input");
  const names = archive.input.spec.ballot.contests.flatMap((contest) =>
    contest.candidates.flatMap((candidate) => [
      candidate.name,
      ...(Array.isArray(candidate.aliases)
        ? candidate.aliases.filter((alias): alias is string => typeof alias === "string")
        : []),
    ]),
  );
  const publication = validatePublication(
    payload.release,
    payload.candidates,
    payload.contests,
    payload.citations,
  );
  if (!publication.valid) throw new Error("Publication citation validation failed");
  if (
    !identityLeakGate(json(payload), {
      candidateNames: names,
      partyLabels: PARTY_LABELS,
      sourceUrls: archive.research.sources.map((source) => source.url),
    }).clean
  )
    throw new Error("Identity leak in masked release");
  const byEvidence = new Map(archive.research.evidence.map((evidence) => [evidence.id, evidence]));
  for (const profile of payload.candidates) {
    const identity = reveal.identities.find((identity) => identity.id === profile.id)!;
    const original = roster.find(
      (candidate) => `c-${sha256(`${archive.runId}:${candidate.id}`).slice(0, 24)}` === profile.id,
    );
    if (!original || original.name !== identity.name || original.contestId !== profile.contestId)
      throw new Error("Reveal identity binding mismatch");
    for (const evidence of profile.evidence) {
      const raw = byEvidence.get(evidence.id);
      if (
        !raw ||
        raw.candidateId !== original.id ||
        raw.contestId !== profile.contestId ||
        evidence.sourceId !== `s-${sha256(raw.sourceId)}` ||
        !validateQuote(raw as unknown as Evidence, archive.research.sources as unknown as Source[])
          .valid
      )
        throw new Error("Missing exact raw evidence proof");
      const { quote: _quote, ...rawFields } = raw;
      const { excerpt: _excerpt, redacted: _redacted, ...publishedFields } = evidence;
      const expected = {
        ...rawFields,
        candidateId: profile.id,
        sourceId: `s-${sha256(raw.sourceId)}`,
        ...(raw.actionId ? { actionId: `a-${sha256(raw.actionId)}` } : {}),
      };
      if (canonicalJson(expected) !== canonicalJson(publishedFields))
        throw new Error("Published evidence differs from accepted research");
    }
  }
  const bundleHash = sha256(canonicalJson({ ...bundle, approval }));
  return transaction(db, async () => {
    const run = await db.query("SELECT archive_hash FROM research.runs WHERE run_id=$1", [
      archive.runId,
    ]);
    if (run.rows[0]?.archive_hash !== archive.archiveHash)
      throw new Error("Import this exact research archive first");
    const inserted = await db.query(
      `INSERT INTO app_data.releases (release_id,research_run_id,manifest_hash,bundle_hash,ballot_style_id,as_of_date,payload,approval)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) ON CONFLICT DO NOTHING RETURNING release_id`,
      [
        archive.runId,
        archive.runId,
        payload.release.manifestHash,
        bundleHash,
        payload.ballot.ballotStyleId,
        archive.asOfDate,
        json(payload),
        json(approval),
      ],
    );
    if (!inserted.rows.length) {
      const prior = await db.query(
        "SELECT bundle_hash FROM app_data.releases WHERE release_id=$1",
        [archive.runId],
      );
      if (prior.rows[0]?.bundle_hash !== bundleHash)
        throw new Error("Release ID is immutable; publish a new release");
      return { releaseId: archive.runId, reused: true };
    }
    await db.query("INSERT INTO app_data.reveals (release_id,payload) VALUES ($1,$2::jsonb)", [
      archive.runId,
      json(reveal),
    ]);
    return { releaseId: archive.runId, reused: false };
  });
}
