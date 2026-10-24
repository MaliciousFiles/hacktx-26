import { describe, expect, it } from "vitest";
import { fromSearchDate, fromTimestamp, googleDateRange } from "./dates";
import {
  blueskyFinder,
  scrapeSocial,
  serpSnippetFinder,
  socialFinders,
  xApiFinder,
  youtubeFinder,
  type Fetch,
} from "./social";

const window = { since: "2025-11-08", until: "2026-11-03" };
const fetchedAt = "2026-10-24";
const target = {
  contestId: "contest-1",
  candidateId: "cand-a",
  vars: { handle: "fairycandidate" },
  window,
};

/** Routes URLs to canned JSON by substring; records every request. */
function fakeFetch(routes: [string, unknown][]): Fetch & { calls: string[] } {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    const hit = routes.find(([k]) => url.includes(k));
    if (!hit) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(hit[1]), { status: 200 });
  }) as Fetch & { calls: string[] };
  f.calls = calls;
  return f;
}

describe("dates", () => {
  it("parses platform timestamps as published, day precision", () => {
    expect(fromTimestamp("2026-10-03T23:59:00.000Z")).toEqual({
      date: "2026-10-03",
      basis: "published",
      precision: "day",
    });
  });

  it("parses absolute and relative search dates against fetchedAt, not the wall clock", () => {
    expect(fromSearchDate("Oct 3, 2026", fetchedAt)).toEqual({
      date: "2026-10-03",
      basis: "published",
      precision: "day",
    });
    expect(fromSearchDate("3 days ago", fetchedAt)).toEqual({
      date: "2026-10-21",
      basis: "published",
      precision: "day",
    });
    expect(fromSearchDate("2 weeks ago", fetchedAt)).toMatchObject({
      date: "2026-10-10",
      precision: "week",
    });
    expect(fromSearchDate("a month ago", fetchedAt)).toMatchObject({
      date: "2026-09-24",
      precision: "month",
    });
  });

  it("leaves unparseable dates unknown instead of substituting fetchedAt", () => {
    expect(fromSearchDate(undefined, fetchedAt)).toEqual({ basis: "unknown", precision: "day" });
    expect(fromSearchDate("Pinned", fetchedAt).date).toBeUndefined();
    expect(fromTimestamp("garbage").basis).toBe("unknown");
  });

  it("builds a Google custom date range from the window", () => {
    expect(googleDateRange(window)).toBe("cdr:1,cd_min:11/8/2025,cd_max:11/3/2026");
  });
});

describe("blueskyFinder", () => {
  const post = (
    rkey: string,
    text: string,
    createdAt: string,
    handle = "fairycandidate.bsky.social",
  ) => ({
    post: {
      uri: `at://did:plc:abc/app.bsky.feed.post/${rkey}`,
      author: { handle },
      record: { text, createdAt },
    },
  });

  it("keeps own posts in the window, skips reposts and other authors, and stops past the window", async () => {
    const f = fakeFetch([
      [
        "getAuthorFeed",
        {
          feed: [
            post("p1", "We will fix the roads.", "2026-10-20T15:00:00Z"),
            {
              ...post("p2", "Someone else's take", "2026-10-19T15:00:00Z", "other.bsky.social"),
              reason: { $type: "repost" },
            },
            post("p3", "Old campaign", "2024-06-01T15:00:00Z"),
          ],
          cursor: "next",
        },
      ],
    ]);
    const finder = blueskyFinder({ fetchedAt, maxItems: 50, fetch: f });
    const out = await finder.find({ ...target, vars: { handle: "fairycandidate.bsky.social" } });

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "src-bluesky-p1",
      type: "social_post",
      outlet: "bluesky",
      url: "https://bsky.app/profile/fairycandidate.bsky.social/post/p1",
      fetchedAt,
      publishedAt: "2026-10-20",
      eventDate: { date: "2026-10-20", basis: "published", precision: "day" },
      originalText: "We will fix the roads.",
    });
    expect(f.calls).toHaveLength(1); // p3 was older than the window, so no second page
  });
});

describe("xApiFinder", () => {
  it("uses the full text of long posts and omits end_time while the window is open", async () => {
    const f = fakeFetch([
      ["users/by/username", { data: { id: "42" } }],
      [
        "users/42/tweets",
        {
          data: [
            {
              id: "900",
              text: "Truncated…",
              note_tweet: { text: "The whole long post." },
              created_at: "2026-10-01T12:00:00Z",
            },
          ],
          meta: {},
        },
      ],
    ]);
    const out = await xApiFinder({ fetchedAt, maxItems: 50, fetch: f, bearerToken: "t" }).find(
      target,
    );
    expect(out[0]).toMatchObject({
      originalText: "The whole long post.",
      url: "https://x.com/fairycandidate/status/900",
    });
    expect(f.calls[1]).toContain("start_time=2025-11-08T00:00:00Z");
    expect(f.calls[1]).not.toContain("end_time");
    expect(f.calls[1]).toContain("exclude=retweets");
  });
});

