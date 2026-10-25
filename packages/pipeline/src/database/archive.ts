import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { canonicalJson } from "@ftb/types/releases";
import { cacheKey } from "../cached_call.js";
import type { CachedCallSpec, Evidence, OfficialAction, Source } from "@ftb/types";
import { validateQuote } from "../validate.js";

export const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().min(1);
const json = z.record(z.string(), z.any());
const sourceSchema = z
  .object({
    id: identifier,
    contestId: identifier,
    candidateId: identifier.optional(),
    type: identifier,
    url: z.string().url(),
    contentHash: digest,
    originalText: z.string(),
    text: z.string(),
  })
  .passthrough();
const actionSchema = z
  .object({ id: identifier, actorId: identifier, date: z.string().date(), type: identifier })
  .passthrough();
const evidenceSchema = z
  .object({
    id: identifier,
    candidateId: identifier,
    contestId: identifier,
    sourceId: identifier,
    issueId: identifier,
    kind: z.enum(["action", "voice"]),
    quote: z.string().min(1),
    quoteSpan: z.object({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
    }),
    actionId: identifier.optional(),
  })
  .passthrough();
const inputSchema = z
  .object({
    spec: z
      .object({
        releaseId: identifier,
        asOfDate: z.string().date(),
        demo: z.boolean(),
        ballot: z
          .object({
            contests: z.array(
              z
                .object({
                  id: identifier,
                  candidates: z.array(z.object({ id: identifier, name: identifier }).passthrough()),
                })
                .passthrough(),
            ),
          })
          .passthrough(),
      })
      .passthrough(),
    policy: z.object({ issues: z.array(z.object({ id: identifier }).passthrough()) }).passthrough(),
  })
  .passthrough();
const researchSchema = z
  .object({
    configHash: digest,
    demo: z.boolean(),
    analysisEvaluated: z.boolean(),
    sources: z.array(sourceSchema),
    actions: z.array(actionSchema),
    evidence: z.array(evidenceSchema),
    classificationAttempts: z.array(
      z
        .object({ candidateId: identifier, sourceId: identifier, issueId: identifier })
        .passthrough(),
    ),
    review: z.array(json),
    candidateAnalysis: z.record(z.string(), z.unknown()),
    coverage: z.array(z.object({ candidateId: identifier }).passthrough()),
  })
  .passthrough();

export interface ArchiveDocument {
  kind: string;
  hash: string;
  bytes: Uint8Array;
  data: Record<string, any>;
}
export interface ArchiveSnapshot {
  id: string;
  kind: "web" | "records";
  contentHash: string;
  bytes: Uint8Array;
  metadata: Record<string, any>;
}
export interface ArchiveModel {
  key: string;
  hash: string;
  bytes: Uint8Array;
  data: Record<string, any>;
}
export interface ResearchArchive {
  runId: string;
  inputHash: string;
  archiveHash: string;
  experimental: boolean;
  analysisEvaluated: boolean;
  asOfDate: string;
  documents: ArchiveDocument[];
  snapshots: ArchiveSnapshot[];
  models: ArchiveModel[];
  input: z.infer<typeof inputSchema>;
  research: z.infer<typeof researchSchema>;
}

