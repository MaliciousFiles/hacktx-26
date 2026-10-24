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

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Ingest raw sources and actions:
 * - Set contentHash = sha256(originalText) on each source.
 * - Set fetchedAt to today's date if missing.
 * - Deduplicate sources by (url, contentHash) — identical wire reposts count once.
 * - Write a stage manifest to dist/manifests/snapshot-<timestamp>.json.
 */
export function snapshotSources(
  rawSources: Source[],
  rawActions: OfficialAction[],
  configVersions: Record<string, string>,
  gitSha: string,
  outDir: string,
): SnapshotResult {
  const today_ = today();

  // Stamp + hash sources
  const stamped: Source[] = rawSources.map((s) => ({
    ...s,
    fetchedAt: s.fetchedAt ?? today_,
    contentHash: sha256(s.originalText),
  }));

  // Deduplicate: keep the first occurrence of each (url, contentHash) pair
  const seen = new Set<string>();
  const deduped: Source[] = [];
  for (const s of stamped) {
    const key = `${s.url}::${s.contentHash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(s);
  }

  const manifest: SnapshotManifest = {
    stage: "snapshot",
    createdAt: new Date().toISOString(),
    gitSha,
    configVersions,
    sourcesIn: rawSources.length,
    sourcesOut: deduped.length,
    actionsIn: rawActions.length,
    actionsOut: rawActions.length, // actions are not deduplicated here
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

  return { sources: deduped, actions: rawActions, manifest };
}
