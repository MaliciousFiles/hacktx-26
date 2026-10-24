// records.ts — Stage 0/1 bridge: @ftb/records → pipeline (PLAN.md §4, §7).
// ballot target → CandidateResearchRequest → researchCandidateHistory → OfficialAction[]
// → Source[] (official_action) → normalize/classify → Evidence (kind "action").
//
// Rules enforced here (not in records, which only reports what the record says):
//  - Only actions that express a direction (yes / no / author) are scored. Advisory or
//    non-personal acts (AG opinions, orders, judicial opinions, cosponsor, abstain) are kept as
//    Sources/actions for citation but never enter stance aggregation.
//  - A "no" vote mirrors the stance of the measure text; the classifier reads the measure, not
//    how the candidate voted.
//  - Consent-calendar votes are not scored.
//  - Records coverage/gaps are carried to a manifest: an empty or partial result is
//    "not found", never proof of inaction.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { researchCandidateHistory } from "@ftb/records";
import type { HistoryResearchInput, HistoryResearchResult, RecordCoverage } from "@ftb/records";
import type {
  CandidateResearchRequest,
  ClassificationInput,
  Distribution,
  Evidence,
  OfficialAction,
  Source,
} from "@ftb/types";
import {
  classifyOne,
  type ClassifyConfig,
  type IssuePoleLabel,
} from "./classify.js";
import { normalizeSource, type NormalizeOptions } from "./normalize.js";
import { snapshotSources, type SnapshotResult } from "./snapshot.js";

// ── Targets ────────────────────────────────────────────────────────────────────

/** One candidate in one contest — the unit records researches. */
export interface RecordsTarget {
  contestId: string;
  /** Race the candidate is running in (election cutoff only; history is never filtered by it). */
  office: string;
  jurisdiction: string;
  district?: string;
  candidate: {
    id: string;
    name: string;
    aliases?: string[];
    identifiers?: Record<string, string>;
  };
}

export interface ElectionDate {
  month: number;
  year: number;
}

/** Build a target from the pipeline's Contest plus the discovered candidate. */
export function targetFromContest(
  contest: { id: string; office: string; districtId?: string },
  candidate: RecordsTarget["candidate"],
  jurisdiction: string,
): RecordsTarget {
  return {
    contestId: contest.id,
    office: contest.office,
    jurisdiction,
    ...(contest.districtId ? { district: contest.districtId } : {}),
    candidate,
  };
}

export function buildResearchInput(
  target: RecordsTarget,
  election: ElectionDate,
  options: RecordsStageOptions = {},
): HistoryResearchInput {
  const bioguide = target.candidate.identifiers?.bioguide;
  return {
    name: target.candidate.name,
    office: target.office,
    jurisdiction: target.jurisdiction,
    ...(target.district ? { district: target.district } : {}),
    month: election.month,
    year: election.year,
    candidateId: target.candidate.id,
    ...(target.candidate.aliases?.length ? { aliases: target.candidate.aliases } : {}),
    ...(bioguide ? { bioguide } : {}),
    ...(options.since ? { since: options.since } : {}),
    ...(options.houseRollCap !== undefined ? { houseRollCap: options.houseRollCap } : {}),
    ...(options.documentCap !== undefined ? { documentCap: options.documentCap } : {}),
    ...(options.includeTloFtp !== undefined ? { includeTloFtp: options.includeTloFtp } : {}),
    ...(options.cacheDirectory ? { cacheDirectory: options.cacheDirectory } : {}),
    ...(options.cacheMode ? { cacheMode: options.cacheMode } : {}),
    ...(options.congressApiKey ? { congressApiKey: options.congressApiKey } : {}),
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
  };
}

// ── Action → Source ────────────────────────────────────────────────────────────

export function actionSourceId(action: OfficialAction): string {
  return `src-${action.id}`;
}

/** Wrap an OfficialAction as a Source so it flows through normalize/classify. */
export function actionToSource(action: OfficialAction, contestId: string): Source {
  const originalText = [action.title, action.officialText].filter((t) => t.trim()).join("\n\n");
  return {
    id: actionSourceId(action),
    contestId,
    candidateId: action.actorId,
    type: "official_action",
    url: action.sourceUrl,
    publishedAt: action.date,
    fetchedAt: action.provenance?.[0]?.fetchedAt.slice(0, 10) ?? action.date,
    contentHash: "", // stamped by snapshotSources
    originalText,
    text: originalText,
  };
}

