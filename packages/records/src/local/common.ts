import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { AdapterContext, AdapterResult } from "../adapters";
import { sha256 } from "../fetch";
import { isoDate, normalizeVote } from "../model";
import type { DateWindow, Snapshot } from "../model";

// These adapters consume structured JSON only. Embedded markup is retained as
// an opaque source string, never parsed, rendered, or followed as a document.
export const sourceUrlSchema = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}, "Use an HTTPS source URL without credentials, query parameters, or a fragment");

export const sourceIdSchema = z.union([
  z.string().regex(/^\d+$/), z.number().int().nonnegative(),
]).transform(String);
export const sourceDateSchema = z.string().refine((value) => {
  try {
    isoDate(value);
    return /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value) &&
      Number.isFinite(Date.parse(value));
  }
  catch { return false; }
}, "Expected a source ISO date or timestamp").transform(isoDate);

export const pagingShape = {
  pageSize: z.number().int().min(1).max(1000).default(100),
  maxPages: z.number().int().min(1).max(1000).default(100),
};

export interface Located<T> {
  value: T;
  snapshot: Snapshot;
  locator: string;
}

interface PageOptions<T> {
  context: AdapterContext;
  url: URL;
  pageSize: number;
  maxPages: number;
  parse: (value: unknown) => T;
  style?: "socrata" | "odata";
}

/** A bounded pager for OData arrays/value envelopes and Socrata arrays. The
 * caller must not publish a tally from an incomplete list of vote rows. */
export async function pages<T>(options: PageOptions<T>): Promise<{
  rows: Located<T>[];
  complete: boolean;
  problems: string[];
}> {
  const { context, pageSize, maxPages, parse } = options;
  const original = new URL(options.url);
  const socrata = options.style === "socrata";
  const offsetKey = socrata ? "$offset" : "$skip";
  const limitKey = socrata ? "$limit" : "$top";
  original.searchParams.set(limitKey, String(pageSize));
  original.searchParams.set(offsetKey, "0");
  let url = new URL(original);
  let offset = 0;
  const seen = new Set<string>();
  const rows: Located<T>[] = [];
  const problems: string[] = [];
  let expectedCount: number | undefined;

  for (let page = 0; page < maxPages; page++) {
    const key = new URL(url);
    key.searchParams.sort();
    if (seen.has(key.href)) {
      problems.push("Pagination repeated a page URL; remaining coverage is unknown.");
      break;
    }
    seen.add(key.href);
    try {
      const snapshot = await context.client.get(url.href, { format: "json" });
      const json: unknown = JSON.parse(snapshot.text);
      let values: unknown[];
      let pointer: string;
      let nextLink: string | undefined;
      if (Array.isArray(json)) {
        values = json;
        pointer = "";
      } else {
        const envelope = z.object({
          value: z.array(z.unknown()),
          "@odata.nextLink": z.string().min(1).nullish(),
          "odata.nextLink": z.string().min(1).nullish(),
          "@odata.count": z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).optional(),
        }).parse(json);
        if (socrata) throw new Error("Socrata source did not return a JSON row array");
        values = envelope.value;
        pointer = "/value";
        nextLink = envelope["@odata.nextLink"] ?? envelope["odata.nextLink"] ?? undefined;
        if (envelope["@odata.count"] !== undefined) {
          const count = Number(envelope["@odata.count"]);
          if (expectedCount !== undefined && count !== expectedCount) {
            problems.push("OData count changed during pagination; the source may have changed.");
          }
          expectedCount = count;
        }
      }
      for (const [index, value] of values.entries()) {
        try { rows.push({ value: parse(value), snapshot, locator: `${pointer}/${index}` }); }
        catch {
          problems.push(`Source JSON schema error at page ${page + 1}, ${pointer}/${index}.`);
        }
      }
      offset += values.length;
      if (nextLink) {
        const next = new URL(nextLink, url);
        if (next.origin !== original.origin || next.pathname !== original.pathname ||
            next.username || next.password || next.hash) {
          problems.push("Unsafe OData nextLink: origin or collection path changed; not followed.");
          break;
        }
        // A publisher may omit the filter in a relative continuation. Restore
        // it, but never accept a continuation that changes the requested scope.
        for (const field of ["$filter", "$orderby"]) {
          const expected = original.searchParams.get(field);
          const actual = next.searchParams.get(field);
          if (expected !== null && actual !== null && expected !== actual) {
            throw new Error("OData nextLink changed the configured query scope");
          }
          if (expected !== null) next.searchParams.set(field, expected);
        }
        url = next;
      } else if (values.length < pageSize || offset === expectedCount) {
        if (expectedCount !== undefined && offset !== expectedCount) {
          problems.push("OData returned a different row total than its count without a continuation.");
        }
        return { rows, complete: problems.length === 0, problems };
      } else {
        url = new URL(original);
        url.searchParams.set(offsetKey, String(offset));
      }
    } catch (error) {
      problems.push(error instanceof z.ZodError || error instanceof SyntaxError
        ? "Source JSON schema error; remaining coverage is unknown."
        : "Source request or pagination validation failed; remaining coverage is unknown.");
      break;
    }
    if (page + 1 === maxPages) {
      problems.push(`Pagination guard reached maxPages=${maxPages}; remaining coverage is unknown.`);
    }
  }
  return { rows, complete: false, problems };
}

