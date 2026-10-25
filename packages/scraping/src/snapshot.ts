import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Fetch } from "./social.js";
import { sharedWorkJournal, workKey, type WorkSpec } from "@ftb/records/work";

export const hash = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

export function publicWebUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new Error("Only credential-free HTTPS URLs on port 443 are allowed");
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(api[-_]?key|key|token|access_token)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.href;
}

const bareHost = (host: string): string => host.toLowerCase().replace(/^www\./, "");

/** True when `host` is `domain` or a subdomain of it; a leading `www.` never matters. */
export function hostMatches(host: string, domain: string): boolean {
  const h = bareHost(host);
  const d = bareHost(domain);
  return !!d && (h === d || h.endsWith(`.${d}`));
}

/** Redacts credentials from error text before it is stored in a coverage row. */
export function describeError(error: unknown, secrets: (string | undefined)[] = []): string {
  let text = error instanceof Error ? `${error.message}` : String(error);
  for (const secret of secrets) if (secret) text = text.split(secret).join("[redacted]");
  text = text
    .replace(/(api[-_]?key|access_token|token|key)=[^&\s"']+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 240 ? `${text.slice(0, 240)}…` : text || "unknown error";
}

/** Ordered SerpAPI key pool: primary first, then the fallback. Blank values are dropped. */
export function serpApiKeysFromEnv(env: {
  SERPAPI_API_KEY?: string;
  SERPAPI_API_KEY_FALLBACK?: string;
}): string[] {
  return [...new Set([env.SERPAPI_API_KEY, env.SERPAPI_API_KEY_FALLBACK].map((k) => k?.trim()).filter((k): k is string => !!k))];
}

/** SERPAPI_MAX_REQUESTS: hard cap on live SerpAPI calls per process; unset = unlimited. */
export function serpApiMaxRequestsFromEnv(env: { SERPAPI_MAX_REQUESTS?: string }): number | undefined {
  const raw = env.SERPAPI_MAX_REQUESTS?.trim();
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("Invalid SERPAPI_MAX_REQUESTS");
  return n;
}

/** Account-level exhaustion (out of searches / plan limit), as opposed to a transient
 * 5xx or a bad key. Such responses are never frozen as the answer for a query. */
export function isSerpQuotaResponse(status: number, body: Uint8Array): boolean {
  if (status === 429) return true;
  if (status !== 401 && status !== 403) return false;
  try {
    const error = (JSON.parse(Buffer.from(body).toString("utf8")) as { error?: unknown }).error;
    return typeof error === "string" && /run out of searches|plan|limit/i.test(error);
  } catch {
    return false;
  }
}

/** SerpAPI cannot be called now (budget reached or every key exhausted). Callers should
 * record a coverage gap, never an empty result. */
export class SerpApiUnavailableError extends Error {
  constructor(
    readonly reason: "budget" | "quota",
    message: string,
  ) {
    super(message);
    this.name = "SerpApiUnavailableError";
  }
}

export interface WebSnapshot {
  id: string;
  url: string;
  fetchedAt: string;
  contentHash: string;
  status: number;
  contentType: string;
}
interface Stored extends WebSnapshot {
  body: string;
}

/** One immutable directory per run. Search responses, robots files, pages and
 * social APIs use the same transport. An offline miss never calls the network.
 * Hosts are operator-approved configuration, NOT hosts discovered by search.
 * Redirects fail closed rather than escaping that boundary or forwarding tokens. */
export class FrozenWebClient {
  private readonly queue = new Map<string, Promise<unknown>>();
  private readonly seen = new Map<string, WebSnapshot>();
  constructor(
    private readonly options: {
      directory: string;
      fetchedAt: string;
      allowedHosts: string[];
      offline?: boolean;
      intervalMs?: number;
      maxBytes?: number;
      fetch?: typeof fetch;
      recovery?: boolean;
      /** Key pool + optional hard cap for serpapi.com requests. */
      serpApi?: { keys: string[]; maxRequests?: number };
      /** Extra attempts after a timeout/network failure (default 2). */
      networkRetries?: number;
      /** First retry delay; doubles each attempt (default 1000ms). */
      retryDelayMs?: number;
      /** Blocked responses from one host before the rest of the run skips it (default 2). */
      blockThreshold?: number;
    },
  ) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(options.fetchedAt) ||
      !Number.isFinite(Date.parse(options.fetchedAt))
    ) {
      throw new Error("A fixed fetchedAt date is required");
    }
  }

  private serpLive = 0;
  private serpCached = 0;
  private serpKey = 0;
  private serpExhausted = false;
  private serpStop?: SerpApiUnavailableError;

  serpApiStats(): { live: number; cached: number; keyNumber: number; gap?: string } {
    return {
      live: this.serpLive,
      cached: this.serpCached,
      keyNumber: this.serpKey + 1,
      ...(this.serpStop ? { gap: this.serpStop.message } : {}),
    };
  }

  serpApiSummary(): string {
    const s = this.serpApiStats();
    return `serpapi requests: ${s.live} live, ${s.cached} cached, key #${s.keyNumber}${s.gap ? ` (stopped: ${s.gap})` : ""}`;
  }

  private stopSerp(reason: "budget" | "quota", message: string): never {
    this.serpStop ??= new SerpApiUnavailableError(reason, message);
    throw new SerpApiUnavailableError(reason, message);
  }

  private readonly blocked = new Map<string, { count: number; reason: string }>();

  /** Record an anti-bot/WAF response for a host (shared by every candidate in the run). */
  noteBlocked(host: string, reason: string): void {
    const key = bareHost(host);
    const prior = this.blocked.get(key);
    this.blocked.set(key, { count: (prior?.count ?? 0) + 1, reason: prior?.reason ?? reason });
  }

  /** Reason string once the per-host circuit breaker has tripped; otherwise undefined. */
  blockedHost(host: string): string | undefined {
    const entry = this.blocked.get(bareHost(host));
    return entry && entry.count >= (this.options.blockThreshold ?? 2) ? entry.reason : undefined;
  }

  isHostAllowed(host: string): boolean {
    return this.options.allowedHosts.some((allowed) => hostMatches(host, allowed));
  }

  snapshots(): WebSnapshot[] {
    return [...this.seen.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  get isOffline(): boolean {
    return this.options.offline ?? false;
  }

  readonly fetch: Fetch = async (value, init) => {
    const url = new URL(value);
    const safeUrl = publicWebUrl(value);
    if (
      !this.isHostAllowed(url.hostname) ||
      !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) ||
      url.hostname.endsWith(".localhost")
    ) {
      throw new Error("Host is not approved for this run");
    }
    const headers = { "User-Agent": "FairyTaleBallot/1.0", ...init?.headers };
    const isSerp = url.hostname === "serpapi.com";
    const pool = this.options.serpApi?.keys ?? [];
    const givenKey = isSerp ? url.searchParams.get("api_key") : null;
    const headerEntries = Object.entries(headers).sort();
    const identity = (target: string) =>
      hash(JSON.stringify([target, headerEntries, this.options.fetchedAt]));
    // SerpAPI identity ignores api_key so switching keys never re-spends a search.
    // Credentials are hashed only for other hosts; never persisted in metadata.
    let id: string;
    const legacyIds: string[] = [];
    if (isSerp) {
      const bare = new URL(value);
      bare.searchParams.delete("api_key");
      id = identity(bare.href);
      if (givenKey)
        for (const key of new Set([givenKey, ...pool]))
          legacyIds.push(identity(value.split(givenKey).join(key)));
    } else id = identity(value);
    const dir = this.options.directory;
    const journal = this.options.recovery ? sharedWorkJournal(join(dir, "work")) : undefined;
    const task: WorkSpec = { key: workKey(["web-request-v1", id]), kind: "request", scope: "web",
      payload: { url: safeUrl, requestKey: id, fetchedAt: this.options.fetchedAt } };
    const response = (stored: Stored, expectedId: string): Response => {
      if (
        stored.id !== expectedId ||
        stored.fetchedAt !== this.options.fetchedAt ||
        stored.url !== safeUrl ||
        stored.contentHash !== hash(Buffer.from(stored.body, "base64"))
      )
        throw new Error("Corrupt web snapshot");
      const { body, ...meta } = stored;
      this.seen.set(expectedId, meta);
      return new Response(
        [204, 205, 304].includes(stored.status) ? null : Buffer.from(body, "base64"),
        {
          status: stored.status,
          headers: { "content-type": stored.contentType },
        },
      );
    };
    const read = async (candidate: string): Promise<Stored | undefined> => {
      try {
        return JSON.parse(await readFile(join(dir, `${candidate}.json`), "utf8")) as Stored;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw new Error("Invalid web snapshot file");
      }
    };
    // New id first, then legacy key-bearing ids. Frozen quota errors from old runs are
    // not answers: ignore them so a later run with quota can fetch the query.
    const cached = async (): Promise<{ stored: Stored; id: string } | undefined> => {
      for (const candidate of [id, ...legacyIds]) {
        const stored = await read(candidate);
        if (!stored) continue;
        if (isSerp && isSerpQuotaResponse(stored.status, Buffer.from(stored.body, "base64"))) continue;
        return { stored, id: candidate };
      }
      return undefined;
    };
    const prior = await cached();
    if (prior) {
      if (isSerp) this.serpCached++;
      if (prior.stored.status >= 200 && prior.stored.status < 300) journal?.cached(task, { snapshotId: prior.stored.id, contentHash: prior.stored.contentHash });
      else journal?.note(task, [401, 403].includes(prior.stored.status) ? "blocked" : [404, 410].includes(prior.stored.status) ? "missing" : "failed", `Frozen HTTP ${prior.stored.status}; retry in a new release, never overwrite frozen evidence`);
      return response(prior.stored, prior.id);
    }
    if (this.options.offline) throw new Error(`Offline snapshot miss: ${safeUrl}`);
    const previous = this.queue.get(url.hostname) ?? Promise.resolve();
    const pending = previous
      .catch(() => undefined)
      .then(async () => {
        const raced = await cached();
        if (raced) {
          if (isSerp) this.serpCached++;
          return raced;
        }
        const maxRequests = this.options.serpApi?.maxRequests;
        const send = async (
          requestUrl: string,
          beforeRetry?: () => void,
        ): Promise<{ res: Response; bytes: Buffer }> => {
          const retries = this.options.networkRetries ?? 2;
          let sent: Response | undefined;
          for (let attempt = 0; !sent; attempt++) {
            try {
              sent = await (this.options.fetch ?? fetch)(requestUrl, {
                headers,
                redirect: "manual",
                signal: AbortSignal.timeout(30_000),
              });
            } catch (error) {
              const name = (error as { name?: string } | undefined)?.name;
              const kind = name === "TimeoutError" || name === "AbortError" ? "timeout" : "network error";
              if (attempt >= retries)
                throw new Error(`Network request failed (${kind}, ${attempt + 1} attempts): ${safeUrl}`);
              await delay((this.options.retryDelayMs ?? 1000) * 2 ** attempt);
              beforeRetry?.();
            }
          }
          const res: Response = sent;
          if (res.status >= 300 && res.status < 400) {
            await res.body?.cancel();
            throw new Error(`Redirect requires explicit approved URL: ${safeUrl}`);
          }
          const chunks: Uint8Array[] = [];
          let size = 0;
          const reader = res.body?.getReader();
          if (reader) {
            try {
              for (;;) {
                const { done, value: chunk } = await reader.read();
                if (done) break;
                size += chunk.length;
                if (size > (this.options.maxBytes ?? 5_000_000))
                  throw new Error("Web response exceeds byte budget");
                chunks.push(chunk);
              }
            } finally {
              await reader.cancel();
            }
          }
          return { res, bytes: Buffer.concat(chunks) };
        };
        const perform = async () => {
          let result: { res: Response; bytes: Buffer };
          if (!isSerp) result = await send(value);
          else {
            for (let attempt = 0; ; attempt++) {
              if (this.serpExhausted)
                this.stopSerp("quota", "all SerpAPI keys are out of searches; search not run");
              if (maxRequests !== undefined && this.serpLive >= maxRequests)
                this.stopSerp("budget", `SerpAPI request budget (SERPAPI_MAX_REQUESTS=${maxRequests}) reached; search not run`);
              const used = this.serpKey;
              const requestUrl =
                pool.length && givenKey ? value.split(givenKey).join(pool[used]!) : value;
              this.serpLive++;
              result = await send(requestUrl, () => {
                if (maxRequests !== undefined && this.serpLive >= maxRequests)
                  this.stopSerp("budget", `SerpAPI request budget (SERPAPI_MAX_REQUESTS=${maxRequests}) reached; search not run`);
                this.serpLive++;
              });
              if (!isSerpQuotaResponse(result.res.status, result.bytes)) break;
              // Exhausted account: never freeze it, never retry the same key.
              if (used === this.serpKey) {
                if (used + 1 < pool.length) this.serpKey = used + 1;
                else this.serpExhausted = true;
              }
              if (this.serpExhausted || attempt >= 1)
                this.stopSerp("quota", "SerpAPI quota exhausted on every available key; search not run");
            }
          }
          const { res, bytes } = result;
          const stored: Stored = {
            id,
            url: safeUrl,
            fetchedAt: this.options.fetchedAt,
            contentHash: hash(bytes),
            status: res.status,
            contentType: res.headers.get("content-type") ?? "",
            body: bytes.toString("base64"),
          };
          await mkdir(dir, { recursive: true });
          const path = join(dir, `${id}.json`);
          const temp = `${path}.${randomUUID()}.tmp`;
          await writeFile(temp, JSON.stringify(stored));
          await rename(temp, path);
          return { stored, id };
        };
        try {
          return journal ? await journal.run(task, perform, {
            checkpoint: ({ stored }) => ({ snapshotId: stored.id, contentHash: stored.contentHash, status: stored.status }),
            outcome: ({ stored }) => ({
              state: stored.status >= 200 && stored.status < 300 ? "succeeded" : [401, 403].includes(stored.status) ? "blocked" : [404, 410].includes(stored.status) ? "missing" : "failed",
              reason: `Frozen HTTP ${stored.status}; non-success responses need a new release, not an overwritten snapshot`,
            }),
          }) : await perform();
        } finally {
          await delay(this.options.intervalMs ?? 500);
        }
      });
    this.queue.set(url.hostname, pending);
    const done = await pending;
    return response(done.stored, done.id);
  };
}