describe("serpSnippetFinder", () => {
  it("keeps only results owned by the handle and labels missing dates unknown", async () => {
    const f = fakeFetch([
      [
        "serpapi.com/search.json?engine=google",
        {
          organic_results: [
            {
              link: "https://x.com/FairyCandidate/status/1",
              snippet: "Housing near transit.",
              date: "Oct 3, 2026",
            },
            { link: "https://x.com/fairycandidate/status/2", snippet: "No date on this one." },
            {
              link: "https://x.com/impostor/status/3",
              snippet: "Parody account",
              date: "Oct 4, 2026",
            },
            {
              link: "https://x.com/fairycandidate/status/4",
              snippet: "Too old",
              date: "Jan 5, 2024",
            },
          ],
        },
      ],
    ]);
    const out = await serpSnippetFinder("x", {
      fetchedAt,
      maxItems: 10,
      fetch: f,
      serpApiKey: "k",
    }).find(target);

    expect(out.map((s) => s.originalText)).toEqual([
      "Housing near transit.",
      "No date on this one.",
    ]);
    expect(out[0]!.type).toBe("social_snippet");
    expect(out[1]!.eventDate).toEqual({ basis: "unknown", precision: "day" });
    expect(out[1]!.publishedAt).toBeUndefined();
    expect(decodeURIComponent(f.calls[0]!)).toContain("q=site:x.com/fairycandidate/status");
    expect(decodeURIComponent(f.calls[0]!)).toContain(
      "tbs=cdr:1,cd_min:11/8/2025,cd_max:11/3/2026",
    );
  });

  it("accepts Instagram /p/ links only when the title names the handle", async () => {
    const f = fakeFetch([
      [
        "serpapi.com",
        {
          organic_results: [
            {
              link: "https://www.instagram.com/p/AAA/",
              title: "Candidate (@fairycandidate) on Instagram",
              snippet: "Mine",
              date: "Oct 1, 2026",
            },
            {
              link: "https://www.instagram.com/p/BBB/",
              title: "Somebody on Instagram",
              snippet: "Not mine",
              date: "Oct 1, 2026",
            },
          ],
        },
      ],
    ]);
    const out = await serpSnippetFinder("instagram", {
      fetchedAt,
      maxItems: 10,
      fetch: f,
      serpApiKey: "k",
    }).find(target);
    expect(out.map((s) => s.originalText)).toEqual(["Mine"]);
  });
});

describe("youtubeFinder", () => {
  it("filters to the candidate's channel", async () => {
    const f = fakeFetch([
      [
        "engine=youtube",
        {
          video_results: [
            {
              link: "https://youtube.com/watch?v=1",
              title: "Town hall",
              description: "Full forum",
              published_date: "2 weeks ago",
              channel: { link: "https://www.youtube.com/@FairyCandidate" },
            },
            {
              link: "https://youtube.com/watch?v=2",
              title: "Reaction video",
              channel: { link: "https://www.youtube.com/@someone" },
            },
          ],
        },
      ],
    ]);
    const out = await youtubeFinder({ fetchedAt, maxItems: 10, fetch: f, serpApiKey: "k" }).find(
      target,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      originalText: "Town hall\nFull forum",
      eventDate: { date: "2026-10-10", precision: "week" },
    });
  });
});

describe("scrapeSocial", () => {
  it("reports every (candidate, platform) and gives every candidate the same window", async () => {
    const windows: unknown[] = [];
    const f = fakeFetch([["getAuthorFeed", { feed: [] }]]);
    const finders = socialFinders({}, { fetchedAt, maxItems: 10, fetch: f }).map((finder) => ({
      ...finder,
      find: (t: Parameters<typeof finder.find>[0]) => {
        windows.push(t.window);
        return finder.find(t);
      },
    }));

    const { sources, report } = await scrapeSocial(
      [
        {
          contestId: "c1",
          candidateId: "a",
          accounts: [
            { platform: "bluesky", handle: "a.bsky.social", verifiedVia: "https://a.example/" },
            { platform: "x", handle: "a", verifiedVia: "https://a.example/" },
          ],
        },
        {
          contestId: "c1",
          candidateId: "b",
          accounts: [
            { platform: "bluesky", handle: "b.bsky.social", verifiedVia: "https://b.example/" },
          ],
        },
      ],
      window,
      finders,
    );

    expect(sources).toEqual([]);
    expect(report).toHaveLength(2 * 7);
    expect(report.find((r) => r.candidateId === "a" && r.platform === "x")?.status).toBe(
      "not_configured",
    );
    expect(report.find((r) => r.candidateId === "b" && r.platform === "x")?.status).toBe(
      "no_account",
    );
    expect(report.find((r) => r.candidateId === "b" && r.platform === "bluesky")).toMatchObject({
      status: "scraped",
      method: "api",
    });
    expect(windows).toEqual([window, window]);
  });

  it("records errors per platform instead of failing the run", async () => {
    const f = fakeFetch([]); // everything 404s
    const { report } = await scrapeSocial(
      [
        {
          contestId: "c1",
          candidateId: "a",
          accounts: [{ platform: "bluesky", handle: "a.bsky.social", verifiedVia: "x" }],
        },
      ],
      window,
      socialFinders({}, { fetchedAt, maxItems: 10, fetch: f }),
    );
    expect(report.find((r) => r.platform === "bluesky")).toMatchObject({ status: "error" });
  });
});
