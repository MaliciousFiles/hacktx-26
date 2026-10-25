import type { CandidateResearchRequest, OfficialAction, RecordProvenance } from "@ftb/types";
import { z } from "zod";
import type { RecordsAdapter } from "./adapters";
import { publicUrl, SnapshotClient } from "./fetch";
import { dateWindow, inWindow, isISODate, requestSchema } from "./model";
import type { RecordCoverage, RecordsResult, Snapshot } from "./model";
import { discoverRecordUrls, discoverySchema } from "./discovery";
import { BIOGUIDE_BOUND_ADAPTERS } from "./history/offices";

export const planSchema = z.object({
  since: z.string().optional(),
  identity: z.object({ provider: z.string().min(1), config: z.unknown().optional() }).optional(),
  sources: z.array(z.object({
    id: z.string().min(1), adapter: z.string().min(1), config: z.unknown(),
    discovery: discoverySchema.optional(),
  })),
}).strict();
export type RecordsPlan = z.infer<typeof planSchema>;

export interface IdentityResolution {
  status: "resolved" | "unresolved" | "ambiguous" | "conflict";
  request: CandidateResearchRequest;
  evidence: RecordProvenance[];
  reason: string;
}
export type IdentityResolver = (
  request: CandidateResearchRequest,
  client: SnapshotClient,
  config: unknown,
) => Promise<IdentityResolution>;

function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : "Unknown source error";
  return text.replace(/([?&](?:api_key|apikey|token|access_token|key)=)[^&\s]+/gi, "$1[redacted]");
}

function validateAction(action: OfficialAction, request: CandidateResearchRequest, snapshots: Omit<Snapshot, "text">[]): void {
  if (action.actorId !== request.candidate.id) throw new Error("Adapter returned an action belonging to a different candidate");
  if (!action.id || !isISODate(action.date) || !action.title || !action.officialText) throw new Error("Incomplete action identity, date or text");
  if (!action.extraction || !["xml", "json", "csv", "xlsx", "html", "pdf"].includes(action.extraction)) {
    throw new Error("Manual or unknown extraction methods are not approved for automatic collection");
  }
  if (publicUrl(action.sourceUrl) !== action.sourceUrl) throw new Error("Action URL is not credential-free/canonical");
  if (!action.provenance?.length) throw new Error("Action has no immutable-source provenance");
  for (const proof of action.provenance) {
    const source = snapshots.find((snapshot) => snapshot.id === proof.snapshotId);
    if (!source || proof.contentHash !== source.contentHash || proof.sourceUrl !== source.sourceUrl ||
      proof.fetchedAt !== source.fetchedAt || !proof.adapter || !proof.locator) {
      throw new Error("Action provenance does not resolve to this collection's raw snapshots");
    }
    if ((action.extraction === "html" || action.extraction === "pdf") && source.format !== action.extraction) {
      throw new Error(`${action.extraction.toUpperCase()} actions require matching ${action.extraction} snapshot provenance`);
    }
  }
  if (action.margin && !Object.values(action.margin).every((n) => Number.isSafeInteger(n) && n >= 0)) {
    throw new Error("Invalid vote counts");
  }
  if (action.attribution?.method === "office_tenure") {
    const tenure = action.attribution.tenure;
    if (!tenure || !isISODate(tenure.start) || !tenure.sourceUrl ||
      action.date < tenure.start || (tenure.end && (!isISODate(tenure.end) || action.date > tenure.end))) {
      throw new Error("Office-holder attribution lacks an applicable verified tenure");
    }
  }
}

/** The pipeline calls this once per candidate, independently of ballot parsing.
 * A plan declares source coverage explicitly; empty/error results aren't proof
 * that the candidate has no record. No network calls happen until collect(). */
export class RecordsCollector {
  private readonly adapters: Map<string, RecordsAdapter>;
  constructor(private readonly options: {
    client: SnapshotClient;
    adapters: RecordsAdapter[];
    resolvers?: Record<string, IdentityResolver>;
    plan?: RecordsPlan;
  }) {
    this.adapters = new Map(options.adapters.map((adapter) => [adapter.kind, adapter]));
    if (this.adapters.size !== options.adapters.length) throw new Error("Duplicate adapter kinds");
  }

