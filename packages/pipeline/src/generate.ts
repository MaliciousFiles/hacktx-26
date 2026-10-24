// generate.ts — Stage 5: generate CitedSentence[] for highlights, plan slots, context (PLAN.md §4, §7).
// Uses Gemini as the pinned frontier LLM behind cachedCall().
// Every generated sentence MUST cite evidence (Invariant 2).
import { createHash } from "node:crypto";
import type {
  Evidence,
  CitedSentence,
  Plan,
  Slot,
  ContextBrief,
  ContextClaim,
  CachedCallSpec,
  IssueId,
  EvidenceRef,
} from "@ftb/types";
import { cachedCall } from "./cached_call.js";

export interface GenerateConfig {
  geminiApiKey: string;
  geminiModelVersion: string;
  rubricVersion: string;
}

interface GenerateHighlightsResponse {
  highlights: {
    text: string;
    evidenceIds: string[];
  }[];
}

interface GeneratePlanResponse {
  goal?: { text: string; evidenceIds: string[] };
  mechanism?: { text: string; evidenceIds: string[] };
  cost?: { text: string; evidenceIds: string[] } | "not_stated" | "not_applicable";
  funding?: { text: string; evidenceIds: string[] } | "not_stated" | "not_applicable";
  timeline?: { text: string; evidenceIds: string[] } | "not_stated" | "not_applicable";
  whoActs?: { text: string; evidenceIds: string[] } | "not_stated" | "not_applicable";
}

/**
 * Generate platformHighlights: neutral-voiced, every sentence cited with EvidenceRef.
 */
export async function generateHighlights(
  candidateId: string,
  evidence: Evidence[],
  config: GenerateConfig,
): Promise<CitedSentence[]> {
  if (evidence.length === 0) return [];

  const evidenceSummary = evidence.map((e) => ({
    id: e.id,
    issueId: e.issueId,
    quote: e.quote,
    position: e.position,
  }));

  const inputJson = JSON.stringify(evidenceSummary);
  const spec: CachedCallSpec = {
    model: "gemini",
    modelVersion: config.geminiModelVersion,
    rubricVersion: config.rubricVersion,
    questions: { candidateId, task: "platform_highlights" },
    inputHash: createHash("sha256").update(inputJson).digest("hex"),
  };

  const prompt = `
You are a neutral nonpartisan political summarizer.
Given the following evidence records for a candidate, write 2 to 4 concise, factual platform highlights in neutral voice.
CRITICAL RULE: Every single sentence MUST cite one or more evidence IDs from the input that directly substantiate it.
Return JSON with this schema:
{
  "highlights": [
    {
      "text": "Sentence text here.",
      "evidenceIds": ["ev-id-1"]
    }
  ]
}

Evidence:
${inputJson}

Respond with valid JSON only.`.trim();

  const response = await cachedCall<GenerateHighlightsResponse>(spec, async () => {
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
    const raw = body.candidates[0]?.content?.parts[0]?.text ?? "{\"highlights\":[]}";
    return JSON.parse(raw) as GenerateHighlightsResponse;
  });

  return (response.highlights || [])
    .filter((h) => h.evidenceIds && h.evidenceIds.length > 0 && h.text.trim().length > 0)
    .map((h) => ({
      text: h.text,
      citations: h.evidenceIds.map((id) => ({ kind: "candidate", id })),
    }));
}

function parseSlot(
  data: { text: string; evidenceIds: string[] } | "not_stated" | "not_applicable" | undefined,
): Slot {
  if (!data || data === "not_stated") {
    return { state: "not_stated" };
  }
  if (data === "not_applicable") {
    return {
      state: "not_applicable",
      reason: {
        text: "Not applicable to this office or policy proposal.",
        citations: [],
      },
    };
  }
  if (typeof data === "object" && data.text && data.evidenceIds?.length) {
    return {
      state: "documented",
      sentences: [
        {
          text: data.text,
          citations: data.evidenceIds.map((id) => ({ kind: "candidate", id })),
        },
      ],
    };
  }
  return { state: "not_stated" };
}

/**
 * Generate Plan entries for issues with evidence.
 */
export async function generatePlans(
  candidateId: string,
  evidence: Evidence[],
  config: GenerateConfig,
): Promise<Plan[]> {
  const byIssue = new Map<IssueId, Evidence[]>();
  for (const ev of evidence) {
    const list = byIssue.get(ev.issueId) ?? [];
    list.push(ev);
    byIssue.set(ev.issueId, list);
  }

  const plans: Plan[] = [];

  for (const [issueId, evs] of byIssue) {
    // Only generate plans where there are promises or advocacy
    const relevant = evs.filter((e) => e.claimType === "promise" || e.claimType === "advocacy");
    if (relevant.length === 0) continue;

    const evidenceSummary = relevant.map((e) => ({
      id: e.id,
      quote: e.quote,
      specificity: e.specificity,
    }));

    const inputJson = JSON.stringify(evidenceSummary);
    const spec: CachedCallSpec = {
      model: "gemini",
      modelVersion: config.geminiModelVersion,
      rubricVersion: config.rubricVersion,
      questions: { candidateId, issueId, task: "plan_extraction" },
      inputHash: createHash("sha256").update(inputJson).digest("hex"),
    };

    const prompt = `
Extract the candidate's concrete plan for issue "${issueId}".
Slots to extract:
- goal: what outcome they aim for
- mechanism: how they propose to achieve it
- cost: fiscal or resource cost (or "not_stated" / "not_applicable")
- funding: source of revenue or funding (or "not_stated" / "not_applicable")
- timeline: dates or milestones (or "not_stated" / "not_applicable")
- whoActs: who has authority/action required (or "not_stated" / "not_applicable")

Rule: If a slot is not stated, return "not_stated". Do NOT invent facts.
Each extracted slot must include evidenceIds from the provided list.

Return JSON:
{
  "goal": { "text": "...", "evidenceIds": ["..."] },
  "mechanism": { "text": "...", "evidenceIds": ["..."] },
  "cost": "not_stated",
  "funding": "not_stated",
  "timeline": "not_stated",
  "whoActs": { "text": "...", "evidenceIds": ["..."] }
}

Evidence:
${inputJson}

Respond with valid JSON only.`.trim();

    const planRes = await cachedCall<GeneratePlanResponse>(spec, async () => {
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
      return JSON.parse(raw) as GeneratePlanResponse;
    });

    const goal = parseSlot(planRes.goal);
    const mechanism = parseSlot(planRes.mechanism);
    const cost = parseSlot(planRes.cost);
    const funding = parseSlot(planRes.funding);
    const timeline = parseSlot(planRes.timeline);
    const whoActs = parseSlot(planRes.whoActs);

    // Compute specificity = documented slots / applicable slots
    const slots = [goal, mechanism, cost, funding, timeline, whoActs];
    const applicable = slots.filter((s) => s.state !== "not_applicable");
    const documented = slots.filter((s) => s.state === "documented");
    const specificity = applicable.length > 0 ? documented.length / applicable.length : 0;

    plans.push({
      id: `plan-${candidateId}-${issueId}`,
      issueId,
      goal,
      mechanism,
      cost,
      funding,
      timeline,
      whoActs,
      specificity,
    });
  }

  return plans;
}
