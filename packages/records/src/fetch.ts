import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "basic-ftp";
import { z } from "zod";
import { assertHtmlDocument, assertPdfBytes, extractPdfText } from "./document";
import type { Snapshot } from "./model";
import { parseXml } from "./xml";
import { RequestFailure, sharedWorkJournal, workKey, type WorkSpec } from "./work";

export type CacheMode = "reuse" | "refresh" | "offline";
interface FetchOptions {
  directory: string;
  mode?: CacheMode;
  intervalMs?: number;
  timeoutMs?: number;
  retries?: number;
  maxBytes?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<unknown>;
  recovery?: boolean;
}
export interface DocumentOptions {
  format: "xml" | "json" | "html" | "pdf";
  root?: string;
  /** Research archives may retain image-only PDFs. Never implies readable evidence. */
  allowEmptyPdf?: boolean;
  /** Explicitly requested public HTML fragments (e.g. Clerk vote pagination). */
  allowHtmlFragment?: boolean;
  /**
   * POST these fields (application/x-www-form-urlencoded) instead of GET, for official search
   * pages that only answer postbacks (ASP.NET). Volatile view-state validation tokens
   * are sent but excluded from the cache key, so the same logical query is one snapshot.
   */
  form?: Record<string, string>;
}

function formCacheKey(form: Record<string, string> | undefined): string {
  if (!form) return "";
  const volatile = new Set(["__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION", "__VIEWSTATEENCRYPTED"]);
  return JSON.stringify(Object.entries(form).filter(([name]) => !volatile.has(name) && !/^__VIEWSTATE\d+$/.test(name)).sort(([a], [b]) => a.localeCompare(b)));
}

const sensitiveParams = /^(api[-_]?key|key|token|access_token|app_token)$/i;
export function publicUrl(value: string): string {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  for (const key of [...url.searchParams.keys()]) if (sensitiveParams.test(key)) url.searchParams.delete(key);
  url.hash = "";
  url.searchParams.sort();
  return url.toString();
}
export const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
// Do not silently replace undecodable bytes with U+FFFD and publish a changed
// quote. Other source encodings need an explicitly versioned decoder later.
const decode = (bytes: Uint8Array): string => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);

const metadataSchema = z.object({
  id: z.string(), sourceUrl: z.string(), fetchedAt: z.string(), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  format: z.enum(["xml", "json", "html", "pdf"]), contentType: z.string().optional(),
  etag: z.string().optional(), lastModified: z.string().optional(),
});

function acceptHeader(format: DocumentOptions["format"]): string {
  switch (format) {
    case "json": return "application/json";
    case "html": return "text/html, application/xhtml+xml";
    case "pdf": return "application/pdf";
    default: return "application/xml, text/xml";
  }
}

/** Disk-backed, byte-preserving snapshot store. Cache reuse is the default;
 * updates require explicit refresh, so development doesn't hammer publishers. */
export class SnapshotClient {
  private readonly options: Required<Omit<FetchOptions, "fetch" | "sleep">>;
  private readonly request: typeof fetch;
  private readonly sleep: (ms: number) => Promise<unknown>;
  private hosts = new Map<string, Promise<unknown>>();
  /** Metadata only: retaining every document's decoded text would grow without bound over a long run. */
  private readonly seen = new Map<string, Omit<Snapshot, "text">>();
  /** Append-only access log so a task can record just the snapshots it touched (not the whole candidate's). */
  private readonly trail: string[] = [];
  private scope = "unscoped";

  constructor(options: FetchOptions) {
    this.options = {
      mode: "reuse", intervalMs: 500, timeoutMs: 30_000, retries: 2,
      maxBytes: 25_000_000, recovery: false, ...options,
    };
    this.request = options.fetch ?? fetch;
    this.sleep = options.sleep ?? delay;
  }

  get cacheMode(): CacheMode { return this.options.mode; }
  get cacheDirectory(): string { return this.options.directory; }
  get workJournal() { return this.options.recovery ? sharedWorkJournal(join(this.options.directory, "work")) : undefined; }
  setWorkScope(scope: string) { this.scope = scope; }
  get workScope() { return this.scope; }

  async bytes(snapshot: Snapshot): Promise<Uint8Array> {
    if (!/^[a-f0-9]{64}$/.test(snapshot.contentHash)) throw new Error("Invalid snapshot content hash");
    const bytes = await readFile(join(this.options.directory, "objects", snapshot.contentHash));
    if (sha256(bytes) !== snapshot.contentHash) throw new Error("Snapshot cache failed SHA-256 verification");
    return new Uint8Array(bytes);
  }

