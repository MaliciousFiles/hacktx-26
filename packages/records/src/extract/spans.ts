import type { GroundedSpan } from "./types";
import { groundedSpanSchema } from "./types";

/** UTF-16 code-unit slice — matches PLAN quote validators / JS string indexing. */
export function sliceUtf16(text: string, start: number, end: number): string {
  return text.slice(start, end);
}

export function assertGroundedSpan(text: string, span: GroundedSpan, label: string): GroundedSpan {
  const parsed = groundedSpanSchema.parse(span);
  if (parsed.end > text.length) throw new Error(`${label} span exceeds source length`);
  const exact = sliceUtf16(text, parsed.start, parsed.end);
  if (exact !== parsed.value) {
    throw new Error(`${label} span value does not exactly equal source text[${parsed.start}:${parsed.end}]`);
  }
  return parsed;
}

export function normalizeVoteToken(raw: string): "yes" | "no" | "abstain" | "present" | "not_voting" | "recused" | "other" {
  const value = raw.trim().toLowerCase().replace(/\./g, "");
  // Plural forms are list headers ("Ayes: A, B" / "Nays: C").
  if (["yea", "yeas", "aye", "ayes", "yes", "y", "in favor", "for"].includes(value)) return "yes";
  if (["nay", "nays", "no", "noes", "n", "against"].includes(value)) return "no";
  if (["abstain", "abstained", "abstention"].includes(value)) return "abstain";
  if (["present"].includes(value)) return "present";
  if (["absent", "not voting", "nv"].includes(value)) return "not_voting";
  if (["recused", "recusal"].includes(value)) return "recused";
  return "other";
}