  async collect(
    input: CandidateResearchRequest,
    inputPlan?: RecordsPlan,
    options: { onSource?: (sourceId: string, phase: "discover" | "collect" | "done" | "error") => void } = {},
  ): Promise<RecordsResult> {
    let request = requestSchema.parse(input);
    const plan = planSchema.parse(inputPlan ?? this.options.plan ?? { sources: [] });
    const ids = plan.sources.map((source) => source.id);
    if (new Set(ids).size !== ids.length) throw new Error("Duplicate source IDs in collection plan");
    const window = dateWindow(request, plan.since);
    const client = this.options.client.fork();
    const coverage: RecordCoverage[] = [];
    const actions = new Map<string, OfficialAction>();
    const conflicts = new Set<string>();
    const notify = options.onSource ?? (() => undefined);
    const report = (source: string, status: RecordCoverage["status"], reason: string, actionCount = 0): void => {
      coverage.push({ source, status, reason, actionCount, ...window });
    };
    const finish = (): RecordsResult => ({
      request,
      actions: [...actions.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
      snapshots: client.snapshots(), coverage,
    });

    // Soft vs hard identity gate (Ken Paxton class of bug):
    // - conflict/ambiguous → hard-block everything (unsafe attribution)
    // - unresolved/unavailable → skip only bioguide-bound adapters; continue
    //   name/tenure sources (Socrata, OAG, TLO, minutes, …)
    let skipBioguideSources = false;
    if (plan.identity) {
      const resolver = this.options.resolvers?.[plan.identity.provider];
      if (!resolver) {
        report("identity", "not_implemented", `Unknown identity resolver: ${plan.identity.provider}`);
        skipBioguideSources = true;
      } else {
        try {
          notify("identity", "collect");
          const identity = await resolver(request, client, plan.identity.config);
          if (identity.status === "conflict" || identity.status === "ambiguous") {
            report("identity", "needs_review", identity.reason);
            for (const source of plan.sources) {
              report(source.id, "needs_review", "Collection blocked by conflicting/ambiguous identity");
            }
            notify("identity", "error");
            return finish();
          }
          if (identity.status !== "resolved") {
            report("identity", "needs_review", identity.reason);
            skipBioguideSources = true;
            notify("identity", "error");
          } else {
            if (identity.request.candidate.id !== request.candidate.id) {
              throw new Error("Identity resolver changed the pipeline candidate ID");
            }
            request = requestSchema.parse(identity.request);
            report("identity", "complete", identity.reason);
            notify("identity", "done");
          }
        } catch (error) {
          report("identity", "unavailable", errorMessage(error));
          skipBioguideSources = true;
          notify("identity", "error");
        }
      }
    }

    if (plan.sources.length === 0) {
      report(request.position.office, "not_implemented", "No sources configured for this candidate/office; not evidence of no prior record");
    }
    for (const source of plan.sources) {
      if (skipBioguideSources && BIOGUIDE_BOUND_ADAPTERS.has(source.adapter)) {
        report(
          source.id,
          "needs_review",
          "Skipped: congressional bioguide identity was not resolved; this adapter requires a verified bioguide. Name/tenure sources in the same plan were not blocked.",
        );
        continue;
      }
      const adapter = this.adapters.get(source.adapter);
      if (!adapter) {
        report(source.id, "not_implemented", `Adapter not implemented: ${source.adapter}`);
        continue;
      }
      try {
        if (source.discovery) notify(source.id, "discover");
        const discovered = source.discovery ? await discoverRecordUrls(client, source.discovery, window) : undefined;
        if (discovered && discovered.urls.length === 0) {
          report(source.id, discovered.status, discovered.reason);
          notify(source.id, "done");
          continue;
        }
        notify(source.id, "collect");
        const config = discovered ? { ...z.record(z.string(), z.unknown()).parse(source.config), urls: discovered.urls } : source.config;
        const result = await adapter.collect({ request, window, client }, config);
        for (const action of result.actions) validateAction(action, request, client.snapshots());
        // Defense in depth: enforce election cutoff even if an adapter misses it.
        const eligible = result.actions.filter((action) => inWindow(action.date, window));
        for (const action of eligible) {
          if (conflicts.has(action.id)) continue;
          const existing = actions.get(action.id);
          if (existing) {
            const core = ({ provenance: _proof, sourceUrl: _url, ...rest }: OfficialAction) => JSON.stringify(rest);
            if (core(existing) !== core(action)) {
              actions.delete(action.id); conflicts.add(action.id); continue;
            }
            existing.provenance = [...new Map([...(existing.provenance ?? []), ...(action.provenance ?? [])]
              .map((proof) => [JSON.stringify(proof), proof])).values()];
          } else actions.set(action.id, action);
        }
        report(source.id, discovered?.status === "partial" && result.status === "complete" ? "partial" : result.status,
          [discovered?.reason, result.reason].filter(Boolean).join(" "), eligible.length);
        notify(source.id, "done");
      } catch (error) {
        report(source.id, "unavailable", errorMessage(error));
        notify(source.id, "error");
      }
    }
    if (conflicts.size) {
      report("deduplication", "partial", `${conflicts.size} conflicting action IDs withheld; inspect raw snapshots before publishing`);
    }
    return finish();
  }
}
