// cached_call.ts — content-addressed model call cache (PLAN.md §7 "Harness").
// Key = sha256(canonical_json(CachedCallSpec)). A hit ALWAYS reuses stored output.
// Stores the full response (never just argmax). No cache invalidation without a version bump.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CachedCallSpec } from "@ftb/types";

const CACHE_DIR = join(process.cwd(), ".cache", "model-calls");

/** Canonical JSON: keys sorted recursively so sha256 is stable regardless of insertion order. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const sorted = Object.keys(value as object)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
  return `{${sorted.join(",")}}`;
}

export function cacheKey(spec: CachedCallSpec): string {
  return createHash("sha256").update(canonicalJson(spec)).digest("hex");
}

interface CacheEntry<T> {
  spec: CachedCallSpec;
  key: string;
  cachedAt: string;
  result: T;
}

function cachePath(key: string): string {
  mkdirSync(CACHE_DIR, { recursive: true });
  return join(CACHE_DIR, `${key}.json`);
}

/**
 * Execute fn() once and store the result keyed by sha256(canonicalJson(spec)).
 * Every subsequent call with the same spec returns the stored result without re-calling the model.
 * T must be JSON-serializable.
 */
export async function cachedCall<T>(spec: CachedCallSpec, fn: () => Promise<T>): Promise<T> {
  const key = cacheKey(spec);
  const path = cachePath(key);

  if (existsSync(path)) {
    const entry = JSON.parse(readFileSync(path, "utf-8")) as CacheEntry<T>;
    return entry.result;
  }

  const result = await fn();

  const entry: CacheEntry<T> = {
    spec,
    key,
    cachedAt: new Date().toISOString(),
    result,
  };
  writeFileSync(path, JSON.stringify(entry, null, 2), "utf-8");

  return result;
}
