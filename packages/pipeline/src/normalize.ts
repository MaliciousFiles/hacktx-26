// normalize.ts — Stage 2: produce ClassificationInput from raw Source (PLAN.md §6 Invariant 6).
// Applies a versioned text projection that strips candidate names (and optionally party labels)
// before any model sees the text. mode is set per Release config; "unmasked_eval_only" may
// never appear in a publishable release.
import type { Source, ClassificationInput } from "@ftb/types";

export type NormalizeMode = "names_only" | "names_and_party";

export interface NormalizeOptions {
  mode: NormalizeMode;
  projectionVersion: string;
  /** Candidate name strings to redact (display names, aliases). */
  candidateNames: string[];
  /** Party label strings to redact — only used when mode === "names_and_party". */
  partyLabels?: string[];
}

const REDACTION_TOKEN = "[REDACTED]";

/** Common party labels, including plurals and abbreviations. Not exhaustive. */
export const PARTY_LABELS = [
  "Democrat",
  "Democrats",
  "Democratic",
  "Republican",
  "Republicans",
  "GOP",
  "Libertarian",
  "Libertarians",
  "Green Party",
  "Dems",
];

/** Party shorthand used in rosters and news: "(D)", "R-Texas", "[R-TX-19]", "D-Austin". */
export function redactPartyMarkers(text: string): string {
  return text
    .replace(/\((?:D|R|I|L|G)\)/g, REDACTION_TOKEN)
    .replace(
      /(?<![\p{L}\p{N}])(?:D|R|I|L|G)-(?:[A-Z]{2}(?:-\d{1,2})?|[A-Z][a-z]+)(?![\p{L}\p{N}])/gu,
      REDACTION_TOKEN,
    );
}

/**
 * Deterministic, case-insensitive whole-word redaction. Longest terms first, so a
 * full name is masked before a contained surname; whitespace inside a term
 * matches any whitespace run. Also masks the surname-only form of multi-word
 * names ("Casar" from "Greg Casar"), a common leak in news and debate text.
 */
export function redactTerms(text: string, terms: string[]): string {
  const expanded = new Set<string>();
  for (const term of terms) {
    const clean = term.trim();
    if (clean.length < 2) continue;
    expanded.add(clean);
    const parts = clean.split(/\s+/);
    const last = parts[parts.length - 1]!.replace(/[.,]/g, "");
    if (parts.length > 1 && last.length >= 3 && !/^(jr|sr|ii|iii|iv)$/i.test(last))
      expanded.add(last);
  }
  const ordered = [...expanded].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  for (const term of ordered) {
    const pattern = term
      .split(/\s+/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    text = text.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "giu"),
      REDACTION_TOKEN,
    );
  }
  return text;
}

/**
 * Build a versioned text projection for classification.
 * - Strips candidate names (all modes).
 * - Strips party labels only when mode === "names_and_party".
 * - "unmasked_eval_only" is NOT accepted here; that mode is evaluation-only and must never
 *   be used in a pipeline run that produces publishable output (enforced in validatePublication).
 */
export function normalizeSource(source: Source, opts: NormalizeOptions): ClassificationInput {
  let text = source.text; // normalized field, not originalText

  const labels = [
    ...opts.candidateNames,
    ...(opts.mode === "names_and_party" ? (opts.partyLabels ?? []) : []),
  ];
  text = redactTerms(text, labels);
  if (opts.mode === "names_and_party") text = redactPartyMarkers(text);

  return {
    sourceId: source.id,
    text,
    mode: opts.mode,
    projectionVersion: opts.projectionVersion,
  };
}

/** Normalize a batch of sources for a single contest. */
export function normalizeSources(sources: Source[], opts: NormalizeOptions): ClassificationInput[] {
  return sources.map((s) => normalizeSource(s, opts));
}
