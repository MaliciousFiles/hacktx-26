// normalize.ts — Stage 2: produce ClassificationInput from raw Source (PLAN.md §6 Invariant 6).
// Applies a versioned text projection that strips candidate names (and optionally party labels)
// before any model sees the text. mode is set per Release config; "unmasked_eval_only" may
// never appear in a publishable release.
import { createHash } from "node:crypto";
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

/**
 * Build a versioned text projection for classification.
 * - Strips candidate names (all modes).
 * - Strips party labels only when mode === "names_and_party".
 * - "unmasked_eval_only" is NOT accepted here; that mode is evaluation-only and must never
 *   be used in a pipeline run that produces publishable output (enforced in validatePublication).
 */
export function normalizeSource(source: Source, opts: NormalizeOptions): ClassificationInput {
  let text = source.text; // normalized field, not originalText

  // Always redact candidate names
  for (const name of opts.candidateNames) {
    if (!name.trim()) continue;
    text = text.replaceAll(name, REDACTION_TOKEN);
  }

  // Redact party labels only when requested
  if (opts.mode === "names_and_party" && opts.partyLabels) {
    for (const party of opts.partyLabels) {
      if (!party.trim()) continue;
      text = text.replaceAll(party, REDACTION_TOKEN);
    }
  }

  const inputHash = createHash("sha256").update(text, "utf-8").digest("hex");

  return {
    sourceId: source.id,
    text,
    mode: opts.mode,
    projectionVersion: opts.projectionVersion,
  };
}

/** Normalize a batch of sources for a single contest. */
export function normalizeSources(
  sources: Source[],
  opts: NormalizeOptions,
): ClassificationInput[] {
  return sources.map((s) => normalizeSource(s, opts));
}
