import type { CandidateResearchRequest, OfficialAction } from "@ftb/types";
import type { RecordsPlan } from "../collector";
import { createRecordsCollector } from "../factory";
import type { CacheMode, SnapshotClient } from "../fetch";
import type { RecordsResult } from "../model";
import { requestSchema } from "../model";
import { buildHistoryPlan } from "./plan";
import type { HistoryPlanResult } from "./plan";
import { suggestBioguide } from "./resolve";

export interface HistoryResearchInput {
  name: string;
  /** Office the candidate is running for (ballot race), not a prior-office filter. */
  office: string;
  jurisdiction?: string;
  district?: string;
  month: number;
  year: number;
  candidateId?: string;
  aliases?: string[];
  bioguide?: string;
  /** Verified upstream IDs, including prior local-office identity bindings. */
  identifiers?: Record<string, string>;
  since?: string;
  /** Soft cap on House roll XMLs per year (polite default). */
  houseRollCap?: number;
  documentCap?: number;
  includeTloFtp?: boolean;
  exhaustive?: boolean;
  cacheDirectory?: string;
  cacheMode?: CacheMode;
  client?: SnapshotClient;
  congressApiKey?: string;
  onProgress?: (message: string) => void;
}

export interface HistoryResearchResult {
  request: CandidateResearchRequest;
  /** OfficialAction[] — exact feed for @ftb/pipeline. */
  actions: OfficialAction[];
  plan: RecordsPlan;
  rationale: string[];
  gaps: string[];
  coverage: RecordsResult["coverage"];
  snapshots: RecordsResult["snapshots"];
  documents?: RecordsResult["documents"];
  recovery?: RecordsResult["recovery"];
  identityNotes: string[];
}

function slugId(name: string): string {
  return `cand-${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "unknown"
  }`;
}

/** Phase-1 entry: name + race sought → planned official history → OfficialAction[]. */
export async function researchCandidateHistory(
  input: HistoryResearchInput,
): Promise<HistoryResearchResult> {
  const identityNotes: string[] = [];
  if (
    input.bioguide &&
    input.identifiers?.bioguide &&
    input.bioguide !== input.identifiers.bioguide
  ) {
    throw new Error("Conflicting bioguide identity assertions");
  }
  let request = requestSchema.parse({
    candidate: {
      id: input.candidateId?.trim() || slugId(input.name),
      name: input.name.trim(),
      ...(input.aliases?.length ? { aliases: input.aliases } : {}),
      ...(input.identifiers || input.bioguide
        ? {
            identifiers: {
              ...input.identifiers,
              ...(input.bioguide ? { bioguide: input.bioguide } : {}),
            },
          }
        : {}),
    },
    position: {
      office: input.office.trim(),
      jurisdiction: (input.jurisdiction ?? "us/tx").trim(),
      ...(input.district?.trim() ? { district: input.district.trim() } : {}),
    },
    month: input.month,
    year: input.year,
  });

  const progress = input.onProgress ?? (() => undefined);
  // History discovery plans always probe federal sources; attempt bioguide for every
  // name (race sought is not a filter). Unresolved bioguide soft-skips only
  // bioguide-bound adapters in the collector.
  progress("Resolving identity…");
  const suggestion = await suggestBioguide(request, {
    apiKey: input.congressApiKey ?? process.env.CONGRESS_GOV_API_KEY,
    state: /tx/i.test(request.position.jurisdiction) ? "TX" : undefined,
    cacheDirectory: input.cacheDirectory,
    cacheMode: input.cacheMode,
    client: input.client,
  });
  identityNotes.push(suggestion.reason);
  if (suggestion.bioguide && suggestion.bioguide !== request.candidate.identifiers?.bioguide) {
    request = requestSchema.parse({
      ...request,
      candidate: {
        ...request.candidate,
        identifiers: { ...request.candidate.identifiers, bioguide: suggestion.bioguide },
      },
    });
  }

  const planned: HistoryPlanResult = buildHistoryPlan(request, {
    since: input.since,
    houseRollCap: input.houseRollCap,
    documentCap: input.documentCap,
    includeTloFtp: input.includeTloFtp,
    exhaustive: input.exhaustive,
  });
  progress(
    `Plan ready: ${planned.plan.sources.length} source(s), ${planned.gaps.length} gap(s). Collecting…`,
  );

  const collector = createRecordsCollector({
    client: input.client,
    cacheDirectory: input.cacheDirectory,
    cacheMode: input.cacheMode,
    congressApiKey: input.congressApiKey ?? process.env.CONGRESS_GOV_API_KEY,
  });
  const result = await collector.collect(request, planned.plan, {
    onSource: (sourceId, phase) => progress(`${phase}: ${sourceId}`),
  });
  progress(`Done — ${result.actions.length} OfficialAction(s).${result.recovery ? ` Work: ${JSON.stringify(result.recovery.counts)}` : ""}`);

  return {
    request: result.request,
    actions: result.actions,
    plan: planned.plan,
    rationale: planned.rationale,
    gaps: planned.gaps,
    coverage: result.coverage,
    snapshots: result.snapshots,
    documents: result.documents ?? [],
    recovery: result.recovery,
    identityNotes,
  };
}
