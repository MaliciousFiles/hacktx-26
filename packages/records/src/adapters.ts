import type { CandidateResearchRequest, OfficialAction } from "@ftb/types";
import type { SnapshotClient } from "./fetch";
import type { DateWindow } from "./model";

export interface AdapterContext {
  request: CandidateResearchRequest;
  window: DateWindow;
  client: SnapshotClient;
}

export interface AdapterResult {
  actions: OfficialAction[];
  status: "complete" | "partial" | "unavailable" | "needs_review";
  reason: string; // completeness applies to this configured source, not the whole ballot
}

/** Each adapter validates its own config; unknown/unsupported sources never look
 * like successful empty collections. Source configuration is owned by pipeline. */
export interface RecordsAdapter {
  kind: string;
  collect(context: AdapterContext, config: unknown): Promise<AdapterResult>;
}
