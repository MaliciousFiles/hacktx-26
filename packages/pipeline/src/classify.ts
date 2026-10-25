// classify.ts — Stage 3: Jev classification (primary) / Ollama fallback (PLAN.md §4, §7).
// All model calls go through cachedCall(). Stores the full Distribution, never just argmax.
// Low-confidence outputs are written to the human-review queue; never auto-published.
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  ClassificationInput,
  Evidence,
  Distribution,
  IssueId,
  Position,
  Prob,
  Power,
  ClaimType,
  SourceType,
  CachedCallSpec,
  Source,
  OfficialAction,
} from "@ftb/types";
import { cachedCall } from "./cached_call.js";
import {
  ollamaJson,
  object,
  probability,
  assertPinnedVersion,
  type OllamaConfig,
} from "./ollama.js";

// ── Config ─────────────────────────────────────────────────────────────────────

export interface ClassifyConfig extends OllamaConfig {
  jevApiKey: string;
  jevModelVersion: string; // e.g. "jev-1.14" — never "latest"
  rubricVersion: string;
  outDir: string;
  /** Confidence threshold below which a classification goes to human review. */
  lowConfidenceThreshold: Prob;
}

// ── Jev schema ─────────────────────────────────────────────────────────────────

interface JevClassifyRequest {
  text: string;
  issueId: IssueId;
  negativePoleLabel: string;
  positivePoleLabel: string;
  projectionVersion: string;
  mode: string;
}

interface JevClassifyResponse {
  stance: Distribution; // probs over position buckets → mapped to Position
  relevance: Distribution; // probs { relevant, irrelevant }
  claimType: Distribution; // probs { promise, advocacy, value }
  specificity: number; // 0..1
  proposesSpending?: number; // Prob
  fundingStated?: number; // Prob
  isOwnSpeech: number; // Prob
  withinAuthority: string; // "direct" | "influence" | "none"
}

// ── Jev client ─────────────────────────────────────────────────────────────────

/** Convert Jev's stance distribution to a Position scalar (-1..+1). */
function stanceDistToPosition(dist: Distribution): Position {
  // Jev returns probs over buckets like: strong_negative, moderate_negative, neutral,
  // moderate_positive, strong_positive. Weighted mean.
  const bucketWeights: Record<string, number> = {
    strong_negative: -1.0,
    moderate_negative: -0.5,
    neutral: 0.0,
    moderate_positive: 0.5,
    strong_positive: 1.0,
  };
  let sum = 0;
  let total = 0;
  for (const [label, prob] of Object.entries(dist.probs)) {
    const w = bucketWeights[label] ?? 0;
    sum += w * prob;
    total += prob;
  }
  return total > 0 ? sum / total : 0;
}

