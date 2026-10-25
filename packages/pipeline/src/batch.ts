import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Evidence, Issue, Source, OfficialAction } from "@ftb/types";
import { aggregateCandidate } from "./aggregate.js";
import { classifyOne, type ClassifyConfig } from "./classify.js";
import { generateHighlights, generatePlans } from "./generate.js";
import { normalizeSource, type NormalizeOptions } from "./normalize.js";
import { actionToSource, classifyActions } from "./records.js";
import { snapshotSources } from "./snapshot.js";
import { validateQuote, type LeakGateBlocklist } from "./validate.js";
import { publishRelease, type PublishPayload, type PublishResult } from "./publish.js";
import { assertPinnedVersion } from "./ollama.js";

/** Prepared, election-specific inputs from ballot discovery, records and scraping.
 * Candidate profiles supply identity-free metadata; derived fields are rebuilt.
 */
export interface BatchInput {
  payload: PublishPayload;
  sources: Source[];
  actions: OfficialAction[];
  issues: Issue[];
  normalize: NormalizeOptions;
  blocklist: LeakGateBlocklist;
  gitSha: string;
}

export async function runBatch(input: BatchInput, config: ClassifyConfig): Promise<PublishResult> {
  assertPinnedVersion(config.jevModelVersion);
  assertPinnedVersion(config.ollamaModelVersion);
  // Clone so a failed run cannot mutate the caller's prepared input.
  const payload = structuredClone(input.payload);
  if (!/^[a-zA-Z0-9_-]+$/.test(payload.release.id)) throw new Error("Invalid release ID");
  if (payload.ballot.releaseId !== payload.release.id) throw new Error("Ballot/release mismatch");
  const contestIds = new Set(payload.contests.map((c) => c.id));
  if (payload.ballot.contestIds.some((id) => !contestIds.has(id)))
    throw new Error("Missing ballot contest");
  for (const contest of payload.contests) {
    for (const id of contest.candidateIds) {
      if (!payload.candidates.some((c) => c.id === id && c.contestId === contest.id)) {
        throw new Error(`Missing candidate metadata for ${id}`);
      }
    }
  }
  payload.release.modelVersions = { jev: config.jevModelVersion, llm: config.ollamaModelVersion };
  payload.release.configVersions = {
    ...payload.release.configVersions,
    rubrics: config.rubricVersion,
    projection: input.normalize.projectionVersion,
    masking: input.normalize.mode,
  };
  const snapshot = snapshotSources(
    input.sources,
    input.actions,
    payload.release.configVersions,
    input.gitSha,
    config.outDir,
  );
  const rawDir = join(config.outDir, "snapshots");
  mkdirSync(rawDir, { recursive: true });
  writeFileSync(join(rawDir, `${payload.release.id}.json`), JSON.stringify(snapshot, null, 2));
  const warnings: string[] = [];

  for (let i = 0; i < payload.candidates.length; i++) {
    const candidate = payload.candidates[i]!;
    const contest = payload.contests.find((c) => c.id === candidate.contestId);
    if (!contest || !contest.candidateIds.includes(candidate.id))
      throw new Error("Candidate/contest mismatch");
    const evidence: Evidence[] = [];
    let highlights: typeof candidate.platformHighlights = [];
    let plans: typeof candidate.plans = [];
    // Judges, uncontested races and measures retain objective information only.
    if (
      !contest.unopposed &&
      contest.officeKind !== "judicial" &&
      contest.officeKind !== "measure"
    ) {
      try {
        const issues = input.issues; // Identical axes and processing for every candidate.
        const actions = snapshot.actions.filter((a) => a.actorId === candidate.id);
        const actionResults = await classifyActions({
          actions,
          candidateId: candidate.id,
          contestId: contest.id,
          candidateNames: input.normalize.candidateNames,
          issues,
          normalize: input.normalize,
          config,
        });
        const actionSources = actions.map((a) => actionToSource(a, contest.id));
        evidence.push(
          ...actionResults.evidence.filter((ev) => validateQuote(ev, actionSources).valid),
        );
        // Unattributed multi-speaker text is withheld rather than guessed.
        for (const source of snapshot.sources.filter(
          (s) =>
            s.candidateId === candidate.id &&
            s.contestId === contest.id &&
            s.type !== "official_action",
        )) {
          if (source.attributions?.length) continue;
          const projection = normalizeSource(source, input.normalize);
          for (const issue of issues) {
            const result = await classifyOne(
              projection,
              source,
              candidate.id,
              contest.id,
              issue,
              undefined,
              config,
            );
            if (!result) continue;
            const ev: Evidence = {
              ...result,
              id: `ev-${createHash("sha256").update(`${candidate.id}:${source.id}:${issue.id}`).digest("hex").slice(0, 24)}`,
              date: source.publishedAt ?? source.fetchedAt,
              quoteSpan: { start: 0, end: result.quote.length },
            };
            if (validateQuote(ev, [source]).valid) evidence.push(ev);
          }
        }
        // Validate raw quotes first; generation and presentation see redacted excerpts.
        const masked = evidence.map((e) => ({
          ...e,
          quote: normalizeSource({ text: e.quote } as Source, input.normalize).text,
        }));
        highlights = await generateHighlights(candidate.id, masked, config);
        plans = await generatePlans(candidate.id, masked, config);
      } catch {
        warnings.push(`${candidate.id}: model stage failed; objective information only`);
        evidence.length = 0;
      }
    }
    const aggregate = aggregateCandidate({
      candidateId: candidate.id,
      contestId: contest.id,
      incumbent: candidate.incumbent,
      recordInOffice: candidate.recordInOffice,
      evidence,
      actions: snapshot.actions,
      moneyFlows: [],
      entities: new Map(),
      asOfDate: payload.release.asOfDate,
    });
    payload.candidates[i] = {
      ...aggregate,
      evidence: aggregate.evidence.map((e) => ({
        ...e,
        excerpt: normalizeSource({ text: e.excerpt } as Source, input.normalize).text,
        redacted: true,
      })),
      platformHighlights: highlights,
      plans,
      credibility: { score: 1, flags: [] },
      promiseKept: [],
      truthfulness: { factChecks: [], recordVerified: [] },
    };
  }
  // Apply the same coverage gate across the whole contest, including any failed candidate.
  for (const contest of payload.contests) {
    const candidates = payload.candidates.filter((c) => c.contestId === contest.id);
    const commonIssues = input.issues.filter((issue) =>
      candidates.every((c) => c.issueEvidenceState[issue.id] === "sufficient"),
    );
    const comparable =
      candidates.length >= 2 &&
      commonIssues.length >= 3 &&
      candidates.every((c) => c.evidenceState === "sufficient");
    if (!comparable) {
      for (const c of candidates) {
        c.coverage = "objective_only";
        c.stances = {};
        c.evidence = [];
        c.platformHighlights = [];
        c.plans = [];
        c.saysVsDoes = [];
        c.specificity = { score: 0, tier: 0 };
      }
    }
  }
  writeFileSync(
    join(rawDir, `${payload.release.id}-coverage.json`),
    JSON.stringify(
      {
        warnings,
        candidates: payload.candidates.map((c) => ({
          id: c.id,
          coverage: c.coverage,
          evidenceState: c.evidenceState,
        })),
      },
      null,
      2,
    ),
  );
  return publishRelease(payload, { outDir: config.outDir, blocklist: input.blocklist });
}