  snapshots(): Omit<Snapshot, "text">[] {
    return [...this.seen.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Position in the access log; pair with snapshotsSince(). Checkpoints must stay O(task), not O(candidate). */
  mark(): number { return this.trail.length; }
  snapshotsSince(mark: number): Omit<Snapshot, "text">[] {
    return [...new Set(this.trail.slice(mark))].map((id) => this.seen.get(id)!).sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Share disk cache and throttling, but isolate a candidate's source inventory. */
  fork(): SnapshotClient {
    const client = new SnapshotClient({ ...this.options, fetch: this.request, sleep: this.sleep });
    client.hosts = this.hosts;
    client.scope = this.scope;
    return client;
  }

  /** Resolve provenance from an older release even after a URL was refreshed. */
  async read(snapshotId: string): Promise<Snapshot> {
    if (!/^[a-f0-9]{64}$/.test(snapshotId)) throw new Error("Invalid snapshot ID");
    const meta = metadataSchema.parse(JSON.parse(await readFile(
      join(this.options.directory, "snapshots", `${snapshotId}.json`), "utf8",
    )));
    if (meta.id !== snapshotId) throw new Error("Snapshot ID mismatch");
    const bytes = await readFile(join(this.options.directory, "objects", meta.contentHash));
    if (sha256(bytes) !== meta.contentHash) throw new Error("Snapshot cache failed SHA-256 verification");
    return { ...meta, text: await this.decodeDocument(bytes, meta.format) };
  }
  /** Re-registers an archived snapshot's provenance (verifying its bytes) without decoding its text. */
  async restore(snapshotId: string): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(snapshotId)) throw new Error("Invalid snapshot ID");
    const known = this.seen.get(snapshotId);
    if (known) { this.trail.push(snapshotId); return; }
    const meta = metadataSchema.parse(JSON.parse(await readFile(
      join(this.options.directory, "snapshots", `${snapshotId}.json`), "utf8",
    )));
    if (meta.id !== snapshotId) throw new Error("Snapshot ID mismatch");
    const bytes = await readFile(join(this.options.directory, "objects", meta.contentHash));
    if (sha256(bytes) !== meta.contentHash) throw new Error("Snapshot cache failed SHA-256 verification");
    this.remember(meta);
  }

  async get(value: string, options: DocumentOptions): Promise<Snapshot> {
    const url = new URL(value);
    if (!["https:", "ftp:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("Only public HTTPS or anonymous FTP sources are accepted");
    }
    if (url.protocol === "ftp:" && options.format === "pdf") {
      throw new Error("PDF over FTP is not enabled; use an HTTPS official PDF URL");
    }
    const sourceUrl = publicUrl(value);
    const key = sha256(`${options.format}:${options.root ?? ""}:${sourceUrl}${options.form ? `:form:${formCacheKey(options.form)}` : ""}`);
    const journal = this.workJournal;
    const task: WorkSpec = { key: workKey(["records-request-v1", this.scope, key]), kind: "request", scope: this.scope,
      payload: { url: sourceUrl, format: options.format, method: options.form ? "POST" : "GET", requestKey: key } };
    const cached = await this.cached(key, options);
    if (cached && this.options.mode !== "refresh") {
      journal?.cached(task, { snapshotId: cached.id, contentHash: cached.contentHash });
      return this.remember(cached);
    }
    if (this.options.mode === "offline") throw new Error(`Offline cache miss: ${sourceUrl}`);
    // Serialize by host, including FTP. A failed request doesn't poison the queue.
    const previous = this.hosts.get(url.hostname) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      try {
        // Another queued candidate may have populated the same inventory URL.
        const latest = await this.cached(key, options);
        if (latest && this.options.mode === "reuse") {
          journal?.cached(task, { snapshotId: latest.id, contentHash: latest.contentHash });
          return latest;
        }
        return journal ? await journal.run(task, () => this.load(url, key, options, latest ?? cached), {
          checkpoint: (snapshot) => ({ snapshotId: snapshot.id, contentHash: snapshot.contentHash }),
        }) : await this.load(url, key, options, latest ?? cached);
      } finally {
        await this.sleep(this.options.intervalMs);
      }
    });
    this.hosts.set(url.hostname, next);
    return this.remember(await next);
  }

  private remember<T extends Omit<Snapshot, "text">>(snapshot: T): T {
    const { text: _text, ...meta } = snapshot as T & { text?: string };
    this.seen.set(snapshot.id, meta);
    this.trail.push(snapshot.id);
    return snapshot;
  }

  private async decodeDocument(bytes: Uint8Array, format: DocumentOptions["format"]): Promise<string> {
    if (format === "pdf") return extractPdfText(bytes);
    return decode(bytes);
  }

  private async validate(bytes: Uint8Array, text: string, options: DocumentOptions): Promise<void> {
    if (options.format === "xml") {
      if (!options.root) throw new Error("XML snapshots require an expected root element");
      parseXml(text, options.root);
    } else if (options.format === "json") {
      JSON.parse(text); // HTML block/error pages fail here, even when HTTP says 200.
    } else if (options.format === "html") {
      if (options.allowHtmlFragment && /^\s*<(?:div|nav|section)\b/i.test(text) && text.trim()) return;
      assertHtmlDocument(text);
    } else {
      assertPdfBytes(bytes);
      // Re-run extraction as the validation gate; empty extractors are rejected.
      if (!options.allowEmptyPdf && !text.trim()) throw new Error("PDF produced no extractable text");
    }
  }

