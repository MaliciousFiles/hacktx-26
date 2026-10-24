import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  collectVoice,
  FrozenWebClient,
  hash,
  scrapeSocial,
  socialFinders,
  SOCIAL_PLATFORMS,
  type VoiceOptions,
} from "@ftb/scraping";
import type { CandidateProfile, Contest, Evidence, OfficialAction, Source } from "@ftb/types";
import { collectCandidateRecords, scoreDecision, type CandidateRecords } from "./records.js";
import { classifyOne, type ClassifyConfig } from "./classify.js";
import { normalizeSource } from "./normalize.js";
import { aggregateCandidate } from "./aggregate.js";
import { validateQuote, identityLeakGate } from "./validate.js";
import { publishRelease, type PublishPayload } from "./publish.js";
import { withModelCache } from "./cached_call.js";

const id = z.string().regex(/^[a-zA-Z0-9_-]+$/);
const date = z.string().date();
const pinned = z
  .string()
  .min(1)
  .refine((value) => !/latest|preview/i.test(value), "Pin a non-preview model version");
export const ballotRunSchema = z
  .object({
    releaseId: id,
    asOfDate: date,
    campaignWindow: z.object({ since: date, until: date }).strict(),
    election: z
      .object({
        month: z.number().int().min(1).max(12),
        year: z.number().int().min(1789).max(9999),
      })
      .strict(),
    demo: z.boolean().default(false),
    // Official/manual input is intentional. Never compute or guess a ballot style.
    ballot: z
      .object({
        id,
        ballotStyleId: z.string().min(1),
        precinctId: z.string().optional(),
        provenance: z
          .object({ url: z.string().url(), verifiedBy: z.string().min(1), verifiedAt: date })
          .strict(),
        contests: z
          .array(
            z
              .object({
                id,
                title: z.string().min(1),
                office: z.string().min(1),
                officeKind: z.enum([
                  "legislative",
                  "executive",
                  "regulatory",
                  "judicial",
                  "board",
                  "measure",
                ]),
                districtType: z.string(),
                districtId: z.string(),
                jurisdiction: z.string().min(1),
                level: z.enum(["federal", "state", "local"]),
                partisan: z.boolean(),
                seats: z.number().int().positive(),
                candidates: z.array(
                  z
                    .object({
                      id,
                      name: z.string().min(1),
                      aliases: z.array(z.string()).default([]),
                      identifiers: z.record(z.string(), z.string()).default({}),
                      party: z.string().optional(),
                      incumbent: z.boolean(),
                      recordInOffice: z.enum(["federal", "state", "local", "none"]),
                      accounts: z
                        .array(
                          z
                            .object({
                              platform: z.enum(SOCIAL_PLATFORMS),
                              handle: z.string().min(1),
                              verifiedVia: z.string().url(),
                            })
                            .strict(),
                        )
                        .default([]),
                    })
                    .strict(),
                ),
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
    web: z
      .object({
        allowedPageHosts: z.array(z.string()),
        speechDomains: z.array(z.string()),
        campaignSites: z
          .array(
            z
              .object({ candidateId: id, url: z.string().url(), verifiedVia: z.string().url() })
              .strict(),
          )
          .default([]),
        verifiedDocuments: z
          .array(
            z
              .object({
                url: z.string().url(),
                type: z.enum(["questionnaire", "debate_speech"]),
                verifiedVia: z.string().url(),
              })
              .strict(),
          )
          .default([]),
        resultsPerQuery: z.number().int().min(1).max(100).default(10),
        maxPagesPerChannel: z.number().int().min(1).max(100).default(3),
        maxQuotesPerSource: z.number().int().min(1).max(100).default(10),
        maxSocialItems: z.number().int().min(1).max(100).default(20),
      })
      .strict(),
    records: z
      .object({
        since: date.optional(),
        documentCap: z.number().int().positive().default(12),
        houseRollCap: z.number().int().positive().default(12),
        includeTloFtp: z.boolean().default(false),
      })
      .strict()
      .default({ documentCap: 12, houseRollCap: 12, includeTloFtp: false }),
    analysis: z
      .object({
        mode: z.enum(["names_only", "names_and_party"]),
        projectionVersion: z.string().min(1),
        approvedBy: z.string().min(1),
        evaluationHash: z.string().regex(/^[a-f0-9]{64}$/),
        rubricVersion: z.string().min(1),
        jevModelVersion: pinned,
        geminiModelVersion: pinned.optional(),
        ollamaModelVersion: pinned.optional(),
        ollamaModelDigest: z.string().min(1).optional(),
        fallbackEvaluated: z.boolean().default(false),
        maxCallsPerCandidate: z.number().int().min(1).max(100),
        lowConfidenceThreshold: z.number().min(0.5).max(1),
      })
      .strict()
      .optional(),
    // Explicit approved speaker spans, bound to immutable source contents.
    attributions: z
      .array(
        z
          .object({
            sourceId: z.string(),
            contentHash: z.string().regex(/^[a-f0-9]{64}$/),
            candidateId: id,
            eventId: z.string().min(1),
            start: z.number().int().nonnegative(),
            end: z.number().int().positive(),
            approvedBy: z.string().min(1),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();
export type BallotRunSpec = z.infer<typeof ballotRunSchema>;
export interface RunPolicy {
  version: string;
  newsDomains: string[];
  questionnaireDomains: string[];
  issues: { id: string; negativePole: string; positivePole: string; levels: string[] }[];
  versions: Record<string, string>;
}
export interface BallotRunOptions {
  directory: string;
  offline?: boolean;
  gitSha: string;
  env?: {
    SERPAPI_API_KEY?: string;
    X_BEARER_TOKEN?: string;
    CONGRESS_GOV_API_KEY?: string;
    JEV_API_KEY?: string;
    GEMINI_API_KEY?: string;
    OLLAMA_API_KEY?: string;
  };
  policy: RunPolicy;
  // Dependency injection for integration tests; production uses the real adapters.
  client?: FrozenWebClient;
  collectRecords?: typeof collectCandidateRecords;
  collectVoice?: typeof collectVoice;
  classify?: typeof classifyOne;
}

export interface CandidateRunCoverage {
  contestId: string;
  candidateId: string;
  sources: number;
  actions: number;
  acceptedEvidence: number;
  modelCalls: number;
  mode: "objective_only" | "full";
  gaps: string[];
}

/** Deterministic, bounded paragraphs. Classify exactly the text whose raw span
 * will be quoted; never classify a full page then cite an unrelated first 500 chars. */
export function passageSpans(
  text: string,
  start = 0,
  end = text.length,
): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  for (const match of text.slice(start, end).matchAll(/[^\n]+/g)) {
    const offset = start + match.index;
    for (let index = 0; index < match[0].length; index += 480) {
      const chunk = match[0].slice(index, index + 480);
      if (chunk.trim().length >= 40)
        spans.push({ start: offset + index, end: offset + index + chunk.length });
    }
  }
  return spans;
}

const fixedLabels = ["Democrat", "Democratic", "Republican", "Libertarian", "Green Party"];
function redact(text: string, values: string[]): string {
  for (const value of [...new Set(values)].filter(Boolean).sort((a, b) => b.length - a.length)) {
    text = text.replace(
      new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
      "[REDACTED]",
    );
  }
  return text;
}

function objectiveProfile(
  candidateId: string,
  contestId: string,
  incumbent: boolean,
  recordInOffice: "federal" | "state" | "local" | "none",
): CandidateProfile {
  return {
    id: candidateId,
    contestId,
    coverage: "objective_only",
    incumbent,
    recordInOffice,
    evidenceState: "none",
    issueEvidenceState: {},
    stances: {},
    evidence: [],
    platformHighlights: [],
    plans: [],
    specificity: { score: 0, tier: 0 },
    credibility: { score: 1, flags: [] },
    saysVsDoes: [],
    promiseKept: [],
    truthfulness: { factChecks: [], recordVerified: [] },
  };
}

async function writeFrozenJson(path: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value, null, 2) + "\n";
  try {
    if ((await readFile(path, "utf8")) !== serialized)
      throw new Error("Frozen run artifact changed; use a new release ID");
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeFile(path, serialized);
}

export function runBallotPipeline(input: BallotRunSpec, options: BallotRunOptions) {
  const spec = ballotRunSchema.parse(input);
  return withModelCache(
    {
      directory: join(options.directory, spec.releaseId, "model-cache"),
      offline: options.offline ?? false,
    },
    () => executeBallotPipeline(spec, options),
  );
}

async function executeBallotPipeline(input: BallotRunSpec, options: BallotRunOptions) {
  const spec = ballotRunSchema.parse(input);
  if (
    spec.campaignWindow.since > spec.campaignWindow.until ||
    spec.campaignWindow.since > spec.asOfDate ||
    spec.ballot.provenance.verifiedAt > spec.asOfDate
  )
    throw new Error("Invalid fixed release dates");
  if (!spec.demo) {
    const url = new URL(spec.ballot.provenance.url);
    if (url.protocol !== "https:" || !/(^|\.)(gov|us)$/.test(url.hostname))
      throw new Error(
        "Production roster requires official government provenance; use demo:true only for explicit synthetic tests",
      );
  }
  const contestIds = spec.ballot.contests.map((contest) => contest.id);
  if (new Set(contestIds).size !== contestIds.length) throw new Error("Duplicate contest IDs");
  const candidateIds = spec.ballot.contests.flatMap((contest) =>
    contest.candidates.map((candidate) => candidate.id),
  );
  if (new Set(candidateIds).size !== candidateIds.length)
    throw new Error("Duplicate candidate IDs in roster");
  if (
    spec.ballot.contests.some(
      (contest) => contest.officeKind !== "measure" && contest.candidates.length === 0,
    )
  )
    throw new Error("Candidate contest missing its official roster");
  const configHash = hash(JSON.stringify({ spec, policy: options.policy, gitSha: options.gitSha }));
  const runDir = join(options.directory, spec.releaseId);
  await mkdir(runDir, { recursive: true });
  const configPath = join(runDir, "config-hash.txt");
  try {
    if ((await readFile(configPath, "utf8")) !== configHash)
      throw new Error("Release ID already bound to different inputs; use a new release ID");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeFile(configPath, configHash);
  const client =
    options.client ??
    new FrozenWebClient({
      directory: join(runDir, "web-cache"),
      fetchedAt: spec.asOfDate,
      offline: options.offline,
      allowedHosts: [
        "serpapi.com",
        "public.api.bsky.app",
        "api.x.com",
        ...spec.web.allowedPageHosts,
      ],
    });
  const window = {
    since: spec.campaignWindow.since,
    until: spec.campaignWindow.until < spec.asOfDate ? spec.campaignWindow.until : spec.asOfDate,
  };
  const targets = spec.ballot.contests.flatMap((contest) =>
    contest.candidates.map((candidate) => ({ contest, candidate })),
  );
  const names = targets.flatMap(({ candidate }) => [candidate.name, ...candidate.aliases]);
  const privateResearch = [];
  const allSources: Source[] = [],
    allActions: OfficialAction[] = [];
  const coverage: CandidateRunCoverage[] = [];
  for (const { contest, candidate } of targets) {
    const records = await (options.collectRecords ?? collectCandidateRecords)(
      {
        contestId: contest.id,
        candidate: {
          id: candidate.id,
          name: candidate.name,
          aliases: candidate.aliases,
          identifiers: candidate.identifiers,
        },
        office: contest.office,
        jurisdiction: contest.jurisdiction,
        ...(contest.districtId ? { district: contest.districtId } : {}),
      },
      spec.election,
      {
        ...spec.records,
        cacheDirectory: join(runDir, "records-cache"),
        cacheMode: options.offline ? "offline" : "reuse",
        congressApiKey: options.env?.CONGRESS_GOV_API_KEY,
      },
    );
    const webOptions: VoiceOptions = {
      ...spec.web,
      client,
      fetchedAt: spec.asOfDate,
      window,
      serpApiKey: options.env?.SERPAPI_API_KEY,
      newsDomains: options.policy.newsDomains,
      questionnaireDomains: options.policy.questionnaireDomains,
    };
    const voice = await (options.collectVoice ?? collectVoice)(
      {
        contestId: contest.id,
        searchContext: `${contest.title} ${contest.jurisdiction.replaceAll("/", " ")}`,
        request: {
          candidate: {
            id: candidate.id,
            name: candidate.name,
            aliases: candidate.aliases,
            identifiers: candidate.identifiers,
          },
          position: {
            office: contest.office,
            jurisdiction: contest.jurisdiction,
            district: contest.districtId,
          },
          ...spec.election,
        },
      },
      webOptions,
    );
    const actions = records.actions.filter(
      (action) => action.actorId === candidate.id && action.date <= spec.asOfDate,
    );
    const actionIds = new Set(actions.map((action) => action.id));
    allActions.push(...actions);
    allSources.push(
      ...records.sources.filter((source) => actionIds.has(source.id.replace(/^src-/, ""))),
      ...voice.sources,
    );
    coverage.push({
      contestId: contest.id,
      candidateId: candidate.id,
      sources: voice.sources.length + actions.length,
      actions: actions.length,
      acceptedEvidence: 0,
      modelCalls: 0,
      mode: "objective_only",
      gaps: [
        ...records.gaps,
        ...(records.error ? ["Records request failed"] : []),
        ...(records.incomplete ? ["Official-record coverage incomplete"] : []),
        ...voice.coverage
          .filter((row) =>
            ["error", "blocked", "not_configured", "needs_review"].includes(row.status),
          )
          .map((row) => `${row.channel}: ${row.status}`),
        "Finance collection not connected",
        "Generated highlights/plans and reviewed Explore deck not connected",
        "Debate captions/transcription and unreviewed speaker attribution remain unavailable",
      ],
    });
    privateResearch.push({ contestId: contest.id, candidateId: candidate.id, records, voice });
  }
  const social = await scrapeSocial(
    targets.map(({ contest, candidate }) => ({
      contestId: contest.id,
      candidateId: candidate.id,
      accounts: candidate.accounts,
    })),
    window,
    socialFinders(options.env ?? {}, {
      fetchedAt: spec.asOfDate,
      maxItems: spec.web.maxSocialItems,
      fetch: client.fetch,
    }),
    spec.web.maxSocialItems,
  );
  allSources.push(...social.sources);
  for (const row of coverage) {
    row.sources += social.sources.filter(
      (source) => source.contestId === row.contestId && source.candidateId === row.candidateId,
    ).length;
    row.gaps.push(
      ...social.report
        .filter((item) => item.candidateId === row.candidateId && item.status !== "scraped")
        .map((item) => `social/${item.platform}: ${item.status}`),
    );
  }
  // Scope source IDs to a release and contest; raw source IDs/URLs never escape into masked output.
  const sources = allSources.map((source) => ({
    ...source,
    contentHash: hash(source.originalText),
  }));
  const review: { candidateId: string; sourceId?: string; issueId?: string; reason: string }[] = [];
  const rawEvidence: Evidence[] = [];
  const eventByEvidence = new Map<string, string>();
  for (const { contest, candidate } of targets) {
    const row = coverage.find((item) => item.candidateId === candidate.id)!;
    if (!spec.analysis) {
      row.gaps.push("Analysis disabled: no evaluated classification projection configured");
      continue;
    }
    if (
      !options.offline &&
      !options.classify &&
      !options.env?.GEMINI_API_KEY &&
      !options.env?.JEV_API_KEY &&
      !options.env?.OLLAMA_API_KEY
    ) {
      row.gaps.push("Classification credentials unavailable");
      continue;
    }
    if (contest.officeKind === "judicial" || contest.officeKind === "measure") {
      row.gaps.push("Policy classification forbidden for this contest type");
      continue;
    }
    const issues = options.policy.issues.filter(
      (issue) => issue.id.includes(".") && issue.levels.includes(contest.level),
    );
    const byText = new Set<string>();
    for (const source of sources
      .filter((source) => source.contestId === contest.id)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
      if (source.candidateId && source.candidateId !== candidate.id) continue;
      if (source.type === "social_snippet") {
        review.push({
          candidateId: candidate.id,
          sourceId: source.id,
          reason: "Search snippet needs full original post before stance publication",
        });
        continue;
      }
      const approved = spec.attributions.filter(
        (entry) =>
          entry.sourceId === source.id &&
          entry.candidateId === candidate.id &&
          entry.contentHash === source.contentHash &&
          entry.start < entry.end &&
          entry.end <= source.originalText.length,
      );
      const ownSource =
        approved.length === 0 &&
        source.candidateId === candidate.id &&
        ["campaign_site", "social_post"].includes(source.type);
      if (!ownSource && approved.length === 0) {
        review.push({
          candidateId: candidate.id,
          sourceId: source.id,
          reason: "Requires approved speaker/actor span",
        });
        continue;
      }
      // Action interpretation must be reviewed against a specific issue; don't label omnibus bills on every axis.
      const action =
        source.type === "official_action"
          ? allActions.find(
              (item) => `src-${item.id}` === source.id && item.actorId === candidate.id,
            )
          : undefined;
      if (
        source.type === "official_action" &&
        (!action || !scoreDecision(action).scorable || action.issueIds.length === 0)
      )
        continue;
      const ranges = ownSource
        ? passageSpans(source.originalText)
        : approved.flatMap((entry) => passageSpans(source.originalText, entry.start, entry.end));
      for (const span of ranges) {
        const text = source.originalText.slice(span.start, span.end);
        const fingerprint = hash(text.replace(/\s+/g, " "));
        if (byText.has(fingerprint)) continue;
        byText.add(fingerprint);
        const view = { ...source, originalText: text, text };
        const projection = normalizeSource(view, {
          mode: spec.analysis.mode,
          projectionVersion: spec.analysis.projectionVersion,
          candidateNames: names,
          partyLabels: fixedLabels,
        });
        for (const issue of issues.filter(
          (issue) => !action || action.issueIds.includes(issue.id),
        )) {
          if (row.modelCalls >= spec.analysis.maxCallsPerCandidate) break;
          row.modelCalls++;
          try {
            const config: ClassifyConfig = {
              ...spec.analysis,
              jevApiKey: options.env?.JEV_API_KEY ?? "",
              geminiApiKey: options.env?.GEMINI_API_KEY ?? "",
              ollamaApiKey: options.env?.OLLAMA_API_KEY,
              outDir: runDir,
            };
            const result = await (options.classify ?? classifyOne)(
              projection,
              view,
              candidate.id,
              contest.id,
              issue,
              action?.id,
              config,
            );
            if (!result) continue;
            const quoteStart = text.indexOf(result.quote);
            if (
              !result.quote ||
              quoteStart < 0 ||
              result.distribution.confidence < spec.analysis.lowConfidenceThreshold ||
              (!action && result.isOwnSpeech < 0.8)
            ) {
              review.push({
                candidateId: candidate.id,
                sourceId: source.id,
                issueId: issue.id,
                reason: "Low-confidence, non-own speech or non-exact quote",
              });
              continue;
            }
            const evidence: Evidence = {
              ...result,
              id: `ev-${hash(JSON.stringify([candidate.id, source.id, span.start, issue.id]))}`,
              eventDate: source.eventDate,
              quoteSpan: {
                start: span.start + quoteStart,
                end: span.start + quoteStart + result.quote.length,
              },
            };
            if (
              evidence.candidateId !== candidate.id ||
              evidence.contestId !== contest.id ||
              evidence.sourceId !== source.id ||
              evidence.issueId !== issue.id ||
              evidence.actionId !== action?.id ||
              !Number.isFinite(evidence.position) ||
              Math.abs(evidence.position) > 1 ||
              !validateQuote(evidence, [source]).valid
            )
              throw new Error("Invalid classification output");
            if (action && scoreDecision(action).direction === -1) {
              evidence.position *= -1; // distribution must be mirrored as well
              const { mirrorDistribution } = await import("./records.js");
              evidence.distribution = mirrorDistribution(evidence.distribution);
            }
            rawEvidence.push(evidence);
            const approval = approved.find(
              (entry) =>
                evidence.quoteSpan.start >= entry.start && evidence.quoteSpan.end <= entry.end,
            );
            eventByEvidence.set(
              evidence.id,
              approval?.eventId ??
                (action
                  ? `action:${action.id}`
                  : source.type === "campaign_site"
                    ? `campaign:${candidate.id}`
                    : `post:${source.url}`),
            );
          } catch {
            review.push({
              candidateId: candidate.id,
              sourceId: source.id,
              issueId: issue.id,
              reason: "Classification unavailable or invalid",
            });
          }
        }
      }
    }
    if (row.modelCalls >= spec.analysis.maxCallsPerCandidate)
      row.gaps.push("Model-call budget reached; analysis is bounded, not exhaustive");
    row.acceptedEvidence = rawEvidence.filter(
      (evidence) => evidence.candidateId === candidate.id,
    ).length;
  }

  const publicId = (candidateId: string) =>
    `c-${hash(`${spec.releaseId}:${candidateId}`).slice(0, 24)}`;
  const sourceUrls = sources.map((source) => source.url);
  const blocklist = { candidateNames: names, partyLabels: fixedLabels, sourceUrls };
  const profiles: CandidateProfile[] = targets.map(({ contest, candidate }) => {
    const evidence = rawEvidence.filter((item) => item.candidateId === candidate.id);
    const base = objectiveProfile(
      publicId(candidate.id),
      contest.id,
      candidate.incumbent,
      candidate.recordInOffice,
    );
    if (contest.officeKind === "judicial" || contest.candidates.length <= contest.seats)
      return base;
    const aggregate = aggregateCandidate({
      candidateId: base.id,
      contestId: contest.id,
      incumbent: candidate.incumbent,
      recordInOffice: candidate.recordInOffice,
      evidence,
      actions: allActions,
      moneyFlows: [],
      entities: new Map(),
      asOfDate: spec.asOfDate,
      eventIds: Object.fromEntries(eventByEvidence),
    });
    if (aggregate.evidenceState !== "sufficient") return base;
    const independentIssues = Object.keys(aggregate.stances).filter(
      (issueId) =>
        new Set(
          evidence
            .filter((item) => item.issueId === issueId)
            .map((item) => eventByEvidence.get(item.id)),
        ).size >= 2,
    );
    if (independentIssues.length < 3) return base;
    const profile: CandidateProfile = {
      ...base,
      ...aggregate,
      id: base.id,
      // Published plan detail isn't a model's scalar wording-specificity estimate.
      specificity: { score: 0, tier: 0 },
      stances: Object.fromEntries(
        Object.entries(aggregate.stances).filter(([issueId]) =>
          independentIssues.includes(issueId),
        ),
      ),
      issueEvidenceState: Object.fromEntries(
        independentIssues.map((issueId) => [issueId, "sufficient" as const]),
      ),
      evidence: aggregate.evidence.map((item) => ({
        ...item,
        candidateId: base.id,
        sourceId: `s-${hash(item.sourceId)}`,
        ...(item.actionId ? { actionId: `a-${hash(item.actionId)}` } : {}),
        excerpt: redact(item.excerpt, [...names, ...fixedLabels, ...sourceUrls]),
        redacted: true,
      })),
    };
    if (!identityLeakGate(JSON.stringify(profile), blocklist).clean) return base;
    return profile;
  });
  // Symmetric fallback: don't offer a comparison if an opponent failed quality gates.
  for (const contest of spec.ballot.contests) {
    const indexes = targets
      .map((target, index) => (target.contest.id === contest.id ? index : -1))
      .filter((index) => index >= 0);
    const commonIssues = indexes.length
      ? Object.keys(profiles[indexes[0]!]!.stances).filter((issueId) =>
          indexes.every((index) => profiles[index]!.issueEvidenceState[issueId] === "sufficient"),
        )
      : [];
    if (
      indexes.some((index) => profiles[index]!.coverage === "objective_only") ||
      commonIssues.length < 3
    ) {
      for (const index of indexes) {
        const { candidate } = targets[index]!;
        profiles[index] = objectiveProfile(
          publicId(candidate.id),
          contest.id,
          candidate.incumbent,
          candidate.recordInOffice,
        );
      }
    } else {
      for (const index of indexes) {
        const profile = profiles[index]!;
        profile.stances = Object.fromEntries(
          Object.entries(profile.stances).filter(([issueId]) => commonIssues.includes(issueId)),
        );
        profile.issueEvidenceState = Object.fromEntries(
          Object.entries(profile.issueEvidenceState).filter(([issueId]) =>
            commonIssues.includes(issueId),
          ),
        );
        profile.evidence = profile.evidence.filter((evidence) =>
          commonIssues.includes(evidence.issueId),
        );
        profile.saysVsDoes = []; // independent event/interpretation review needed for a consequential gap flag
      }
    }
  }
  const contests: Contest[] = spec.ballot.contests.map((contest) => ({
    id: contest.id,
    title: contest.title,
    office: contest.office,
    officeKind: contest.officeKind,
    districtType: contest.districtType,
    districtId: contest.districtId,
    partisan: contest.partisan,
    candidateIds: contest.candidates.map((candidate) => publicId(candidate.id)),
    officeDescription: [],
    seats: contest.seats,
    unopposed: contest.candidates.length <= contest.seats,
    context: {
      confirmed: [],
      supporters: [],
      opponents: [],
      disputed: [],
      notes: [{ kind: "system", code: "data_unavailable" }],
    },
  }));
  const payload: PublishPayload = {
    release: {
      id: spec.releaseId,
      asOfDate: spec.asOfDate,
      campaignWindow: spec.campaignWindow,
      manifestHash: "",
      configVersions: { ...options.policy.versions, runner: "ballot-run-v1", input: configHash },
      modelVersions: spec.analysis
        ? {
            jev: spec.analysis.jevModelVersion,
            ...(spec.analysis.geminiModelVersion
              ? { gemini: spec.analysis.geminiModelVersion }
              : {}),
            ...(spec.analysis.ollamaModelVersion
              ? { ollama: `${spec.analysis.ollamaModelVersion}@${spec.analysis.ollamaModelDigest}` }
              : {}),
          }
        : {},
    },
    ballot: {
      id: spec.ballot.id,
      releaseId: spec.releaseId,
      ballotStyleId: spec.ballot.ballotStyleId,
      ...(spec.ballot.precinctId ? { precinctId: spec.ballot.precinctId } : {}),
      contestIds,
      requiresJudicialDeck: contests.some(
        (contest) => contest.officeKind === "judicial" && !contest.unopposed,
      ),
    },
    contests,
    candidates: profiles,
    cards: [],
    citations: [],
  };
  for (const [index, row] of coverage.entries()) row.mode = profiles[index]!.coverage;
  const researchArtifact = {
    configHash,
    demo: spec.demo,
    coverage,
    research: privateResearch,
    social,
    sources,
    actions: allActions,
    evidence: rawEvidence,
    evidenceEvents: Object.fromEntries(eventByEvidence),
    review,
    snapshots: client.snapshots(),
  };
  await writeFrozenJson(join(runDir, "research.json"), researchArtifact);
  const result = publishRelease(payload, { outDir: runDir, blocklist });
  if (!result.success)
    throw new Error(
      `Publication rejected: ${result.errors.join("; ")}; ${result.leaks.join("; ")}`,
    );
  const identityMap = targets.map(({ candidate }) => ({
    id: publicId(candidate.id),
    name: candidate.name,
    ...(candidate.party ? { party: candidate.party } : {}),
  }));
  await writeFrozenJson(join(runDir, "reveal.json"), {
    releaseId: spec.releaseId,
    manifestHash: result.manifestHash,
    identities: identityMap,
    sources: sources.map((source) => ({
      id: `s-${hash(source.id)}`,
      url: source.url,
      outlet: source.outlet,
      eventDate: source.eventDate,
    })),
  });
  const summary = {
    releaseId: spec.releaseId,
    manifestHash: result.manifestHash,
    demo: spec.demo,
    contests: contests.length,
    candidates: profiles.length,
    full: profiles.filter((profile) => profile.coverage === "full").length,
    objectiveOnly: profiles.filter((profile) => profile.coverage === "objective_only").length,
    cardsAvailable: false,
    coverage,
    contestCoverage: contests.map((contest) => ({
      contestId: contest.id,
      mode: profiles.some(
        (profile) => profile.contestId === contest.id && profile.coverage === "full",
      )
        ? "full"
        : "objective_only",
      gaps:
        contest.officeKind === "measure"
          ? ["Verbatim measure text, fiscal effects and YES/NO explanations not connected"]
          : ["Office descriptions and Context Brief synthesis not connected"],
    })),
    publication: result.releaseFilePath,
  };
  await writeFrozenJson(join(runDir, "coverage.json"), summary);
  return summary;
}
