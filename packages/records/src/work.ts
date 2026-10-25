import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

export type WorkState = "pending" | "running" | "retry_wait" | "succeeded" | "blocked" | "missing" | "failed";
export interface WorkSpec {
  key: string;
  kind: "request" | "source" | "inventory" | "coverage";
  scope: string;
  payload: unknown;
}
export interface WorkRow extends WorkSpec {
  state: WorkState;
  attempts: number;
  nextAt: number;
  leaseUntil: number;
  token: string | null;
  reason: string;
  result: unknown;
}
export class WorkDeferred extends Error {}
export class RequestFailure extends Error {
  constructor(message: string, readonly status?: number, readonly retryAfterMs?: number) { super(message); }
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

/** Metadata only. Tokens are supplied by the connector at execution time, not saved as jobs. */
function publicData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicData);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/^(?:api[-_]?key|authorization|password|token|access_token|__VIEWSTATE\d*|__EVENTVALIDATION)$/i.test(key))
    .map(([key, item]) => [key, publicData(item)]));
  if (typeof value === "string") return value.replace(/([?&](?:api_key|apikey|key|token|access_token)=)[^&\s"<>]+/gi, "$1[redacted]");
  return value;
}

/** Local, transactional queue shared by processes. Raw evidence stays in immutable caches.
 * Leases/heartbeats recover killed workers; success is not an exhaustion certificate. */
export class WorkJournal {
  private readonly db: DatabaseSync;
  constructor(directory: string, readonly options: { now?: () => number; leaseMs?: number; maxAttempts?: number } = {}) {
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(join(directory, "work.sqlite"));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;
      CREATE TABLE IF NOT EXISTS jobs (
        key TEXT PRIMARY KEY, kind TEXT NOT NULL, scope TEXT NOT NULL, payload TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
        nextAt INTEGER NOT NULL DEFAULT 0, leaseUntil INTEGER NOT NULL DEFAULT 0,
        token TEXT, reason TEXT NOT NULL DEFAULT '', result TEXT, updatedAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS jobs_scope_state ON jobs(scope,state);
      CREATE TABLE IF NOT EXISTS transitions (
        id INTEGER PRIMARY KEY, key TEXT NOT NULL, at INTEGER NOT NULL, state TEXT NOT NULL, reason TEXT NOT NULL
      );`);
  }
  private closed = false;
  private readonly heartbeats = new Set<ReturnType<typeof setInterval>>();
  close() {
    this.closed = true;
    for (const timer of this.heartbeats) clearInterval(timer);
    this.heartbeats.clear();
    this.db.close();
  }
  private now() { return this.options.now?.() ?? Date.now(); }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* the original failure is the useful one */ }
      throw error;
    }
  }
  register(spec: WorkSpec): void {
    const payload = JSON.stringify(publicData(spec.payload)) ?? "null";
    this.db.prepare("INSERT OR IGNORE INTO jobs(key,kind,scope,payload,updatedAt) VALUES (?,?,?,?,?)")
      .run(spec.key, spec.kind, spec.scope, payload, this.now());
    const row = this.get(spec.key)!;
    if (row.kind !== spec.kind || row.scope !== spec.scope || JSON.stringify(row.payload) !== payload)
      throw new Error("Work key reused for different logical input");
  }
  registerAll(specs: WorkSpec[]): void { this.transaction(() => { for (const spec of specs) this.register(spec); }); }
  get(key: string): WorkRow | undefined {
    const row = this.db.prepare("SELECT * FROM jobs WHERE key=?").get(key) as Record<string, any> | undefined;
    return row ? { ...row, payload: JSON.parse(row.payload), result: row.result === null ? undefined : JSON.parse(row.result) } as WorkRow : undefined;
  }
  rows(scope?: string): WorkRow[] {
    const prefix = `${scope}:`;
    const rows = scope === undefined ? this.db.prepare("SELECT key FROM jobs ORDER BY key").all() : this.db.prepare("SELECT key FROM jobs WHERE scope=? OR substr(scope,1,?)=? ORDER BY key").all(scope, prefix.length, prefix);
    return rows.map((r) => this.get(String(r.key))!);
  }
  /** Aggregated in SQL: checkpoints can be megabytes each, and counting must never parse them. */
  counts(scope?: string) {
    const prefix = `${scope}:`;
    const grouped = (scope === undefined
      ? this.db.prepare("SELECT kind,state,count(*) AS n FROM jobs GROUP BY kind,state").all()
      : this.db.prepare("SELECT kind,state,count(*) AS n FROM jobs WHERE scope=? OR substr(scope,1,?)=? GROUP BY kind,state").all(scope, prefix.length, prefix)) as { kind: string; state: WorkState; n: number }[];
    const sum = (match: (r: { kind: string; state: WorkState }) => boolean) => grouped.filter(match).reduce((total, r) => total + Number(r.n), 0);
    const count = (state: WorkState) => sum((r) => r.state === state);
    return { discovered: sum(() => true), fetched: sum((r) => r.kind === "request" && r.state === "succeeded"),
      succeeded: count("succeeded"), failed: count("failed"), blocked: count("blocked"), missing: count("missing"),
      pending: count("pending"), running: count("running"), retryWait: count("retry_wait"),
      remaining: sum((r) => r.state !== "succeeded"),
      inventoryUnknown: sum((r) => ["coverage", "inventory"].includes(r.kind) && r.state !== "succeeded") };
  }
  claim(spec: WorkSpec): string {
    this.register(spec);
    return this.transaction(() => {
      const row = this.get(spec.key)!;
      const now = this.now();
      if (row.state === "running" && row.leaseUntil > now) throw new WorkDeferred("Work leased by another worker");
      if (row.state === "retry_wait" && row.nextAt > now) throw new WorkDeferred(`Retry deferred until ${new Date(row.nextAt).toISOString()}`);
      if (["blocked", "missing", "failed"].includes(row.state)) throw new WorkDeferred(`Work ${row.state}; explicit operator retry required: ${row.reason}`);
      const token = randomUUID();
      this.db.prepare("UPDATE jobs SET state='running',attempts=attempts+1,token=?,leaseUntil=?,updatedAt=? WHERE key=?")
        .run(token, now + (this.options.leaseMs ?? 120_000), now, spec.key);
      this.event(spec.key, "running", "Claimed");
      return token;
    });
  }
  private event(key: string, state: WorkState, reason: string) {
    this.db.prepare("INSERT INTO transitions(key,at,state,reason) VALUES (?,?,?,?)").run(key, this.now(), state, reason);
  }
  finish(key: string, token: string, state: WorkState, reason: string, result?: unknown, nextAt = 0): void {
    this.transaction(() => {
      const row = this.get(key);
      if (!row || row.token !== token || row.state !== "running") throw new Error("Stale work lease cannot commit");
      const message = String(publicData(reason));
      this.db.prepare("UPDATE jobs SET state=?,reason=?,result=?,nextAt=?,leaseUntil=0,token=NULL,updatedAt=? WHERE key=?")
        .run(state, message, result === undefined ? null : JSON.stringify(result), nextAt, this.now(), key);
      this.event(key, state, message);
    });
  }
  /** Successful raw-cache reads repair interrupted transport tasks without another HTTP request. */
  cached(spec: WorkSpec, result: unknown): void {
    this.register(spec);
    this.transaction(() => {
      const row = this.get(spec.key)!;
      if (row.state === "running" && row.leaseUntil > this.now()) return;
      const serialized = JSON.stringify(publicData(result));
      if (row.state === "succeeded" && row.reason === "Verified immutable cache" && JSON.stringify(row.result) === serialized) return;
      this.db.prepare("UPDATE jobs SET state='succeeded',reason='Verified immutable cache',result=?,token=NULL,leaseUntil=0,nextAt=0,updatedAt=? WHERE key=?")
        .run(serialized, this.now(), spec.key);
      this.event(spec.key, "succeeded", "Verified immutable cache");
    });
  }
  retry(states: WorkState[], scope?: string): number {
    if (states.some((s) => s === "running" || s === "succeeded")) throw new Error("Cannot reset live leases or successful work");
    return this.transaction(() => {
      const rows = this.rows(scope).filter((r) => states.includes(r.state));
      for (const row of rows) {
        this.db.prepare("UPDATE jobs SET state='pending',nextAt=0,reason='Operator retry',updatedAt=? WHERE key=?").run(this.now(), row.key);
        this.event(row.key, "pending", "Operator retry");
      }
      return rows.length;
    });
  }
  note(spec: WorkSpec, state: WorkState, reason: string): void {
    this.register(spec);
    this.transaction(() => {
      const row = this.get(spec.key)!;
      if (row.state === "running" && row.leaseUntil > this.now()) throw new WorkDeferred("Cannot replace live work");
      this.db.prepare("UPDATE jobs SET state=?,reason=?,nextAt=0,updatedAt=? WHERE key=?")
        .run(state, String(publicData(reason)), this.now(), spec.key);
      this.event(spec.key, state, String(publicData(reason)));
    });
  }
  async run<T>(spec: WorkSpec, fn: () => Promise<T>, options: { reuse?: boolean; checkpoint?: (result: T) => unknown; outcome?: (result: T) => { state: WorkState; reason: string } } = {}): Promise<T> {
    this.register(spec);
    const old = this.get(spec.key)!;
    if (options.reuse && old.state === "succeeded" && old.result !== undefined) return old.result as T;
    const token = this.claim(spec);
    // A timer callback must never throw: an uncaught SQLite error (disk full, locked, closed handle)
    // would take down the whole process. A missed beat just lets the lease lapse and finish() reports it.
    const heartbeat = setInterval(() => {
      if (this.closed) return;
      try {
        this.db.prepare("UPDATE jobs SET leaseUntil=? WHERE key=? AND token=? AND state='running'")
          .run(this.now() + (this.options.leaseMs ?? 120_000), spec.key, token);
      } catch { /* retried on the next beat */ }
    }, Math.max(10, Math.floor((this.options.leaseMs ?? 120_000) / 3)));
    heartbeat.unref();
    this.heartbeats.add(heartbeat);
    try {
      const result = await fn();
      const outcome = options.outcome?.(result) ?? { state: "succeeded" as const, reason: "Task executed; not a completeness claim" };
      this.finish(spec.key, token, outcome.state, outcome.reason, options.checkpoint?.(result) ?? result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Task failed";
      const status = error instanceof RequestFailure ? error.status : Number(/HTTP (\d{3})/.exec(message)?.[1]);
      const attempts = this.get(spec.key)!.attempts;
      const state: WorkState = [401, 403].includes(status ?? 0) ? "blocked" : [404, 410].includes(status ?? 0) ? "missing" : attempts >= (this.options.maxAttempts ?? 6) ? "failed" : "retry_wait";
      const wait = Math.max(1000 * 2 ** Math.min(attempts, 12), error instanceof RequestFailure ? error.retryAfterMs ?? 0 : 0);
      this.finish(spec.key, token, state, message, undefined, state === "retry_wait" ? this.now() + wait : 0);
      throw error;
    } finally { clearInterval(heartbeat); this.heartbeats.delete(heartbeat); }
  }
}

export const workKey = (value: unknown) => digest(JSON.stringify(publicData(value)));
const journals = new Map<string, WorkJournal>();
export function sharedWorkJournal(directory: string): WorkJournal {
  let journal = journals.get(directory);
  if (!journal) { journal = new WorkJournal(directory); journals.set(directory, journal); }
  return journal;
}
