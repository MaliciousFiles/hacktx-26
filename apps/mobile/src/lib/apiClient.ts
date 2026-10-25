// The only way the app talks to the serving API (APP_BUILD.md §7). Every request is checked
// against an allowlist of paths and query keys, so swipes, picks or location cannot be attached.
import type { Api, ISODate } from "@ftb/types";

type Query = Record<string, string>;

const ALLOWED_QUERY: Record<string, readonly string[]> = {
  "/ballot": ["ballotStyleId", "releaseId"],
  "/reveal": ["releaseId"],
  "/daily": ["date"],
  "/research": ["releaseId"],
};

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/** Builds a request URL or throws if the path or any query key is not allowlisted. */
export function buildUrl(baseUrl: string, path: string, query: Query): string {
  const [route, param, ...rest] = path.split("/").filter(Boolean);
  const routeKey = `/${route ?? ""}`;
  const allowed = ALLOWED_QUERY[routeKey];
  if (!allowed) throw new Error(`Path not allowed: ${path}`);
  const takesParam = routeKey === "/reveal";
  if (rest.length > 0 || (param !== undefined) !== takesParam) {
    throw new Error(`Path not allowed: ${path}`);
  }
  if (param !== undefined && !SAFE_SEGMENT.test(param)) {
    throw new Error(`Path segment not allowed: ${param}`);
  }
  for (const key of Object.keys(query)) {
    if (!allowed.includes(key)) throw new Error(`Query key not allowed on ${routeKey}: ${key}`);
  }
  for (const key of allowed) {
    if (!query[key]) throw new Error(`Missing query key on ${routeKey}: ${key}`);
  }
  const search = new URLSearchParams(query).toString();
  return `${baseUrl.replace(/\/$/, "")}${path}?${search}`;
}

export type Fetch = (
  url: string,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function createApiClient(baseUrl: string, fetcher: Fetch) {
  async function get<T>(path: string, query: Query): Promise<T> {
    const res = await fetcher(buildUrl(baseUrl, path, query));
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return (await res.json()) as T;
  }
  return {
    ballot: (ballotStyleId: string, releaseId: string) =>
      get<Api["GET /ballot"]["res"]>("/ballot", { ballotStyleId, releaseId }),
    reveal: (contestId: string, releaseId: string) =>
      get<Api["GET /reveal/:contestId"]["res"]>(`/reveal/${contestId}`, { releaseId }),
    daily: (date: ISODate) => get<Api["GET /daily"]["res"]>("/daily", { date }),
    research: (releaseId: string) => get<Api["GET /research"]["res"]>("/research", { releaseId }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