async function callJev(
  req: JevClassifyRequest,
  config: ClassifyConfig,
): Promise<JevClassifyResponse> {
  if (!config.jevApiKey) throw new Error("JEV_API_KEY is not configured");
  assertPinnedVersion(config.jevModelVersion);
  const spec: CachedCallSpec = {
    model: "jev",
    modelVersion: config.jevModelVersion,
    rubricVersion: config.rubricVersion,
    questions: { ...req, adapterVersion: "jev-ollama-v2" },
    inputHash: createHash("sha256").update(req.text).digest("hex"),
  };

  return cachedCall(spec, async () => {
    const payload = {
      model: config.jevModelVersion,
      state: req.text,
      questions: {
        relevance: {
          type: "noul",
          instructions: `Is this statement relevant to ${req.issueId} policy?`,
        },
        stance: {
          type: "score",
          instructions: `What is the candidate's stance on ${req.issueId}?`,
          criteria: [
            `Strongly aligns with: ${req.negativePoleLabel}`,
            `Moderately aligns with: ${req.negativePoleLabel}`,
            `Neutral, balanced, or mixed stance`,
            `Moderately aligns with: ${req.positivePoleLabel}`,
            `Strongly aligns with: ${req.positivePoleLabel}`,
          ],
        },
        claim_type: {
          type: "choice",
          instructions: "What kind of claim or statement is this?",
          criteria: {
            promise: "Concrete forward-looking commitment, pledge, or vote",
            advocacy: "General political advocacy or support for a direction",
            value: "General moral, philosophical, or party value statement",
          },
        },
        specificity: {
          type: "score",
          instructions:
            "How concrete and detailed is the stated plan? Rate documented detail, not feasibility or truth.",
          criteria: [
            "No concrete plan detail",
            "Some concrete mechanisms or commitments",
            "Detailed mechanism, costs, funding, timeline and actors",
          ],
        },
        own_speech: {
          type: "noul",
          instructions:
            "The text directly quotes or records the candidate's own words rather than third-party commentary.",
        },
        spending: { type: "noul", instructions: "The text explicitly proposes public spending." },
        funding: {
          type: "noul",
          instructions: "The text explicitly identifies a funding source for the proposal.",
        },
      },
    };

    const res = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      signal: AbortSignal.timeout(120_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.jevApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`TypeSafe Jev request failed (HTTP ${res.status})`);
    }

    const data = (await res.json()) as {
      model: string;
      answers: {
        relevance?: { noul: number };
        stance?: {
          score: number;
          confidence: number;
          probabilities: Record<string, number>;
        };
        claim_type?: {
          choice: string;
          confidence: number;
          probabilities: Record<string, number>;
        };
        specificity?: { score: number };
        own_speech?: { noul: number };
        spending?: { noul: number };
        funding?: { noul: number };
      };
    };

    if (data.model !== config.jevModelVersion)
      throw new Error("Jev returned an unexpected model version");
    const relNoul = data.answers.relevance?.noul ?? 0;
    const stanceProbs = data.answers.stance?.probabilities ?? {};
    const claimProbs = data.answers.claim_type?.probabilities ?? {};

    return parseClassification({
      stance: {
        probs: {
          strong_negative: stanceProbs["0"] ?? 0,
          moderate_negative: stanceProbs["1"] ?? 0,
          neutral: stanceProbs["2"] ?? 0,
          moderate_positive: stanceProbs["3"] ?? 0,
          strong_positive: stanceProbs["4"] ?? 0,
        },
        confidence: data.answers.stance?.confidence ?? 0,
      },
      relevance: {
        probs: {
          relevant: relNoul,
          irrelevant: Math.max(0, 1 - relNoul),
        },
        confidence: relNoul,
      },
      claimType: {
        probs: {
          promise: claimProbs["promise"] ?? 0,
          advocacy: claimProbs["advocacy"] ?? 0,
          value: claimProbs["value"] ?? 0,
        },
        confidence: data.answers.claim_type?.confidence ?? 0,
      },
      specificity: (data.answers.specificity?.score ?? 0) / 2,
      isOwnSpeech: data.answers.own_speech?.noul ?? 0,
      proposesSpending: data.answers.spending?.noul ?? 0,
      fundingStated: data.answers.funding?.noul ?? 0,
      withinAuthority: "none",
    });
  });
}

// ── Ollama fallback ────────────────────────────────────────────────────────────

async function callOllamaFallback(
  req: JevClassifyRequest,
  config: ClassifyConfig,
): Promise<JevClassifyResponse> {
  const spec: CachedCallSpec = {
    model: "ollama",
    modelVersion: config.ollamaModelVersion,
    rubricVersion: config.rubricVersion,
    questions: req,
    inputHash: createHash("sha256").update(req.text).digest("hex"),
  };

  const prompt = `
You are a nonpartisan political-science classifier. Given the following text, classify it on the issue axis described below.
Return a JSON object matching this schema exactly:
{
  "stance": { "probs": { "strong_negative": number, "moderate_negative": number, "neutral": number, "moderate_positive": number, "strong_positive": number }, "confidence": number },
  "relevance": { "probs": { "relevant": number, "irrelevant": number }, "confidence": number },
  "claimType": { "probs": { "promise": number, "advocacy": number, "value": number }, "confidence": number },
  "specificity": number,
  "proposesSpending": number,
  "fundingStated": number,
  "isOwnSpeech": number,
  "withinAuthority": "direct" | "influence" | "none"
}

Issue axis: "${req.issueId}"
Negative pole (-1): "${req.negativePoleLabel}"
Positive pole (+1): "${req.positivePoleLabel}"

Text to classify:
${req.text}

Respond with JSON only.`.trim();

  return cachedCall(spec, async () => {
    return ollamaJson(prompt, config, parseClassification);
  });
}

// ── Human-review queue ─────────────────────────────────────────────────────────

function queueForReview(
  sourceId: string,
  issueId: IssueId,
  reason: string,
  response: JevClassifyResponse,
  outDir: string,
): void {
  const queueDir = join(outDir, "logs");
  mkdirSync(queueDir, { recursive: true });
  appendFileSync(
    join(queueDir, "review-queue.jsonl"),
    JSON.stringify({ sourceId, issueId, reason, response, queuedAt: new Date().toISOString() }) +
      "\n",
    "utf-8",
  );
}

// ── Main classification function ───────────────────────────────────────────────

