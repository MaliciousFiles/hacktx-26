// cached_call.ts — content-addressed model call cache (PLAN.md §7 "Harness").
// Key = sha256(canonical_json(CachedCallSpec)). A hit ALWAYS reuses stored output.
// Stores the full response (never just argmax). No cache invalidation without a version bump.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import type { CachedCallSpec } from "@ftb/types";

const CACHE_DIR = join(process.cwd(), ".cache", "model-calls");
const cacheContext = new AsyncLocalStorage<{ directory: string; offline: boolean }>();

/** Scope a batch's model cache and forbid every cache-miss model call offline. */
export function withModelCache<T>(
  options: { directory: string; offline: boolean },
  run: () => Promise<T>,
): Promise<T> {
  return cacheContext.run(options, run);
}

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
  const directory = cacheContext.getStore()?.directory ?? CACHE_DIR;
  mkdirSync(directory, { recursive: true });
  return join(directory, `${key}.json`);
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
    if (entry.key !== key || cacheKey(entry.spec) !== key)
      throw new Error("Invalid model cache entry");
    return entry.result;
  }

  if (cacheContext.getStore()?.offline) throw new Error("Offline model cache miss");

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
