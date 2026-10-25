// snapshot.ts — Stage 1: ingest and hash raw sources + actions (PLAN.md §4, §7).
// Assigns contentHash, stamps fetchedAt, deduplicates by (url, contentHash),
// and writes a stage manifest recording input hashes + config versions.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Source, OfficialAction } from "@ftb/types";

export interface SnapshotManifest {
  stage: "snapshot";
  createdAt: string;
  gitSha: string;
  configVersions: Record<string, string>;
  sourcesIn: number;
  sourcesOut: number;
  actionsIn: number;
  actionsOut: number;
  inputHashes: string[];
}

export interface SnapshotResult {
  sources: Source[];
  actions: OfficialAction[];
  manifest: SnapshotManifest;
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

/**
 * Ingest raw sources and actions:
 * - Set contentHash = sha256(originalText) on each source.
 * - Reject sources without a fetchedAt (never stamp the wall clock).
 * - Deduplicate identical text per contest + candidate across URLs (wire reposts count once).
 * - Deduplicate actions by id.
 * - Write a stage manifest to dist/manifests/snapshot-<timestamp>.json.
 */
export function snapshotSources(
  rawSources: Source[],
  rawActions: OfficialAction[],
  configVersions: Record<string, string>,
  gitSha: string,
  outDir: string,
): SnapshotResult {
  // Hash sources. fetchedAt must come from the fetch itself: stamping today's
  // date would make rebuilds differ and could be mistaken for when it was said.
  const stamped: Source[] = rawSources.map((s) => {
    if (!s.fetchedAt) throw new Error(`Source ${s.id} has no fetchedAt`);
    return { ...s, contentHash: sha256(s.originalText) };
  });

  // Deduplicate: keep the first copy of identical text for each contest + attribution
  // (the same text under different URLs is a repost, not independent evidence)
  const seen = new Set<string>();
  const deduped: Source[] = [];
  for (const s of stamped) {
    const key = `${s.contestId}::${s.candidateId ?? "unattributed"}::${s.contentHash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(s);
  }

  // Deduplicate actions by id: the same vote can arrive from overlapping record sources.
  const seenActions = new Set<string>();
  const actions: OfficialAction[] = [];
  for (const a of rawActions) {
    if (seenActions.has(a.id)) continue;
    seenActions.add(a.id);
    actions.push(a);
  }

  const manifest: SnapshotManifest = {
    stage: "snapshot",
    createdAt: new Date().toISOString(),
    gitSha,
    configVersions,
    sourcesIn: rawSources.length,
    sourcesOut: deduped.length,
    actionsIn: rawActions.length,
    actionsOut: actions.length,
    inputHashes: deduped.map((s) => s.contentHash),
  };

  const manifestsDir = join(outDir, "manifests");
  mkdirSync(manifestsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(
    join(manifestsDir, `snapshot-${ts}.json`),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );

  return { sources: deduped, actions, manifest };
}