export function baseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function actionId(kind: string, source: string, ...parts: (string | number)[]): string {
  return [kind, sha256(baseUrl(source)).slice(0, 20), ...parts.map((part) => encodeURIComponent(String(part)))].join(":");
}

export function nonAction(value: string): boolean {
  return /^\s*(?:withdrawn\b|no[ -]+action\b|no[ -]+vote\b)/i.test(value);
}

export function localVote(raw: string): NonNullable<OfficialAction["vote"]>["value"] {
  const value = raw.trim().toLowerCase();
  if (["offdais", "off-dais", "non-voting", "non voting", "not-voting"].includes(value)) return "not_voting";
  if (["recusal", "recuse"].includes(value)) return "recused";
  return normalizeVote(raw);
}

/** Explicit absence is counted separately; off-dais/non-voting is not absence. */
export function tally(rawVotes: string[]): NonNullable<OfficialAction["margin"]> | undefined {
  const margin: NonNullable<OfficialAction["margin"]> = { yes: 0, no: 0 };
  for (const raw of rawVotes) {
    const value = localVote(raw);
    if (value === "other") return undefined;
    const key = value === "not_voting"
      ? (raw.trim().toLowerCase() === "absent" ? "absent" : "notVoting")
      : value;
    margin[key] = (margin[key] ?? 0) + 1;
  }
  return margin;
}

/** Duplicate IDs are never silently deduplicated: a shifting source can make
 * offset pagination skip a different record. Reject both copies. */
export function uniqueRows<T>(rows: Located<T>[], id: (value: T) => string, problems: string[], label: string): Located<T>[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(id(row.value), (counts.get(id(row.value)) ?? 0) + 1);
  if ([...counts.values()].some((count) => count > 1)) problems.push(`Duplicate ${label} IDs; affected records rejected.`);
  return rows.filter((row) => counts.get(id(row.value)) === 1);
}

export function report(actions: OfficialAction[], problems: string[], window: DateWindow, summary: string): AdapterResult {
  const unique = [...new Set(problems)];
  const details = unique.slice(0, 10).join(" ");
  return {
    actions: actions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    status: unique.length ? "partial" : "complete",
    reason: [
      summary,
      details,
      unique.length > 10 ? `${unique.length - 10} additional limitations.` : "",
      `Coverage applies only to the configured JSON dataset and [${window.since}, ${window.before}), not all official history.`,
      "Publisher freshness, omissions and later corrections are unverified; fetchedAt is a snapshot time, not proof of current minutes.",
    ].filter(Boolean).join(" "),
  };
}

export function invalidConfig(kind: string): AdapterResult {
  return { actions: [], status: "unavailable", reason: `${kind} configuration is invalid; no source was requested.` };
}