// ── Scoring policy ─────────────────────────────────────────────────────────────

export type ScoreDirection = 1 | -1;

export interface ScoreDecision {
  scorable: boolean;
  /** +1: the candidate's act supports the measure's direction; -1: opposes it. */
  direction?: ScoreDirection;
  reason?: string;
}

const NON_SCORING_TYPES = new Set<OfficialAction["type"]>([
  "legal_opinion", // advisory; OAG states opinions are not the AG's personal views
  "judicial_opinion",
  "executive_order",
  "appointment",
  "signed",
  "vetoed",
]);

export function scoreDecision(action: OfficialAction): ScoreDecision {
  if (NON_SCORING_TYPES.has(action.type)) {
    return { scorable: false, reason: `type:${action.type}` };
  }
  if (action.consent) return { scorable: false, reason: "consent_vote" };
  if (action.stance === "yes" || action.stance === "author") return { scorable: true, direction: 1 };
  if (action.stance === "no") return { scorable: true, direction: -1 };
  return { scorable: false, reason: `stance:${action.stance}` };
}

const MIRROR: Record<string, string> = {
  strong_negative: "strong_positive",
  moderate_negative: "moderate_positive",
  strong_positive: "strong_negative",
  moderate_positive: "moderate_negative",
};

/** Mirror a stance distribution (opposing a measure flips its pole). */
export function mirrorDistribution(dist: Distribution): Distribution {
  const probs: Record<string, number> = {};
  for (const [label, p] of Object.entries(dist.probs)) probs[MIRROR[label] ?? label] = p;
  return { ...dist, probs };
}

// ── Classification of actions ──────────────────────────────────────────────────

export type ClassifyFn = typeof classifyOne;

export interface ClassifyActionsInput {
  actions: OfficialAction[];
  contestId: string;
  candidateId: string;
  candidateNames: string[];
  issues: IssuePoleLabel[];
  normalize: Omit<NormalizeOptions, "candidateNames">;
  config: ClassifyConfig;
  classify?: ClassifyFn;
}

export interface ClassifyActionsResult {
  evidence: Evidence[];
  notScored: { actionId: string; reason: string }[];
}

/**
 * Turn OfficialActions into Evidence (kind "action"). Issues come from the action's `issueIds`
 * when records provided them, otherwise every issue axis is tried and the classifier's
 * relevance gate drops the rest.
 */
export async function classifyActions(input: ClassifyActionsInput): Promise<ClassifyActionsResult> {
  const classify = input.classify ?? classifyOne;
  const evidence: Evidence[] = [];
  const notScored: ClassifyActionsResult["notScored"] = [];

  for (const action of input.actions) {
    if (action.actorId !== input.candidateId) {
      notScored.push({ actionId: action.id, reason: "actor_mismatch" });
      continue;
    }
    const decision = scoreDecision(action);
    if (!decision.scorable || !decision.direction) {
      notScored.push({ actionId: action.id, reason: decision.reason ?? "not_scorable" });
      continue;
    }

    const source = actionToSource(action, input.contestId);
    const cls: ClassificationInput = normalizeSource(source, {
      ...input.normalize,
      candidateNames: input.candidateNames,
    });
    const issues =
      action.issueIds.length > 0
        ? input.issues.filter((i) => action.issueIds.includes(i.id))
        : input.issues;

    for (const issue of issues) {
      const out = await classify(
        cls,
        source,
        input.candidateId,
        input.contestId,
        issue,
        action.id,
        input.config,
      );
      if (!out) continue;
      const flipped = decision.direction === -1;
      evidence.push({
        ...out,
        id: `ev-${action.id}-${issue.id}`,
        date: action.date,
        quoteSpan: { start: 0, end: out.quote.length },
        position: flipped ? -out.position : out.position,
        distribution: flipped ? mirrorDistribution(out.distribution) : out.distribution,
        // A vote or authorship is not the candidate's own speech.
        isOwnSpeech: 0,
      });
    }
  }
  return { evidence, notScored };
}

// ── Collection ─────────────────────────────────────────────────────────────────

export interface RecordsStageOptions {
  since?: string;
  houseRollCap?: number;
  documentCap?: number;
  includeTloFtp?: boolean;
  cacheDirectory?: string;
  cacheMode?: HistoryResearchInput["cacheMode"];
  congressApiKey?: string;
  onProgress?: (message: string) => void;
  /** Injectable for tests; defaults to @ftb/records `researchCandidateHistory`. */
  research?: (input: HistoryResearchInput) => Promise<HistoryResearchResult>;
}

