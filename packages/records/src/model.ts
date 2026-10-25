import type {
  CandidateResearchRequest,
  ISODate,
  OfficialAction,
  RecordExtraction,
  RecordProvenance,
} from "@ftb/types";
import { z } from "zod";

export const requestSchema = z.object({
  candidate: z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    aliases: z.array(z.string().trim().min(1)).optional(),
    identifiers: z.record(z.string(), z.string().min(1)).optional(),
  }),
  position: z.object({
    office: z.string().trim().min(1),
    jurisdiction: z.string().trim().min(1),
    district: z.string().optional(),
  }),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(1789).max(9999),
});

export interface Snapshot {
  id: string;
  sourceUrl: string;
  fetchedAt: string;
  contentHash: string;
  format: RecordExtraction;
  contentType?: string;
  etag?: string;
  lastModified?: string;
  /** UTF-8 original for xml/json/html; for pdf, deterministic PDF.js text (hash is still original bytes). */
  text: string;
}

export interface RecordCoverage {
  source: string;
  status: "complete" | "partial" | "unavailable" | "needs_review" | "not_implemented";
  reason: string;
  actionCount: number;
  since: ISODate;
  before: ISODate; // exclusive, fixed by request (not wall-clock)
}

/** Private research context, NOT an attributed action or scoring evidence. */
export interface ResearchDocument {
  id: string;
  candidateId: string;
  title: string;
  sourceUrl: string;
  sourceFamily: string;
  relationship: "office_context" | "board_minutes" | "court_context";
  date: string | null;
  dateBasis: "meeting_inventory" | "unknown";
  textBasis: "native" | "ocr_unreviewed" | "unreadable";
  snapshotId: string;
  contentHash: string;
  /** OCR text lives separately from the immutable original PDF snapshot. */
  derivedTextHash?: string;
  /** Frozen derivative copied into private research archives for offline/DB review. */
  derivedText?: {
    engine: "apple-vision-v1";
    osVersion: string;
    totalPages: number;
    pages: { page: number; lines: { text: string; confidence: number }[] }[];
  };
  reviewRequired: true;
}

export interface RecordsResult {
  request: CandidateResearchRequest;
  actions: OfficialAction[];
  snapshots: Omit<Snapshot, "text">[];
  coverage: RecordCoverage[];
  documents?: ResearchDocument[];
  recovery?: { directory: string; counts: ReturnType<import("./work").WorkJournal["counts"]> };
}

export interface DateWindow {
  since: ISODate;
  before: ISODate;
}

export function dateWindow(request: CandidateResearchRequest, since = "1789-01-01"): DateWindow {
  requestSchema.parse(request);
  const before = `${request.year}-${String(request.month).padStart(2, "0")}-01`;
  if (!isISODate(since) || since >= before) {
    throw new Error("since must be a real YYYY-MM-DD date before the election month");
  }
  return { since, before };
}

export function isISODate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === date;
}

export function isoDate(value: string): ISODate {
  const result = value.slice(0, 10);
  if (!isISODate(result)) throw new Error(`Invalid source date: ${value}`);
  return result;
}

export function inWindow(date: ISODate, window: DateWindow): boolean {
  return date >= window.since && date < window.before;
}

// This normalization is ONLY for identity matching, never exact-quote validation.
export function normalizeName(name: string): string {
  return name.normalize("NFKC").toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

export function candidateNames(request: CandidateResearchRequest): Set<string> {
  return new Set([request.candidate.name, ...(request.candidate.aliases ?? [])].map(normalizeName));
}

export function provenance(snapshot: Snapshot, adapter: string, locator: string): RecordProvenance {
  return {
    snapshotId: snapshot.id,
    contentHash: snapshot.contentHash,
    sourceUrl: snapshot.sourceUrl,
    fetchedAt: snapshot.fetchedAt,
    adapter,
    locator,
  };
}

export function normalizeVote(raw: string): NonNullable<OfficialAction["vote"]>["value"] {
  switch (raw.trim().toLowerCase()) {
    case "yea": case "aye": case "yes": case "voted yes": return "yes";
    case "nay": case "no": case "voted no": return "no";
    case "present": case "answered present": case "present - p": return "present";
    case "not voting": case "not voting - nv": case "absent": case "off dais": return "not_voting";
    case "abstain": case "abstained": return "abstain";
    case "recused": return "recused";
    default: return "other";
  }
}

export function voteStance(value: NonNullable<OfficialAction["vote"]>["value"]): OfficialAction["stance"] {
  return value === "yes" || value === "no" || value === "abstain" ? value : "n/a";
}

export function isContested(margin: NonNullable<OfficialAction["margin"]>, threshold = 0.1): boolean {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 0.5) throw new Error("Invalid threshold");
  const { yes, no } = margin;
  if (![yes, no].every((n) => Number.isSafeInteger(n) && n >= 0)) throw new Error("Invalid vote counts");
  return yes > 0 && no > 0 && Math.min(yes, no) / (yes + no) >= threshold;
}
