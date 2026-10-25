import type { CandidateResearchRequest, OfficialAction, RecordProvenance } from "@ftb/types";
import { z } from "zod";
import type { RecordsAdapter } from "./adapters";
import { publicUrl, sha256, SnapshotClient } from "./fetch";
import { dateWindow, inWindow, isISODate, requestSchema } from "./model";
import type { RecordCoverage, RecordsResult, Snapshot, ResearchDocument } from "./model";
import { discoverRecordUrls, discoverySchema } from "./discovery";
import { BIOGUIDE_BOUND_ADAPTERS } from "./history/offices";
import { workKey } from "./work";
import { recordsImplementationHash } from "./implementation";
import type { AdapterResult } from "./adapters";
import { ROLE_FAMILIES } from "./capabilities";

export const planSchema = z.object({
  exhaustive: z.boolean().optional(),
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
  /** Verified congressional service years; sources entirely outside them are skipped as inapplicable. */
  terms?: { chamber: "house" | "senate"; startYear: number; endYear?: number }[];
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

function validateAction(action: OfficialAction, request: CandidateResearchRequest, snapshots: ReadonlyMap<string, Omit<Snapshot, "text">>): void {
  if (action.actorId !== request.candidate.id) throw new Error("Adapter returned an action belonging to a different candidate");
  if (!action.id || !isISODate(action.date) || !action.title || !action.officialText) throw new Error("Incomplete action identity, date or text");
  if (!action.extraction || !["xml", "json", "csv", "xlsx", "html", "pdf"].includes(action.extraction)) {
    throw new Error("Manual or unknown extraction methods are not approved for automatic collection");
  }
  if (publicUrl(action.sourceUrl) !== action.sourceUrl) throw new Error("Action URL is not credential-free/canonical");
  if (!action.provenance?.length) throw new Error("Action has no immutable-source provenance");
  for (const proof of action.provenance) {
    const source = snapshots.get(proof.snapshotId);
    if (!source || proof.contentHash !== source.contentHash || proof.sourceUrl !== source.sourceUrl ||
      proof.fetchedAt !== source.fetchedAt || !proof.adapter || !proof.locator) {
      throw new Error("Action provenance does not resolve to this collection's raw snapshots");
    }
  }
  // An action may carry supporting proofs in other formats (e.g. an HTML catalog row plus its scanned PDF), but a
  // declared html/pdf extraction must be backed by at least one snapshot of that format.
  if ((action.extraction === "html" || action.extraction === "pdf") &&
    !action.provenance.some((proof) => snapshots.get(proof.snapshotId)?.format === action.extraction)) {
    throw new Error(`${action.extraction.toUpperCase()} actions require matching ${action.extraction} snapshot provenance`);
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

/** Calendar years a bioguide-bound yearly source covers (undefined: not a yearly chamber source). */
function sourceYears(source: RecordsPlan["sources"][number]): number[] | undefined {
  const discovery = source.discovery;
  if (source.adapter === "house-clerk" && discovery && "year" in discovery) return [discovery.year];
  if (source.adapter === "govinfo-crec" && discovery && "years" in discovery) return discovery.years;
  return undefined;
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
    let journal = (() => { try { return client.workJournal; } catch { return undefined; } })();
    const implementation = journal ? await recordsImplementationHash().catch(() => "untracked") : "untracked";
    /** Journal problems are bookkeeping problems: drop to an unjournaled run, never zero the records. */
    let journalBroken = false;
    const jnote = (spec: Parameters<NonNullable<typeof journal>["note"]>[0], state: Parameters<NonNullable<typeof journal>["note"]>[1], reason: string): void => {
      if (!journal || journalBroken) return;
      try { journal.note(spec, state, reason); } catch { journalBroken = true; journal = undefined; }
    };
    const workScope = `${request.candidate.id}:${window.since}:${window.before}`;
    const coverageIdentity = structuredClone(request);
    client.setWorkScope(`${workScope}:identity`);
    const coverageSpec = (source: RecordsPlan["sources"][number]) => ({
      key: workKey(["source-inventory-v1", implementation, coverageIdentity, window, source, plan.exhaustive ?? false]),
      kind: "coverage" as const, scope: workScope, payload: { candidateId: request.candidate.id, source, window, implementation },
    });
    try { journal?.registerAll(plan.sources.map(coverageSpec)); } catch { journalBroken = true; journal = undefined; }
    for (const [role, [description, gap]] of Object.entries(ROLE_FAMILIES)) {
      jnote({ key: workKey(["role-coverage-v1", implementation, coverageIdentity, window, role]), kind: "coverage", scope: workScope,
        payload: { role, description, window } }, "blocked", gap);
    }
    const coverage: RecordCoverage[] = [];
    const actions = new Map<string, OfficialAction>();
    const documents = new Map<string, ResearchDocument>();
    const conflicts = new Set<string>();
    const notify = options.onSource ?? (() => undefined);
    const report = (source: string, status: RecordCoverage["status"], reason: string, actionCount = 0): void => {
      coverage.push({ source, status, reason, actionCount, ...window });
      const planned = plan.sources.find((s) => s.id === source);
      if (planned) jnote(coverageSpec(planned), "blocked", `${status}: ${reason}; whole-history exhaustion has not been certified`);
    };
    const finish = (): RecordsResult => ({
      request,
      actions: [...actions.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
      snapshots: client.snapshots(), coverage,
      ...(documents.size ? { documents: [...documents.values()].sort((a, b) => a.id.localeCompare(b.id)) } : {}),
      ...(journal ? { recovery: { directory: `${client.cacheDirectory}/work`, counts: journal.counts(workScope) } } : {}),
    });

    // Soft vs hard identity gate (Ken Paxton class of bug):
    // - conflict/ambiguous → hard-block everything (unsafe attribution)
    // - unresolved/unavailable → skip only bioguide-bound adapters; continue
    //   name/tenure sources (Socrata, OAG, TLO, minutes, …)
    let skipBioguideSources = false;
    let memberTerms: IdentityResolution["terms"];
    const outsideService = new Map<string, string[]>();
    let bioguideReason = "";
    const skippedBioguide = new Map<string, string[]>();
    if (plan.identity) {
      const resolver = this.options.resolvers?.[plan.identity.provider];
      if (!resolver) {
        report("identity", "not_implemented", `Unknown identity resolver: ${plan.identity.provider}`);
        skipBioguideSources = true;
        bioguideReason = "congressional bioguide identity could not be checked (unknown resolver); not evidence about the candidate's record.";
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
            bioguideReason = "bioguide unresolved: not a member of Congress in the official rosters checked (a missing match is not proof the person never served).";
            notify("identity", "error");
          } else {
            if (identity.request.candidate.id !== request.candidate.id) {
              throw new Error("Identity resolver changed the pipeline candidate ID");
            }
            request = requestSchema.parse(identity.request);
            memberTerms = identity.terms;
            report("identity", "complete", identity.reason);
            notify("identity", "done");
          }
        } catch (error) {
          report("identity", "unavailable", errorMessage(error));
          skipBioguideSources = true;
          bioguideReason = "bioguide identity lookup failed, so congressional membership is unknown (retry later; this is not evidence about the candidate's record).";
          notify("identity", "error");
        }
      }
    }

    if (plan.sources.length === 0) {
      report(request.position.office, "not_implemented", "No sources configured for this candidate/office; not evidence of no prior record");
    }
    for (const source of plan.sources) {
      client.setWorkScope(`${workScope}:${source.id}`);
      if (skipBioguideSources && BIOGUIDE_BOUND_ADAPTERS.has(source.adapter)) {
        // One honest row per bioguide-bound adapter family, not one per year/congress.
        const skippedIds = skippedBioguide.get(source.adapter) ?? [];
        skippedIds.push(source.id);
        skippedBioguide.set(source.adapter, skippedIds);
        const note = `Skipped: ${bioguideReason}`;
        jnote(coverageSpec(source), "blocked", `needs_review: ${note}; whole-history exhaustion has not been certified`);
        if (skippedIds.length === 1) coverage.push({ source: source.adapter, status: "needs_review", reason: note, actionCount: 0, ...window });
        const row = coverage.find((entry) => entry.source === source.adapter && entry.status === "needs_review")!;
        row.reason = `${note} ${skippedIds.length} planned source(s) skipped (${skippedIds[0]}${skippedIds.length > 1 ? ` … ${skippedIds.at(-1)}` : ""}). Name/tenure sources in the same plan were not blocked.`;
        continue;
      }
      const years = memberTerms ? sourceYears(source) : undefined;
      if (memberTerms && years && !years.some((year) => memberTerms!.some((term) => term.chamber === (source.adapter === "house-clerk" ? "house" : "senate") && year >= term.startYear && year <= (term.endYear ?? Infinity)))) {
        const ids = outsideService.get(source.adapter) ?? [];
        ids.push(source.id);
        outsideService.set(source.adapter, ids);
        jnote(coverageSpec(source), "blocked", "complete: outside the member's verified Congress.gov service years; whole-history exhaustion has not been certified");
        const label = `${source.adapter}:outside-service`;
        if (ids.length === 1) coverage.push({ source: label, status: "complete", reason: "", actionCount: 0, ...window });
        const chamber = source.adapter === "house-clerk" ? "House" : "Senate";
        const served = memberTerms.filter((term) => term.chamber === (chamber === "House" ? "house" : "senate"))
          .map((term) => `${term.startYear}-${term.endYear ?? "present"}`).join(", ") || "none";
        coverage.find((row) => row.source === label)!.reason = `Congress.gov service terms (${chamber}): ${served}. ${ids.length} yearly source(s) (${ids[0]}${ids.length > 1 ? ` … ${ids.at(-1)}` : ""}) fall outside that service, so no votes can exist there; they were not fetched.`;
        continue;
      }
      const adapter = this.adapters.get(source.adapter);
      if (!adapter) {
        report(source.id, "not_implemented", `Adapter not implemented: ${source.adapter}`);
        continue;
      }
      try {
        if (source.discovery) notify(source.id, "discover");
        const discovered = source.discovery ? await discoverRecordUrls(client, source.discovery, window, { exhaustive: plan.exhaustive }) : undefined;
        if (discovered && discovered.urls.length === 0) {
          report(source.id, discovered.status, discovered.reason);
          notify(source.id, "done");
          continue;
        }
        notify(source.id, "collect");
        const config = discovered ? { ...z.record(z.string(), z.unknown()).parse(source.config), urls: discovered.urls } : source.config;
        const task = { key: workKey(["source-v1", implementation, request, window, source, plan.exhaustive ?? false]), kind: "source" as const,
          scope: workScope, payload: { source, request, window, implementation } };
        const previous = journal?.get(task.key);
        type Checkpoint = { result: AdapterResult; snapshots: Omit<Snapshot, "text">[] };
        const sourceMark = client.mark();
        const execute = async (): Promise<AdapterResult> => {
          if (!journal || !discovered) return adapter.collect({ request, window, client, exhaustive: plan.exhaustive }, config);
          // Persist the entire discovered backlog BEFORE processing the first document.
          const children = discovered.urls.map((url) => ({ key: workKey(["source-document-v1", implementation, request, window, source, url, plan.exhaustive ?? false]),
            kind: "source" as const, scope: `${workScope}:${source.id}:documents`, payload: { url, adapter: source.adapter, candidateId: request.candidate.id, window } }));
          journal.registerAll(children);
          const combined: AdapterResult = { actions: [], documents: [], status: "complete", reason: "" };
          const problems: string[] = [];
          for (const [index, child] of children.entries()) {
            const old = journal.get(child.key);
            const checkpoint = old?.result as Checkpoint | undefined;
            let saved: Checkpoint;
            const childMark = client.mark();
            try {
              if (old?.state === "succeeded" && checkpoint?.result.status === "complete") {
                for (const snapshot of checkpoint.snapshots) await client.restore(snapshot.id);
                saved = checkpoint;
              } else saved = await journal.run(child, async () => ({
                result: await adapter.collect({ request, window, client, exhaustive: plan.exhaustive }, { ...z.record(z.string(), z.unknown()).parse(config), urls: [discovered.urls[index]] }),
                snapshots: client.snapshotsSince(childMark),
              }));
              combined.actions.push(...saved.result.actions);
              combined.documents!.push(...(saved.result.documents ?? []));
              if (saved.result.status !== "complete") problems.push(`${discovered.urls[index]}: ${saved.result.reason}`);
            } catch (error) { problems.push(`${discovered.urls[index]}: ${errorMessage(error)}`); }
            notify(source.id, "collect");
          }
          combined.status = problems.length ? "partial" : "complete";
          combined.reason = `${children.length} discovered document tasks inspected; ${problems.length} incomplete. ${problems.slice(0, 10).join(" ")}${problems.length > 10 ? " Additional failures remain in the durable work journal." : ""}`;
          return combined;
        };
        const checkpoint = previous?.result as Checkpoint | undefined;
        let result: AdapterResult;
        if (previous?.state === "succeeded" && checkpoint?.result.status === "complete") {
          for (const snapshot of checkpoint.snapshots) await client.restore(snapshot.id);
          result = checkpoint.result;
        } else if (journal) {
          try {
            const saved = await journal.run(task, async () => ({ result: await execute(), snapshots: client.snapshotsSince(sourceMark) }));
            result = saved.result;
          } catch {
            // A journal failure must not turn a collectable source into zero records.
            journalBroken = true;
            journal = undefined;
            result = await execute();
          }
        } else result = await execute();
        const known = new Map(client.snapshots().map((s) => [s.id, s]));
        for (const action of result.actions) validateAction(action, request, known);
        for (const document of result.documents ?? []) {
          const snapshot = known.get(document.snapshotId);
          if (document.candidateId !== request.candidate.id || !snapshot ||
            snapshot.contentHash !== document.contentHash || snapshot.sourceUrl !== document.sourceUrl ||
            document.reviewRequired !== true || (document.date !== null && !isISODate(document.date)) ||
            (document.textBasis === "ocr_unreviewed" && (!document.derivedText || document.derivedTextHash !== sha256(JSON.stringify(document.derivedText)))))
            throw new Error("Research document identity/provenance validation failed");
        }
        for (const document of result.documents ?? []) {
          if (document.date === null || inWindow(document.date, window)) documents.set(document.id, document);
        }
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
