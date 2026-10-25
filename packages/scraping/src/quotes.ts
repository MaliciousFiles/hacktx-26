import type { Source } from "@ftb/types";

export interface QuoteLead {
  sourceId: string;
  quote: string;
  quoteSpan: { start: number; end: number };
  requiresAttributionReview: true;
  kind?: "quoted" | "qa_answer" | "heading_answer";
  /** Why the lead was kept: a reviewed single-candidate page, or the candidate's name next to it. */
  attribution?: "verified_single_candidate" | "name_proximity";
}

export interface QuoteNames {
  candidateId: string;
  /** Full name plus verified aliases. */
  names: string[];
  /** Other candidates in the same contest (their names make the nearest-speaker test sharper). */
  rivalNames?: string[];
}

export interface QuoteExtraction {
  leads: QuoteLead[];
  /** Candidate-shaped spans found but not accepted for lack of speaker evidence. */
  rejected: number;
  scanned: number;
}

// Distances are in UTF-16 code units of originalText.
export const QUOTE_NAME_BEFORE = 300;
export const QUOTE_NAME_AFTER = 200;
export const ANSWER_NAME_BEFORE = 600;
// Answers follow a name header; a name after one is the next respondent's header, not a speaker.
export const ANSWER_NAME_AFTER = -1;

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"]);

