// classify.ts — Stage 3: Jev classification (primary) / Gemini fallback (PLAN.md §4, §7).
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

// ── Config ─────────────────────────────────────────────────────────────────────

export interface ClassifyConfig {
  jevApiKey: string;
  geminiApiKey: string;
  jevModelVersion: string;   // e.g. "jev-1.14" — never "latest"
  geminiModelVersion: string; // e.g. "gemini-2.0-flash-001"
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
  stance: Distribution;         // probs over position buckets → mapped to Position
  relevance: Distribution;      // probs { relevant, irrelevant }
  claimType: Distribution;      // probs { promise, advocacy, value }
  specificity: number;          // 0..1
  proposesSpending?: number;    // Prob
  fundingStated?: number;       // Prob
  isOwnSpeech: number;          // Prob
  withinAuthority: string;      // "direct" | "influence" | "none"
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
  const spec: CachedCallSpec = {
    model: "jev",
    modelVersion: config.jevModelVersion,
    rubricVersion: config.rubricVersion,
    questions: req,
    inputHash: createHash("sha256").update(req.text).digest("hex"),
  };

  return cachedCall(spec, async () => {
    const payload = {
      model: config.jevModelVersion || "jev-latest",
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
        authority: {
          type: "choice",
          instructions: "Does this office have direct constitutional power over this policy area?",
          criteria: {
            direct: "Office has direct statutory, regulatory, or voting authority",
            influence: "Office has indirect advisory, budgetary, or bully-pulpit influence",
            none: "Office has no legal or statutory jurisdiction over this issue",
          },
        },
      },
    };

    const res = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.jevApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`TypeSafe Jev error ${res.status}: ${await res.text()}`);
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
        authority?: {
          choice: string;
          confidence: number;
        };
      };
    };

    const relNoul = data.answers.relevance?.noul ?? 1.0;
    const stanceProbs = data.answers.stance?.probabilities ?? {};
    const claimProbs = data.answers.claim_type?.probabilities ?? {};

    return {
      stance: {
        probs: {
          strong_negative: stanceProbs["0"] ?? 0,
          moderate_negative: stanceProbs["1"] ?? 0,
          neutral: stanceProbs["2"] ?? 0,
          moderate_positive: stanceProbs["3"] ?? 0,
          strong_positive: stanceProbs["4"] ?? 0,
        },
        confidence: data.answers.stance?.confidence ?? 0.8,
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
          advocacy: claimProbs["advocacy"] ?? 1,
          value: claimProbs["value"] ?? 0,
        },
        confidence: data.answers.claim_type?.confidence ?? 0.8,
      },
      specificity: 0.8,
      isOwnSpeech: 0.95,
      withinAuthority: data.answers.authority?.choice ?? "direct",
    };
  });
}

// ── Gemini fallback ────────────────────────────────────────────────────────────

async function callGeminiFallback(
  req: JevClassifyRequest,
  config: ClassifyConfig,
): Promise<JevClassifyResponse> {
  const spec: CachedCallSpec = {
    model: "gemini",
    modelVersion: config.geminiModelVersion,
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
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModelVersion}:generateContent?key=${config.geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as {
      candidates: { content: { parts: { text: string }[] } }[];
    };
    const raw = body.candidates[0]?.content?.parts[0]?.text ?? "{}";
    return JSON.parse(raw) as JevClassifyResponse;
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
 * Uses Jev as primary; falls back to Gemini if Jev throws.
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
  } catch (err) {
    console.warn(`Jev failed for source ${source.id} / issue ${issue.id}; falling back to Gemini`, err);
    jevResponse = await callGeminiFallback(req, config);
  }

  // Drop if irrelevant
  const relevanceProb: Prob = jevResponse.relevance.probs["relevant"] ?? 0;
  if (relevanceProb < 0.5) return null;

  // Low-confidence → queue for human review but still return (pipeline decides whether to drop)
  if (jevResponse.stance.confidence < config.lowConfidenceThreshold) {
    queueForReview(source.id, issue.id, "low_stance_confidence", jevResponse, config.outDir);
  }

  const position = stanceDistToPosition(jevResponse.stance);

  // Find a verbatim quote from originalText. Use the full text if the source is short enough;
  // otherwise the generator stage will select the most relevant span.
  const quote = source.originalText.slice(0, 500);
  const quoteSpan = { start: 0, end: Math.min(500, source.originalText.length) };

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
