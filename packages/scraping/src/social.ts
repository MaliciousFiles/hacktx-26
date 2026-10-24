// Social media scraping (Person 3, PLAN.md §5 "Social media").
// One SocialFinder per platform. Each one pulls a candidate's own posts inside the release's
// campaign window and returns them as Sources dated by the post itself (never by fetch time).
// Official APIs give full text and exact timestamps (social_post). Platforms without usable
// APIs fall back to SerpApi search snippets (social_snippet), which can be truncated and
// carry coarse dates.
import { createHash } from "node:crypto";
import type { EventDate, ID, ISODate, Source, SourceFinder, SourceType } from "@ftb/types";
import { fromSearchDate, fromTimestamp, googleDateRange, inWindow, type Window } from "./dates.js";
import { publicWebUrl } from "./snapshot.js";

export const SOCIAL_PLATFORMS = [
  "x",
  "facebook",
  "instagram",
  "tiktok",
  "youtube",
  "threads",
  "bluesky",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export interface SocialAccount {
  platform: SocialPlatform;
  handle: string; // without "@"; Facebook = page path segment
  // Where the campaign itself links this account (campaign site, filing, platform verification).
  // Parody, staff and fan accounts look alike, so unreviewed accounts are not scraped.
  verifiedVia: string;
}

export interface CandidateAccounts {
  contestId: ID;
  candidateId: ID;
  accounts: SocialAccount[];
}

export type Fetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export interface FinderOptions {
  fetchedAt: ISODate; // the run's snapshot date; also the anchor for "3 days ago"
  maxItems: number; // per candidate per platform; identical for everyone (Invariant 9)
  fetch?: Fetch;
}

export interface SocialFinder extends SourceFinder {
  platform: SocialPlatform;
  method: "api" | "snippet";
}

export interface SocialCoverageRow {
  contestId: ID;
  candidateId: ID;
  platform: SocialPlatform;
  status: "scraped" | "no_account" | "not_configured" | "error";
  method?: SocialFinder["method"];
  items: number;
  undated: number;
  error?: string;
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

async function getJson<T>(f: Fetch, url: string, headers?: Record<string, string>): Promise<T> {
  const res = await f(url, headers ? { headers } : undefined);
  if (!res.ok)
    throw new Error(`HTTP ${res.status} for ${url.replace(/api_key=[^&]+/, "api_key=…")}`);
  return (await res.json()) as T;
}

function makeSource(
  target: { contestId: ID; candidateId?: ID },
  platform: SocialPlatform,
  type: SourceType,
  key: string,
  url: string,
  originalText: string,
  eventDate: EventDate,
  fetchedAt: ISODate,
): Source {
  return {
    id: `src-${platform}-${key}-${sha256(JSON.stringify([target.contestId, target.candidateId, originalText])).slice(0, 24)}`,
    contestId: target.contestId,
    ...(target.candidateId ? { candidateId: target.candidateId } : {}),
    type,
    url,
    outlet: platform,
    fetchedAt,
    ...(eventDate.date ? { publishedAt: eventDate.date } : {}),
    eventDate,
    contentHash: sha256(originalText),
    originalText, // exactly as the platform returned it
    text: originalText.replace(/\s+/g, " ").trim(),
  };
}

function requireHandle(vars: Record<string, string>): string {
  const h = vars.handle?.replace(/^@/, "").trim();
  if (!h) throw new Error("vars.handle is required");
  if (!/^[a-z0-9_.-]+$/i.test(h)) throw new Error("Unsupported account handle format");
  return h;
}

// ── Bluesky (public AppView API, no key) ───────────────────────────────────────

interface BskyFeed {
  feed: {
    post: {
      uri: string;
      author: { handle: string };
      record: { text?: string; createdAt?: string };
    };
    reason?: unknown;
  }[];
  cursor?: string;
}

export function blueskyFinder(opts: FinderOptions): SocialFinder {
  const f = opts.fetch ?? fetch;
  return {
    platform: "bluesky",
    method: "api",
    type: "social_post",
    queryTemplates: ["app.bsky.feed.getAuthorFeed actor={handle} filter=posts_and_author_threads"],
    async find(target) {
      const handle = requireHandle(target.vars);
      const out: Source[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 20 && out.length < opts.maxItems; page++) {
        const url =
          `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}` +
          `&limit=100&filter=posts_and_author_threads${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
        const body = await getJson<BskyFeed>(f, url);
        let olderThanWindow = false;
        for (const item of body.feed) {
          // Reposts carry `reason` and someone else's words.
          if (item.reason || item.post.author.handle.toLowerCase() !== handle.toLowerCase())
            continue;
          const text = item.post.record.text;
          if (!text) continue;
          const eventDate = fromTimestamp(item.post.record.createdAt);
          if (eventDate.date && eventDate.date < target.window.since) olderThanWindow = true;
          if (!inWindow(eventDate, target.window)) continue;
          const rkey = item.post.uri.split("/").pop()!;
          const postUrl = `https://bsky.app/profile/${handle}/post/${rkey}`;
          out.push(
            makeSource(
              target,
              "bluesky",
              "social_post",
              rkey,
              postUrl,
              text,
              eventDate,
              opts.fetchedAt,
            ),
          );
        }
        cursor = body.cursor;
        if (!cursor || olderThanWindow) break; // feed is newest-first
      }
      return out.slice(0, opts.maxItems);
    },
  };
}

// ── X (official API v2; paid bearer token) ─────────────────────────────────────

interface XTweets {
  data?: { id: string; text: string; created_at?: string; note_tweet?: { text: string } }[];
  meta?: { next_token?: string };
}

export function xApiFinder(opts: FinderOptions & { bearerToken: string }): SocialFinder {
  const f = opts.fetch ?? fetch;
  const headers = { Authorization: `Bearer ${opts.bearerToken}` };
  return {
    platform: "x",
    method: "api",
    type: "social_post",
    queryTemplates: [
      "GET /2/users/{id}/tweets exclude=retweets start_time={since} end_time={until}",
    ],
    async find(target) {
      const handle = requireHandle(target.vars);
      const user = await getJson<{ data?: { id: string } }>(
        f,
        `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}`,
        headers,
      );
      if (!user.data) return [];
      // The API rejects end_time in the future; when the window is still open, omit it
      // (keeps the request a function of the window and fetchedAt, not the wall clock).
      const end =
        target.window.until < opts.fetchedAt ? `&end_time=${target.window.until}T23:59:59Z` : "";
      const out: Source[] = [];
      let token: string | undefined;
      for (let page = 0; page < 20 && out.length < opts.maxItems; page++) {
        const url =
          `https://api.x.com/2/users/${user.data.id}/tweets?max_results=100&exclude=retweets` +
          `&tweet.fields=created_at,note_tweet&start_time=${target.window.since}T00:00:00Z${end}` +
          (token ? `&pagination_token=${token}` : "");
        const body = await getJson<XTweets>(f, url, headers);
        for (const t of body.data ?? []) {
          const text = t.note_tweet?.text ?? t.text; // long posts are truncated in `text`
          const eventDate = fromTimestamp(t.created_at);
          if (!inWindow(eventDate, target.window)) continue;
          const postUrl = `https://x.com/${handle}/status/${t.id}`;
          out.push(
            makeSource(target, "x", "social_post", t.id, postUrl, text, eventDate, opts.fetchedAt),
          );
        }
        token = body.meta?.next_token;
        if (!token) break;
      }
      return out.slice(0, opts.maxItems);
    },
  };
}

// ── SerpApi snippet fallback (X, Facebook, Instagram, TikTok, Threads) ─────────

type SnippetPlatform = Exclude<SocialPlatform, "youtube" | "bluesky">;

function pathOf(url: string): { host: string; path: string } | null {
  try {
    const u = new URL(url);
    return { host: u.hostname.replace(/^(www|m|mobile)\./, ""), path: u.pathname.toLowerCase() };
  } catch {
    return null;
  }
}

/**
 * Query template per platform plus an ownership check. A result is kept only if its URL
 * (or, for Instagram's handle-less /p/ links, its title) ties it to the reviewed handle.
 */
const SNIPPET_PLATFORMS: Record<
  SnippetPlatform,
  { query: string; owns: (url: string, title: string, h: string) => boolean }
> = {
  x: {
    query: "site:x.com/{handle}/status",
    owns: (url, _t, h) => {
      const p = pathOf(url);
      return (
        !!p &&
        (p.host === "x.com" || p.host === "twitter.com") &&
        p.path.startsWith(`/${h}/status/`)
      );
    },
  },
  facebook: {
    query: "site:facebook.com/{handle}",
    owns: (url, _t, h) => {
      const p = pathOf(url);
      const [first, second] = p?.path.split("/").filter(Boolean) ?? [];
      return (
        p?.host === "facebook.com" &&
        first === h &&
        ["posts", "videos", "photos", "reel"].includes(second ?? "")
      );
    },
  },
  instagram: {
    query: 'site:instagram.com "@{handle}"',
    owns: (url, title, h) => {
      const p = pathOf(url);
      if (p?.host !== "instagram.com") return false;
      if (p.path.startsWith(`/${h}/p/`) || p.path.startsWith(`/${h}/reel/`)) return true;
      return (
        (p.path.startsWith("/p/") || p.path.startsWith("/reel/")) &&
        title
          .toLowerCase()
          .split(/[^a-z0-9_.@]+/)
          .includes(`@${h}`)
      );
    },
  },
  tiktok: {
    query: "site:tiktok.com/@{handle}/video",
    owns: (url, _t, h) => {
      const p = pathOf(url);
      return p?.host === "tiktok.com" && p.path.startsWith(`/@${h}/video/`);
    },
  },
  threads: {
    query: "site:threads.com/@{handle}/post",
    owns: (url, _t, h) => {
      const p = pathOf(url);
      return (
        !!p &&
        (p.host === "threads.com" || p.host === "threads.net") &&
        p.path.startsWith(`/@${h}/post/`)
      );
    },
  },
};

interface SerpGoogle {
  organic_results?: { link: string; title?: string; snippet?: string; date?: string }[];
}

export function serpSnippetFinder(
  platform: SnippetPlatform,
  opts: FinderOptions & { serpApiKey: string },
): SocialFinder {
  const f = opts.fetch ?? fetch;
  const spec = SNIPPET_PLATFORMS[platform];
  return {
    platform,
    method: "snippet",
    type: "social_snippet",
    queryTemplates: [spec.query],
    async find(target) {
      const handle = requireHandle(target.vars);
      const h = handle.toLowerCase();
      const q = spec.query.replaceAll("{handle}", handle);
      const out: Source[] = [];
      const pages = Math.ceil(opts.maxItems / 10);
      for (let page = 0; page < pages; page++) {
        const url =
          `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}` +
          `&tbs=${encodeURIComponent(googleDateRange(target.window))}&start=${page * 10}` +
          `&api_key=${opts.serpApiKey}`;
        const body = await getJson<SerpGoogle>(f, url);
        const results = body.organic_results ?? [];
        for (const r of results) {
          if (!r.snippet || !spec.owns(r.link, r.title ?? "", h)) continue;
          const eventDate = fromSearchDate(r.date, opts.fetchedAt);
          if (!inWindow(eventDate, target.window)) continue;
          const key = `snip-${sha256(r.link).slice(0, 16)}`;
          out.push(
            makeSource(
              target,
              platform,
              "social_snippet",
              key,
              r.link,
              r.snippet,
              eventDate,
              opts.fetchedAt,
            ),
          );
        }
        if (results.length < 10) break;
      }
      return out.slice(0, opts.maxItems);
    },
  };
}

// ── YouTube (SerpApi YouTube engine, filtered to the candidate's channel) ──────

interface SerpYouTube {
  video_results?: {
    link: string;
    title?: string;
    description?: string;
    published_date?: string;
    channel?: { link?: string };
  }[];
}

export function youtubeFinder(opts: FinderOptions & { serpApiKey: string }): SocialFinder {
  const f = opts.fetch ?? fetch;
  return {
    platform: "youtube",
    method: "snippet",
    type: "social_snippet",
    queryTemplates: ["engine=youtube search_query=@{handle}"],
    async find(target) {
      const handle = requireHandle(target.vars);
      const h = handle.toLowerCase();
      const url =
        `https://serpapi.com/search.json?engine=youtube&search_query=${encodeURIComponent(`@${handle}`)}` +
        `&api_key=${opts.serpApiKey}`;
      const body = await getJson<SerpYouTube>(f, url);
      const out: Source[] = [];
      for (const v of body.video_results ?? []) {
        const channelPath = v.channel?.link ? pathOf(v.channel.link) : null;
        const videoPath = pathOf(v.link);
        if (
          channelPath?.host !== "youtube.com" ||
          channelPath.path !== `/@${h}` ||
          !videoPath ||
          !["youtube.com", "youtu.be"].includes(videoPath.host)
        )
          continue;
        // Title + description are the channel's own words; transcripts are a separate source.
        const text = [v.title, v.description].filter(Boolean).join("\n");
        if (!text) continue;
        const eventDate = fromSearchDate(v.published_date, opts.fetchedAt);
        if (!inWindow(eventDate, target.window)) continue;
        const key = `snip-${sha256(v.link).slice(0, 16)}`;
        out.push(
          makeSource(
            target,
            "youtube",
            "social_snippet",
            key,
            v.link,
            text,
            eventDate,
            opts.fetchedAt,
          ),
        );
      }
      return out.slice(0, opts.maxItems);
    },
  };
}

// ── Assembly ───────────────────────────────────────────────────────────────────

/**
 * Best available finder per platform for this run. The choice is global, so every candidate
 * gets the same method on the same platform. Platforms with no key are reported, not skipped.
 */
export function socialFinders(
  env: { SERPAPI_API_KEY?: string; X_BEARER_TOKEN?: string },
  opts: FinderOptions,
): SocialFinder[] {
  const finders: SocialFinder[] = [blueskyFinder(opts)];
  if (env.X_BEARER_TOKEN) finders.push(xApiFinder({ ...opts, bearerToken: env.X_BEARER_TOKEN }));
  if (env.SERPAPI_API_KEY) {
    const serp = { ...opts, serpApiKey: env.SERPAPI_API_KEY };
    if (!env.X_BEARER_TOKEN) finders.push(serpSnippetFinder("x", serp));
    for (const p of ["facebook", "instagram", "tiktok", "threads"] as const)
      finders.push(serpSnippetFinder(p, serp));
    finders.push(youtubeFinder(serp));
  }
  return finders;
}

/**
 * Scrape every candidate on every platform with the same window and finders, and report
 * coverage for each (candidate, platform), including accounts we don't have.
 */
export async function scrapeSocial(
  candidates: CandidateAccounts[],
  window: Window,
  finders: SocialFinder[],
  maxItemsPerPlatform = 100,
): Promise<{ sources: Source[]; report: SocialCoverageRow[] }> {
  if (!Number.isSafeInteger(maxItemsPerPlatform) || maxItemsPerPlatform < 1)
    throw new Error("Invalid platform cap");
  const byPlatform = new Map(finders.map((f) => [f.platform, f]));
  const seenUrls = new Set<string>();
  const sources: Source[] = [];
  const report: SocialCoverageRow[] = [];

  for (const c of candidates) {
    for (const platform of SOCIAL_PLATFORMS) {
      const base = {
        contestId: c.contestId,
        candidateId: c.candidateId,
        platform,
        items: 0,
        undated: 0,
      };
      const accounts = c.accounts
        .filter((a) => a.platform === platform)
        .sort((a, b) => (a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0));
      if (accounts.length === 0) {
        report.push({ ...base, status: "no_account" });
        continue;
      }
      const finder = byPlatform.get(platform);
      if (!finder) {
        report.push({ ...base, status: "not_configured" });
        continue;
      }
      try {
        let items = 0;
        let undated = 0;
        for (const account of accounts) {
          if (items >= maxItemsPerPlatform) break;
          publicWebUrl(account.verifiedVia); // explicit reviewed evidence URL, not a truthy placeholder
          const found = await finder.find({
            contestId: c.contestId,
            candidateId: c.candidateId,
            vars: { handle: account.handle },
            window,
          });
          for (const s of found) {
            if (items >= maxItemsPerPlatform) break;
            const scopedUrl = JSON.stringify([c.contestId, c.candidateId, s.url]);
            if (seenUrls.has(scopedUrl)) continue;
            seenUrls.add(scopedUrl);
            sources.push(s);
            items++;
            if (!s.eventDate.date) undated++;
          }
        }
        report.push({ ...base, status: "scraped", method: finder.method, items, undated });
      } catch {
        report.push({
          ...base,
          status: "error",
          method: finder.method,
          error: "Account verification or fetch failed; inspect frozen responses",
        });
      }
    }
  }

  sources.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { sources, report };
}