export interface CandidateRecords {
  target: RecordsTarget;
  request: CandidateResearchRequest;
  actions: OfficialAction[];
  sources: Source[];
  coverage: RecordCoverage[];
  gaps: string[];
  identityNotes: string[];
  /** Any partial / needs_review / unavailable / not_implemented source, or any known gap. */
  incomplete: boolean;
  error?: string;
}

export function isRecordsIncomplete(coverage: RecordCoverage[], gaps: string[]): boolean {
  return gaps.length > 0 || coverage.some((c) => c.status !== "complete");
}

/** Research one candidate. Never throws: a failed lookup is recorded as incomplete. */
export async function collectCandidateRecords(
  target: RecordsTarget,
  election: ElectionDate,
  options: RecordsStageOptions = {},
): Promise<CandidateRecords> {
  const research = options.research ?? researchCandidateHistory;
  try {
    const result = await research(buildResearchInput(target, election, options));
    // Defense in depth: keep only this candidate's actions (records also enforces this).
    const actions = result.actions.filter((a) => a.actorId === target.candidate.id);
    return {
      target,
      request: result.request,
      actions,
      sources: actions.map((a) => actionToSource(a, target.contestId)),
      coverage: result.coverage,
      gaps: result.gaps,
      identityNotes: result.identityNotes,
      incomplete: isRecordsIncomplete(result.coverage, result.gaps),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      target,
      request: {
        candidate: target.candidate,
        position: {
          office: target.office,
          jurisdiction: target.jurisdiction,
          ...(target.district ? { district: target.district } : {}),
        },
        month: election.month,
        year: election.year,
      },
      actions: [],
      sources: [],
      coverage: [],
      gaps: [],
      identityNotes: [],
      incomplete: true,
      error: message,
    };
  }
}

// ── Stage ──────────────────────────────────────────────────────────────────────

export interface RecordsManifestEntry {
  contestId: string;
  candidateId: string;
  office: string;
  actions: number;
  scorable: number;
  incomplete: boolean;
  error?: string;
  gaps: string[];
  coverage: { source: string; status: RecordCoverage["status"]; actionCount: number; reason: string }[];
}

export interface RecordsManifest {
  stage: "records";
  createdAt: string;
  election: ElectionDate;
  candidates: RecordsManifestEntry[];
}

export interface RecordsStageResult {
  candidates: CandidateRecords[];
  snapshot: SnapshotResult;
  manifest: RecordsManifest;
}

export function buildRecordsManifest(
  candidates: CandidateRecords[],
  election: ElectionDate,
): RecordsManifest {
  return {
    stage: "records",
    createdAt: new Date().toISOString(),
    election,
    candidates: candidates.map((c) => ({
      contestId: c.target.contestId,
      candidateId: c.target.candidate.id,
      office: c.target.office,
      actions: c.actions.length,
      scorable: c.actions.filter((a) => scoreDecision(a).scorable).length,
      incomplete: c.incomplete,
      ...(c.error ? { error: c.error } : {}),
      gaps: c.gaps,
      coverage: c.coverage.map(({ source, status, actionCount, reason }) => ({
        source,
        status,
        actionCount,
        reason,
      })),
    })),
  };
}

/**
 * Collect records for every target, snapshot the resulting sources/actions, and write
 * dist/manifests/records-<ts>.json. Candidates are researched sequentially: records throttles
 * per host and the caches are shared.
 */
export async function runRecordsStage(
  targets: RecordsTarget[],
  election: ElectionDate,
  stage: {
    outDir: string;
    gitSha: string;
    configVersions: Record<string, string>;
    options?: RecordsStageOptions;
  },
): Promise<RecordsStageResult> {
  const candidates: CandidateRecords[] = [];
  for (const target of targets) {
    candidates.push(await collectCandidateRecords(target, election, stage.options));
  }

  const snapshot = snapshotSources(
    candidates.flatMap((c) => c.sources),
    candidates.flatMap((c) => c.actions),
    stage.configVersions,
    stage.gitSha,
    stage.outDir,
  );

  const manifest = buildRecordsManifest(candidates, election);
  const dir = join(stage.outDir, "manifests");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `records-${manifest.createdAt.replace(/[:.]/g, "-")}.json`),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );

  return { candidates, snapshot, manifest };
}