export function assertPublicSourceUrl(value: string): void {
  const url = new URL(value);
  if (
    !["https:", "ftp:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    [...url.searchParams.keys()].some((key) =>
      /^(?:api[-_]?key|key|token|access_token)$/i.test(key),
    )
  )
    throw new Error("Credential-bearing or unsupported source URL");
}
async function readBounded(path: string): Promise<Buffer> {
  const bytes = await readFile(path);
  if (bytes.length > 128_000_000)
    throw new Error(
      "Artifact exceeds the sample-import budget; use a batched/object-storage importer",
    );
  return bytes;
}
async function files(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory)).filter((file) => /^[a-f0-9]{64}\.json$/.test(file)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** Offline import preparation: reads only the named run's artifacts/caches,
 * verifies their hashes and exact evidence spans, never fetches or calls a model. */
export async function readResearchArchive(directory: string): Promise<ResearchArchive> {
  const documents: ArchiveDocument[] = [];
  for (const kind of ["input", "acquisition", "research", "coverage"]) {
    const bytes = await readBounded(join(directory, `${kind}.json`));
    documents.push({
      kind,
      hash: sha256(bytes),
      bytes,
      data: json.parse(JSON.parse(bytes.toString("utf8"))),
    });
  }
  const inputDoc = documents.find((document) => document.kind === "input")!;
  const researchDoc = documents.find((document) => document.kind === "research")!;
  const input = inputSchema.parse(inputDoc.data);
  const research = researchSchema.parse(researchDoc.data);
  const runId = input.spec.releaseId;
  // The runner hashes its resolved input object (not the indented file bytes).
  const inputHash = sha256(JSON.stringify(inputDoc.data));
  if (inputHash !== research.configHash || research.demo !== input.spec.demo)
    throw new Error("Research/input identity or hash mismatch");
  if (
    documents.find((document) => document.kind === "acquisition")!.data.configHash !== inputHash ||
    documents.find((document) => document.kind === "coverage")!.data.releaseId !== runId
  )
    throw new Error("Mixed-run artifacts");
  const people = new Map(
    input.spec.ballot.contests.flatMap((contest) =>
      contest.candidates.map((person) => [person.id, contest.id] as const),
    ),
  );
  const allPeople = input.spec.ballot.contests.flatMap((contest) => contest.candidates);
  if (people.size !== allPeople.length) throw new Error("Duplicate candidate IDs");
  const issueIds = new Set(input.policy.issues.map((issue) => issue.id));
  if (issueIds.size !== input.policy.issues.length) throw new Error("Duplicate issue IDs");
  const sources = new Map<string, z.infer<typeof sourceSchema>>();
  for (const source of research.sources) {
    assertPublicSourceUrl(source.url);
    if (sha256(source.originalText) !== source.contentHash)
      throw new Error("Extracted source content hash mismatch");
    if (source.candidateId && people.get(source.candidateId) !== source.contestId)
      throw new Error("Source candidate/contest mismatch");
    const prior = sources.get(source.id);
    if (prior && canonicalJson(prior) !== canonicalJson(source))
      throw new Error("Conflicting source ID");
    sources.set(source.id, source);
  }
  const actions = new Map<string, z.infer<typeof actionSchema>>();
  for (const action of research.actions) {
    if (!people.has(action.actorId) || action.date > input.spec.asOfDate)
      throw new Error("Invalid action actor or future action");
    const prior = actions.get(action.id);
    if (prior && canonicalJson(prior) !== canonicalJson(action))
      throw new Error("Conflicting action ID");
    actions.set(action.id, action);
  }
  const evidenceIds = new Set<string>();
  for (const evidence of research.evidence) {
    if (
      evidenceIds.has(evidence.id) ||
      people.get(evidence.candidateId) !== evidence.contestId ||
      !issueIds.has(evidence.issueId)
    )
      throw new Error("Invalid evidence identity/scope");
    evidenceIds.add(evidence.id);
    if (
      !Number.isSafeInteger(evidence.quoteSpan.start) ||
      evidence.quoteSpan.start >= evidence.quoteSpan.end ||
      !validateQuote(evidence as unknown as Evidence, research.sources as unknown as Source[]).valid
    )
      throw new Error("Non-exact or wrong-owner evidence quote");
    if (
      evidence.kind === "action" &&
      (!evidence.actionId || actions.get(evidence.actionId)?.actorId !== evidence.candidateId)
    )
      throw new Error("Wrong action actor");
  }
  for (const attempt of research.classificationAttempts) {
    const source = sources.get(attempt.sourceId);
    if (
      !people.has(attempt.candidateId) ||
      !source ||
      people.get(attempt.candidateId) !== source.contestId ||
      (source.candidateId && source.candidateId !== attempt.candidateId) ||
      !issueIds.has(attempt.issueId)
    )
      throw new Error("Invalid classification-attempt scope");
  }
  const snapshots: ArchiveSnapshot[] = [];
  for (const file of await files(join(directory, "web-cache"))) {
    const stored = json.parse(
      JSON.parse((await readBounded(join(directory, "web-cache", file))).toString("utf8")),
    );
    digest.parse(stored.id);
    digest.parse(stored.contentHash);
    assertPublicSourceUrl(z.string().parse(stored.url));
    const bytes = Buffer.from(z.string().parse(stored.body), "base64");
    if (`${stored.id}.json` !== file || sha256(bytes) !== stored.contentHash)
      throw new Error("Corrupt web snapshot");
    const { body: _body, ...metadata } = stored;
    snapshots.push({
      id: stored.id,
      kind: "web",
      contentHash: stored.contentHash,
      bytes,
      metadata,
    });
  }
  for (const file of await files(join(directory, "records-cache", "snapshots"))) {
    const metadata = json.parse(
      JSON.parse(
        (await readBounded(join(directory, "records-cache", "snapshots", file))).toString("utf8"),
      ),
    );
    digest.parse(metadata.id);
    digest.parse(metadata.contentHash);
    assertPublicSourceUrl(z.string().parse(metadata.sourceUrl));
    const bytes = await readBounded(
      join(directory, "records-cache", "objects", metadata.contentHash),
    );
    if (`${metadata.id}.json` !== file || sha256(bytes) !== metadata.contentHash)
      throw new Error("Corrupt records snapshot");
    snapshots.push({
      id: metadata.id,
      kind: "records",
      contentHash: metadata.contentHash,
      bytes,
      metadata,
    });
  }
  const models: ArchiveModel[] = [];
  for (const file of await files(join(directory, "model-cache"))) {
    const bytes = await readBounded(join(directory, "model-cache", file));
    const data = json.parse(JSON.parse(bytes.toString("utf8")));
    digest.parse(data.key);
    if (
      `${data.key}.json` !== file ||
      cacheKey(data.spec as CachedCallSpec) !== data.key ||
      !("result" in data)
    )
      throw new Error("Corrupt model cache entry");
    models.push({ key: data.key, hash: sha256(bytes), bytes, data });
  }
  // Every published provenance pointer must have its original bytes in the archive.
  const recordsSnapshots = new Map(
    snapshots
      .filter((snapshot) => snapshot.kind === "records")
      .map((snapshot) => [snapshot.id, snapshot]),
  );
  for (const action of research.actions as unknown as OfficialAction[])
    for (const proof of action.provenance ?? []) {
      if (recordsSnapshots.get(proof.snapshotId)?.contentHash !== proof.contentHash)
        throw new Error("Missing original action snapshot");
    }
  const archiveHash = sha256(
    canonicalJson({
      documents: documents.map((document) => [document.kind, document.hash]),
      snapshots: snapshots.map((snapshot) => [
        snapshot.kind,
        snapshot.id,
        snapshot.contentHash,
        snapshot.metadata,
      ]),
      models: models.map((model) => [model.key, model.hash]),
    }),
  );
  return {
    runId,
    inputHash,
    archiveHash,
    experimental: research.demo,
    analysisEvaluated: research.analysisEvaluated,
    asOfDate: input.spec.asOfDate,
    documents,
    snapshots,
    models,
    input,
    research,
  };
}
