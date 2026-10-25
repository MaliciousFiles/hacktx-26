import type { CandidateResearchRequest, OfficialAction } from "@ftb/types";
import type { SnapshotClient } from "./fetch";
import type { DateWindow, ResearchDocument } from "./model";

export interface AdapterContext {
  request: CandidateResearchRequest;
  window: DateWindow;
  client: SnapshotClient;
  /** Exhaust published inventories within the configured dates, not the entire web. */
  exhaustive?: boolean;
}

/** Remove editorial sampling of already enumerable records, not safety/integrity checks. */
export function collectionConfig<T extends object>(config: T, context: AdapterContext): T {
  if (!context.exhaustive) return config;
  const result = { ...config } as Record<string, unknown>;
  for (const field of ["maxDocuments", "maxActions", "maxDays", "maxPages", "maxVotesPerSession", "authoredPerSession", "signedPriorityMax"]) {
    if (typeof result[field] === "number") result[field] = Number.MAX_SAFE_INTEGER;
  }
  if (typeof result.maxVotes === "number") result.maxVotes = 0; // Austin: zero retains ALL votes.
  if (typeof result.lookbackYears === "number") result.lookbackYears = 9999;
  return result as T;
}

export interface AdapterResult {
  actions: OfficialAction[];
  documents?: ResearchDocument[];
  status: "complete" | "partial" | "unavailable" | "needs_review";
  reason: string; // completeness applies to this configured source, not the whole ballot
}

/** Each adapter validates its own config; unknown/unsupported sources never look
 * like successful empty collections. Source configuration is owned by pipeline. */
export interface RecordsAdapter {
  kind: string;
  collect(context: AdapterContext, config: unknown): Promise<AdapterResult>;
}
