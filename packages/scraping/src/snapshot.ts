import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Fetch } from "./social.js";

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
    },
  ) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(options.fetchedAt) ||
      !Number.isFinite(Date.parse(options.fetchedAt))
    ) {
      throw new Error("A fixed fetchedAt date is required");
    }
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
      !this.options.allowedHosts.includes(url.hostname) ||
      !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) ||
      url.hostname.endsWith(".localhost")
    ) {
      throw new Error("Host is not approved for this run");
    }
    const headers = { "User-Agent": "FairyTaleBallot/1.0", ...init?.headers };
    // Hash credentials into the request identity, never persist them in metadata.
    const id = hash(
      JSON.stringify([value, Object.entries(headers).sort(), this.options.fetchedAt]),
    );
    const path = join(this.options.directory, `${id}.json`);
    const response = (stored: Stored): Response => {
      if (
        stored.id !== id ||
        stored.fetchedAt !== this.options.fetchedAt ||
        stored.url !== safeUrl ||
        stored.contentHash !== hash(Buffer.from(stored.body, "base64"))
      )
        throw new Error("Corrupt web snapshot");
      const { body, ...meta } = stored;
      this.seen.set(id, meta);
      return new Response(
        [204, 205, 304].includes(stored.status) ? null : Buffer.from(body, "base64"),
        {
          status: stored.status,
          headers: { "content-type": stored.contentType },
        },
      );
    };
    const cached = async (): Promise<Stored | undefined> => {
      try {
        return JSON.parse(await readFile(path, "utf8")) as Stored;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw new Error("Invalid web snapshot file");
      }
    };
    const prior = await cached();
    if (prior) return response(prior);
    if (this.options.offline) throw new Error(`Offline snapshot miss: ${safeUrl}`);
    const previous = this.queue.get(url.hostname) ?? Promise.resolve();
    const pending = previous
      .catch(() => undefined)
      .then(async () => {
        const raced = await cached();
        if (raced) return raced;
        try {
          let res: Response;
          try {
            res = await (this.options.fetch ?? fetch)(value, {
              headers,
              redirect: "manual",
              signal: AbortSignal.timeout(30_000),
            });
          } catch {
            throw new Error(`Network request failed: ${safeUrl}`);
          }
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
          const bytes = Buffer.concat(chunks);
          const stored: Stored = {
            id,
            url: safeUrl,
            fetchedAt: this.options.fetchedAt,
            contentHash: hash(bytes),
            status: res.status,
            contentType: res.headers.get("content-type") ?? "",
            body: bytes.toString("base64"),
          };
          await mkdir(this.options.directory, { recursive: true });
          const temp = `${path}.${randomUUID()}.tmp`;
          await writeFile(temp, JSON.stringify(stored));
          await rename(temp, path);
          return stored;
        } finally {
          await delay(this.options.intervalMs ?? 500);
        }
      });
    this.queue.set(url.hostname, pending);
    return response(await pending);
  };
}