  private async cached(key: string, options: DocumentOptions): Promise<Snapshot | undefined> {
    let raw: string;
    try { raw = await readFile(join(this.options.directory, "requests", `${key}.json`), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
    const meta = metadataSchema.parse(JSON.parse(raw));
    if (meta.format !== options.format) throw new Error("Cached snapshot format does not match request");
    const bytes = await readFile(join(this.options.directory, "objects", meta.contentHash));
    if (sha256(bytes) !== meta.contentHash) throw new Error("Snapshot cache failed SHA-256 verification");
    const text = await this.decodeDocument(bytes, options.format);
    await this.validate(bytes, text, options);
    return { ...meta, text };
  }

  private async load(url: URL, key: string, options: DocumentOptions, cached?: Snapshot): Promise<Snapshot> {
    let bytes: Uint8Array;
    let headers = new Headers();
    if (url.protocol === "ftp:") {
      const chunks: Buffer[] = [];
      let size = 0;
      const sink = new Writable({ write: (chunk: Buffer, _encoding, done) => {
        size += chunk.length;
        if (size > this.options.maxBytes) return done(new Error("FTP document exceeds size limit"));
        chunks.push(Buffer.from(chunk)); done();
      } });
      const client = new Client(this.options.timeoutMs);
      try {
        await client.access({ host: url.hostname, port: Number(url.port || 21), secure: false });
        await client.downloadTo(sink, decodeURIComponent(url.pathname));
        bytes = Buffer.concat(chunks);
      } catch { throw new Error(`FTP download failed: ${publicUrl(url.href)}`); }
      finally { client.close(); }
    } else {
      let response: Response | undefined;
      for (let attempt = 0; attempt <= this.options.retries; attempt++) {
        try {
          response = await this.request(url.href, {
            ...(options.form ? { method: "POST", body: new URLSearchParams(options.form).toString() } : {}),
            headers: {
              "User-Agent": "FairyTaleBallot/0.1 (official-records research)",
              Accept: acceptHeader(options.format),
              ...(options.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
              ...(cached?.etag ? { "If-None-Match": cached.etag } : {}),
              ...(cached?.lastModified ? { "If-Modified-Since": cached.lastModified } : {}),
            },
            signal: AbortSignal.timeout(this.options.timeoutMs),
          });
        } catch {
          if (attempt === this.options.retries) throw new Error(`Network request failed: ${publicUrl(url.href)}`);
          await this.sleep(500 * 2 ** attempt); continue;
        }
        if (response.status === 304 && cached) return cached;
        if ([408, 429, 500, 502, 503, 504].includes(response.status) && attempt < this.options.retries) {
          const retry = response.headers.get("retry-after");
          const retryMs = retry && /^\d+$/.test(retry) ? Number(retry) * 1000
            : retry ? Date.parse(retry) - Date.now() : NaN;
          const ms = Number.isFinite(retryMs) ? Math.max(0, retryMs) : 500 * 2 ** attempt;
          await response.body?.cancel();
          // Don't ignore a long publisher-requested delay by retrying too soon.
          if (ms > 30_000) throw new RequestFailure(`Source requested a long retry delay; retry later: ${publicUrl(url.href)}`, response.status, ms);
          await this.sleep(ms); continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new RequestFailure(`HTTP ${response.status}: ${publicUrl(url.href)}`, response.status);
        }
        break;
      }
      if (!response?.ok) throw new Error("No successful response");
      headers = response.headers;
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of response.body ?? []) {
        size += chunk.byteLength;
        if (size > this.options.maxBytes) throw new Error(`Document exceeds size limit: ${publicUrl(url.href)}`);
        chunks.push(chunk);
      }
      bytes = Buffer.concat(chunks);
    }
    const text = await this.decodeDocument(bytes, options.format);
    await this.validate(bytes, text, options); // NEVER cache HTML posing as XML/JSON.
    const contentHash = sha256(bytes);
    if (cached?.contentHash === contentHash) return cached;
    const meta = {
      id: sha256(`${key}:${contentHash}`), sourceUrl: publicUrl(url.href), contentHash,
      fetchedAt: new Date().toISOString(), format: options.format,
      contentType: headers.get("content-type") ?? undefined,
      etag: headers.get("etag") ?? undefined, lastModified: headers.get("last-modified") ?? undefined,
    };
    const objects = join(this.options.directory, "objects");
    const requests = join(this.options.directory, "requests");
    const snapshots = join(this.options.directory, "snapshots");
    await mkdir(objects, { recursive: true });
    await mkdir(requests, { recursive: true });
    await mkdir(snapshots, { recursive: true });
    // Immutable objects; only the request pointer changes on explicit refresh.
    await writeFile(join(objects, contentHash), bytes, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    await writeFile(join(snapshots, `${meta.id}.json`), JSON.stringify(meta, null, 2), { flag: "wx" })
      .catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
    const temp = join(requests, `${key}.${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(meta, null, 2));
    await rename(temp, join(requests, `${key}.json`));
    return { ...meta, text };
  }
}