export interface IssuePoleLabel {
  id: IssueId;
  negativePole: string;
  positivePole: string;
}

/**
 * Classify a single ClassificationInput against a single issue axis.
 * Uses Jev as primary; falls back to Ollama if Jev throws.
 * Returns null when relevance confidence is below threshold (caller should drop).
 */
export async function classifyOne(
  input: ClassificationInput,
  source: Source,
  candidateId: string,
  contestId: string,
  issue: IssuePoleLabel,
  actionId: string | undefined,
  config: ClassifyConfig,
): Promise<Omit<Evidence, "id" | "date" | "quoteSpan"> | null> {
  if (input.sourceId !== source.id || input.mode === "unmasked_eval_only") {
    throw new Error("Classification requires a publishable projection for this source");
  }
  const req: JevClassifyRequest = {
    text: input.text,
    issueId: issue.id,
    negativePoleLabel: issue.negativePole,
    positivePoleLabel: issue.positivePole,
    projectionVersion: input.projectionVersion,
    mode: input.mode,
  };

  let jevResponse: JevClassifyResponse;
  try {
    jevResponse = await callJev(req, config);
  } catch {
    console.warn(`Jev failed for source ${source.id} / issue ${issue.id}; falling back to Ollama`);
    jevResponse = await callOllamaFallback(req, config);
    // Self-reported LLM confidence is not calibrated Jev confidence.
    queueForReview(source.id, issue.id, "uncalibrated_ollama_fallback", jevResponse, config.outDir);
    return null;
  }

  // Drop if irrelevant
  const relevanceProb: Prob = jevResponse.relevance.probs["relevant"] ?? 0;
  if (relevanceProb < 0.5) return null;

  // Low-confidence classifications are withheld pending human review.
  if (jevResponse.stance.confidence < config.lowConfidenceThreshold) {
    queueForReview(source.id, issue.id, "low_stance_confidence", jevResponse, config.outDir);
    return null;
  }

  const position = stanceDistToPosition(jevResponse.stance);

  // Preserve all text used for the classification; arbitrary truncation can omit
  // the passage that supported the issue classification.
  const quote = source.originalText;

  const sourceType: SourceType = source.type;
  const claimTypeArgmax = argmax(jevResponse.claimType.probs) as ClaimType;
  const withinAuthority = (jevResponse.withinAuthority ?? "none") as Power;

  return {
    contestId,
    sourceId: source.id,
    ...(actionId ? { actionId } : {}),
    candidateId,
    issueId: issue.id,
    kind: actionId ? "action" : "voice",
    sourceType,
    quote,
    position,
    distribution: jevResponse.stance,
    relevance: relevanceProb,
    isOwnSpeech: jevResponse.isOwnSpeech ?? 0,
    claimType: claimTypeArgmax,
    claimTypeDist: jevResponse.claimType,
    specificity: jevResponse.specificity ?? 0,
    proposesSpending: jevResponse.proposesSpending,
    fundingStated: jevResponse.fundingStated,
    withinAuthority,
  };
}

function argmax(probs: Record<string, number>): string {
  return Object.entries(probs).reduce((best, [k, v]) => (v > best[1] ? [k, v] : best), ["", -1])[0];
}

function parseClassification(value: unknown): JevClassifyResponse {
  const data = object(value);
  function distribution(value: unknown, labels: string[]): Distribution {
    const d = object(value),
      probs = object(d.probs);
    const entries = labels.map((label) => [label, probability(probs[label])] as const);
    if (Math.abs(entries.reduce((sum, [, p]) => sum + p, 0) - 1) > 0.01) {
      throw new Error("Model distribution must sum to one");
    }
    return { probs: Object.fromEntries(entries), confidence: probability(d.confidence) };
  }
  if (!["direct", "influence", "none"].includes(String(data.withinAuthority)))
    throw new Error("Invalid authority");
  return {
    stance: distribution(data.stance, [
      "strong_negative",
      "moderate_negative",
      "neutral",
      "moderate_positive",
      "strong_positive",
    ]),
    relevance: distribution(data.relevance, ["relevant", "irrelevant"]),
    claimType: distribution(data.claimType, ["promise", "advocacy", "value"]),
    specificity: probability(data.specificity),
    isOwnSpeech: probability(data.isOwnSpeech),
    withinAuthority: String(data.withinAuthority),
    ...(data.proposesSpending === undefined
      ? {}
      : { proposesSpending: probability(data.proposesSpending) }),
    ...(data.fundingStated === undefined ? {} : { fundingStated: probability(data.fundingStated) }),
  };
}