function surnameOf(name: string): string | undefined {
  const parts = name
    .replace(/[“”"]/g, "")
    .split(/\s+/)
    .filter((part) => part && !SUFFIXES.has(part.toLowerCase()));
  const last = parts.at(-1)?.replace(/[.,]$/, "");
  return last && last.length >= 3 && parts.length > 1 ? last : undefined;
}

const pattern = (value: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escape(value).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`, "giu");

interface Mention {
  start: number;
  end: number;
  own: boolean;
}

function mentions(text: string, ctx: QuoteNames): Mention[] {
  const rivalSurnames = new Set(
    (ctx.rivalNames ?? []).map((n) => surnameOf(n)?.toLowerCase()).filter(Boolean),
  );
  const own: string[] = [];
  for (const name of ctx.names) {
    own.push(name);
    const surname = surnameOf(name);
    // A shared surname is not evidence for either relative.
    if (surname && !rivalSurnames.has(surname.toLowerCase())) own.push(surname);
  }
  const rival: string[] = [];
  const ownSurnames = new Set(ctx.names.map((n) => surnameOf(n)?.toLowerCase()).filter(Boolean));
  for (const name of ctx.rivalNames ?? []) {
    rival.push(name);
    const surname = surnameOf(name);
    if (surname && !ownSurnames.has(surname.toLowerCase())) rival.push(surname);
  }
  const out: Mention[] = [];
  for (const [list, isOwn] of [
    [own, true],
    [rival, false],
  ] as const)
    for (const value of list)
      for (const match of text.matchAll(pattern(value)))
        out.push({ start: match.index, end: match.index + match[0].length, own: isOwn });
  return out;
}

/** True when the nearest mention (before/after, within bounds) is the candidate's. */
function nameNearby(
  all: Mention[],
  span: { start: number; end: number },
  before: number,
  after: number,
): boolean {
  let best: { distance: number; own: boolean } | undefined;
  let tie = false;
  for (const mention of all) {
    if (mention.start >= span.start && mention.end <= span.end) continue; // names inside the quote prove nothing
    const distance =
      mention.end <= span.start
        ? span.start - mention.end
        : mention.start >= span.end
          ? mention.start - span.end
          : 0;
    const limit = mention.end <= span.start ? before : after;
    if (distance > limit) continue;
    if (!best || distance < best.distance) {
      best = { distance, own: mention.own };
      tie = false;
    } else if (distance === best.distance && mention.own !== best.own) tie = true;
  }
  return !!best && best.own && !tie;
}

interface RawLead {
  start: number;
  end: number;
  kind: NonNullable<QuoteLead["kind"]>;
}

function rawLeads(source: Source): RawLead[] {
  const text = source.originalText;
  const raw: RawLead[] = [];
  // Q: ... A: ...  (same line or consecutive lines). Only the answer text is a lead.
  const qa =
    /(?<![\p{L}\p{N}])(?:Q|Question)\s*[:.]\s*[^\n]{3,500}?\s*(?<![\p{L}\p{N}])(?:A|Answer)\s*[:.]\s*([^\n]{30,2000})/gdu;
  for (const match of text.matchAll(qa)) {
    const [start, end] = match.indices![1]!;
    const answer = text.slice(start, end).trimEnd();
    raw.push({ start, end: start + answer.length, kind: "qa_answer" });
  }
  // Heading/paragraph answers are only read on pages already typed as questionnaires.
  if (source.type === "questionnaire") {
    let offset = 0;
    const lines = text.split("\n").map((line) => {
      const entry = { line, start: offset };
      offset += line.length + 1;
      return entry;
    });
    for (let i = 0; i < lines.length - 1; i++) {
      const question = lines[i]!.line.trim();
      if (!question.endsWith("?") || question.length < 10 || question.length > 300) continue;
      if (/^(?:Q|Question)\s*[:.]/i.test(question)) continue;
      let j = i + 1;
      while (j < lines.length && !lines[j]!.line.trim()) j++;
      const answer = lines[j];
      if (!answer) continue;
      const body = answer.line.trim();
      if (body.length < 30 || body.length > 2000 || body.endsWith("?")) continue;
      const start = answer.start + answer.line.indexOf(body);
      raw.push({ start, end: start + body.length, kind: "heading_answer" });
    }
  }
  // Quotation marks. Skip those already inside an answer span.
  for (const match of text.matchAll(/“[^“”\n]{30,1000}”|"[^"\n]{30,1000}"/g)) {
    const start = match.index;
    const end = start + match[0].length;
    if (raw.some((r) => r.kind !== "quoted" && start < r.end && end > r.start)) continue;
    raw.push({ start, end, kind: "quoted" });
  }
  // De-duplicate overlapping answer spans (Q&A beats heading); keep document order.
  raw.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: RawLead[] = [];
  for (const lead of raw) {
    const last = kept.at(-1);
    if (last && lead.start < last.end) continue;
    kept.push(lead);
  }
  return kept;
}

/**
 * Candidates for review, NOT approved attribution. Every lead is an exact slice of
 * `originalText` (PLAN §3.3). A lead is kept only when the page is a reviewed
 * single-candidate document, or the candidate's name is the nearest speaker evidence.
 * Without `ctx` the legacy behaviour (every quoted span, unattributed) applies.
 */
export function extractQuoteLeads(source: Source, cap: number, ctx?: QuoteNames): QuoteExtraction {
  const raw = rawLeads(source);
  const single = !!ctx && source.candidateId === ctx.candidateId;
  const all = ctx && !single ? mentions(source.originalText, ctx) : [];
  const leads: QuoteLead[] = [];
  let rejected = 0;
  for (const item of raw) {
    const answer = item.kind !== "quoted";
    const ok =
      !ctx ||
      single ||
      nameNearby(
        all,
        item,
        answer ? ANSWER_NAME_BEFORE : QUOTE_NAME_BEFORE,
        answer ? ANSWER_NAME_AFTER : QUOTE_NAME_AFTER,
      );
    if (!ok) {
      rejected++;
      continue;
    }
    if (leads.length >= cap) continue;
    leads.push({
      sourceId: source.id,
      quote: source.originalText.slice(item.start, item.end),
      quoteSpan: { start: item.start, end: item.end },
      requiresAttributionReview: true,
      kind: item.kind,
      ...(ctx ? { attribution: single ? "verified_single_candidate" : "name_proximity" } : {}),
    });
  }
  return { leads, rejected, scanned: raw.length };
}

/** Legacy entry point: quoted spans only, no attribution test. */
export function quoteLeads(source: Source, cap: number, ctx?: QuoteNames): QuoteLead[] {
  if (ctx) return extractQuoteLeads(source, cap, ctx).leads;
  return extractQuoteLeads(source, cap).leads.filter((lead) => lead.kind === "quoted");
}
