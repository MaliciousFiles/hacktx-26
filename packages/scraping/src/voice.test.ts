import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrozenWebClient } from "./snapshot.js";
import {
  collectVoice,
  extractVoicePage,
  quoteLeads,
  voiceQueries,
  type ResearchTarget,
  type VoiceOptions,
} from "./voice.js";
import { fromSearchDate, inWindow } from "./dates.js";
import { extractQuoteLeads } from "./quotes.js";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "ftb-voice-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const fetchedAt = "2026-10-24";
const target: ResearchTarget = {
  contestId: "contest-1",
  searchContext: "Texas House District 1",
  request: {
    candidate: { id: "candidate-a", name: "Alice Example" },
    position: { office: "tx_house", jurisdiction: "us/tx", district: "1" },
    month: 11,
    year: 2026,
  },
};
function options(client: FrozenWebClient): VoiceOptions {
  return {
    client,
    fetchedAt,
    window: { since: "2026-01-01", until: fetchedAt },
    serpApiKey: "secret",
    campaignSites: [
      {
        candidateId: "candidate-a",
        url: "https://campaign.example/",
        verifiedVia: "https://elections.example/candidate-a",
      },
    ],
    newsDomains: ["news.example"],
    questionnaireDomains: ["guide.example"],
    speechDomains: ["forum.example"],
    verifiedDocuments: [],
    resultsPerQuery: 10,
    maxPagesPerChannel: 3,
    maxQuotesPerSource: 5,
  };
}
function client(network: typeof fetch, offline = false) {
  return new FrozenWebClient({
    directory,
    fetchedAt,
    offline,
    intervalMs: 0,
    allowedHosts: [
      "serpapi.com",
      "campaign.example",
      "news.example",
      "guide.example",
      "forum.example",
    ],
    fetch: network,
  });
}
const html = (body: string, head = "") =>
  new Response(
    `<!doctype html><html><head>${head}</head><body><main>${body}</main></body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
const emptySearch = {
  search_information: { organic_results_state: "Fully empty" },
  video_results: [],
};

describe("frozen online transport", () => {
  it("replays identical bytes/metadata offline, hides credentials, and coalesces requests", async () => {
    const network = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('{"hello":"🧚"}', { headers: { "content-type": "application/json" } }),
      );
    const live = client(network);
    const url = "https://serpapi.com/search.json?q=test&api_key=secret";
    const responses = await Promise.all([live.fetch(url), live.fetch(url)]);
    expect(await responses[0]!.text()).toBe('{"hello":"🧚"}');
    expect(network).toHaveBeenCalledTimes(1);
    const replay = client(network, true);
    expect(await (await replay.fetch(url)).text()).toBe('{"hello":"🧚"}');
    expect(replay.snapshots()).toEqual(live.snapshots());
    expect(JSON.stringify(replay.snapshots())).not.toContain("secret");
    const disk = await readFile(join(directory, (await readdir(directory))[0]!), "utf8");
    expect(disk).not.toContain("secret");
    await expect(replay.fetch("https://news.example/missing")).rejects.toThrow(
      "Offline snapshot miss",
    );
    expect(network).toHaveBeenCalledTimes(1);
  });
  it("rejects redirects, unapproved hosts, oversized bodies, and credentials", async () => {
    const network = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: "https://unapproved.example/" } }),
      );
    await expect(client(network).fetch("https://news.example/a")).rejects.toThrow("Redirect");
    await expect(client(network).fetch("https://unapproved.example/a")).rejects.toThrow(
      "not approved",
    );
    await expect(client(network).fetch("https://alice:password@news.example/a")).rejects.toThrow(
      "credential-free",
    );
    const small = new FrozenWebClient({
      directory,
      fetchedAt,
      allowedHosts: ["news.example"],
      intervalMs: 0,
      maxBytes: 2,
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response("too big")),
    });
    await expect(small.fetch("https://news.example/b")).rejects.toThrow("byte budget");
    expect(await readdir(directory)).toEqual([]);
  });
});

describe("deterministic contemporary discovery", () => {
  it("uses identical templates, time windows and caps, with no scandal/stance targeting", async () => {
    const second = {
      ...target,
      request: { ...target.request, candidate: { id: "b", name: "Bob Example" } },
    };
    expect(
      voiceQueries(target, options(client(fetch)).window).map((q) =>
        q.query.replace("Alice Example", "NAME"),
      ),
    ).toEqual(
      voiceQueries(second, options(client(fetch)).window).map((q) =>
        q.query.replace("Bob Example", "NAME"),
      ),
    );
    const network = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const u = new URL(String(input));
      if (u.searchParams.get("engine") !== "youtube") {
        expect(u.searchParams.get("num")).toBe("10");
        expect(u.searchParams.get("tbs")).toContain("10/24/2026");
      }
      return Response.json(emptySearch);
    });
    const config = options(client(network));
    config.campaignSites = [];
    const result = await collectVoice(target, config);
    expect(result.sources).toEqual([]);
    expect(network).toHaveBeenCalledTimes(8);
  });
  it("fetches bounded campaign pages, news and speech while preserving exact quote spans offline", async () => {
    const network = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "serpapi.com") {
        const query = url.searchParams.get("q") ?? "";
        if (url.searchParams.has("tbm"))
          return Response.json({
            news_results: [
              {
                link: "https://news.example/story",
                title: "Interview",
                snippet: "Unverified preview",
                date: "Oct 23, 2026",
              },
              { link: "https://unapproved.example/story", snippet: "Only a lead" },
            ],
          });
        if (query.includes("transcript"))
          return Response.json({
            organic_results: [
              { link: "https://forum.example/transcript", snippet: "Alice and Bob debated" },
            ],
          });
        return Response.json(emptySearch);
      }
      if (url.pathname === "/robots.txt")
        return new Response("User-agent: *\nAllow: /", {
          headers: { "content-type": "text/plain" },
        });
      if (url.hostname === "campaign.example" && url.pathname === "/")
        return html(
          '<h1>My platform</h1><a href="/issues">Issues</a><a href="https://unapproved.example/issues">Bad</a>',
        );
      if (url.hostname === "campaign.example")
        return html(
          '<p>Build more homes &amp; reliable transit.</p><script>fake quote</script><a href="/issues/deeper">not crawled</a>',
        );
      if (url.hostname === "forum.example")
        return html(
          "<p>Alice Example: “We should build more housing near reliable transit.”</p><p>Bob: “We need a different approach to these priorities.”</p>",
        );
      return html(
        "<p>Alice Example said “We should build more housing near reliable transit.”</p>",
        '<meta property="article:published_time" content="2026-10-23T12:00:00Z">',
      );
    });
    const withTranscript = (c: FrozenWebClient) => ({
      ...options(c),
      verifiedDocuments: [
        {
          url: "https://forum.example/transcript",
          type: "debate_speech" as const,
          verifiedVia: "https://forum.example/",
          contestId: "contest-1",
        },
      ],
    });
    const live = client(network);
    const first = await collectVoice(target, withTranscript(live));
    expect(first.sources).toHaveLength(4);
    const news = first.sources.find((s) => s.type === "news")!;
    expect(news.candidateId).toBeUndefined();
    expect(news.eventDate.date).toBe("2026-10-23");
    expect(first.sources.find((s) => s.type === "debate_speech")!.eventDate.basis).toBe("unknown");
    expect(first.sources.find((s) => s.type === "campaign_site")!.eventDate.basis).toBe(
      "page_observed",
    );
    expect(first.provenance).toHaveLength(4);
    expect(first.quotes.length).toBeGreaterThan(0);
    for (const quote of first.quotes) {
      const source = first.sources.find((s) => s.id === quote.sourceId)!;
      expect(source.originalText.slice(quote.quoteSpan.start, quote.quoteSpan.end)).toBe(
        quote.quote,
      );
      expect(quote.requiresAttributionReview).toBe(true);
    }
    expect(network.mock.calls.some(([url]) => String(url).includes("unapproved.example"))).toBe(
      false,
    );
    expect(network.mock.calls.some(([url]) => String(url).includes("/issues/deeper"))).toBe(false);
    const count = network.mock.calls.length;
    expect(await collectVoice(target, withTranscript(client(network, true)))).toEqual(first);
    expect(network).toHaveBeenCalledTimes(count);
  });
  it("fetches reviewed questionnaires directly and treats a single-candidate one as their own words", async () => {
    const network = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "serpapi.com") return Response.json(emptySearch); // search finds nothing
      if (url.pathname === "/robots.txt") return new Response(null, { status: 404 });
      return html(
        "<p>Q: What would you do about housing? A: Legalize more homes near transit.</p>",
      );
    });
    const config = {
      ...options(client(network)),
      campaignSites: [],
      verifiedDocuments: [
        {
          url: "https://guide.example/alice",
          type: "questionnaire" as const,
          verifiedVia: "https://guide.example/",
          candidateId: "candidate-a",
        },
        {
          url: "https://guide.example/bob",
          type: "questionnaire" as const,
          verifiedVia: "https://guide.example/",
          candidateId: "candidate-b",
        },
      ],
    };
    const result = await collectVoice(target, config);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({ type: "questionnaire", candidateId: "candidate-a" });
    expect(network.mock.calls.some(([url]) => String(url).includes("/bob"))).toBe(false);
  });
  it("doesn't assign another candidate's campaign site or trust search matches as identity", async () => {
    const network = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        organic_results: [
          { link: "https://campaign.example/", snippet: "Maybe someone else's campaign" },
        ],
        news_results: [],
      }),
    );
    const config = options(client(network));
    config.campaignSites[0]!.candidateId = "another-candidate";
    const result = await collectVoice(target, config);
    expect(result.sources).toEqual([]);
    expect(result.leads.length).toBeGreaterThan(0);
    expect(network).toHaveBeenCalledTimes(8);
  });
  it("honors robots and records unavailable search explicitly", async () => {
    const network = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) =>
        String(input).includes("robots.txt")
          ? new Response("User-agent: *\nDisallow: /")
          : Response.json({ error: "key=secret" }),
      );
    const result = await collectVoice(target, options(client(network)));
    expect(result.sources).toEqual([]);
    expect(result.coverage.filter((row) => row.status === "error")).toHaveLength(8);
    expect(result.coverage.some((row) => row.status === "blocked")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("doesn't promote a search intent into verified speech or questionnaire content", async () => {
    const network = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "serpapi.com")
        return Response.json(
          url.searchParams.has("tbm")
            ? { news_results: [] }
            : {
                organic_results: [
                  {
                    link: "https://guide.example/generic-voter-guide",
                    snippet: "Not a candidate questionnaire",
                  },
                ],
              },
        );
      if (url.pathname === "/robots.txt") return new Response(null, { status: 404 });
      return html("Generic instructions for registering to vote.");
    });
    const config = options(client(network));
    config.campaignSites = [];
    const result = await collectVoice(target, config);
    expect(result.sources).toEqual([]);
    expect(result.coverage.some((row) => row.status === "needs_review")).toBe(true);
  });
  it("groups exact duplicate reporting without counting repeated URLs as independent evidence", async () => {
    const network = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "serpapi.com")
        return Response.json(
          url.searchParams.has("tbm")
            ? {
                news_results: [
                  { link: "https://news.example/copy-1" },
                  { link: "https://news.example/copy-2" },
                ],
              }
            : emptySearch,
        );
      if (url.pathname === "/robots.txt") return new Response(null, { status: 404 });
      return html("The exact same wire story, with the same paragraphs.");
    });
    const config = options(client(network));
    config.campaignSites = [];
    const result = await collectVoice(target, config);
    expect(result.sources).toHaveLength(2); // keep both provenance chains
    expect(result.duplicateSources).toHaveLength(1); // downstream must not count twice
  });
  it("rejects anti-bot pages even on HTTP 200", () => {
    expect(() =>
      extractVoicePage(
        "<html><head><title>Just a moment...</title></head><body>Enable JavaScript</body></html>",
      ),
    ).toThrow("Anti-bot");
  });
  it("prioritizes dedicated debates/forums and full-recording leads without inventing a transcript", async () => {
    const queries: string[] = [];
    const network = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const u = new URL(String(input));
      queries.push(u.searchParams.get("q") ?? u.searchParams.get("search_query")!);
      if (u.searchParams.get("engine") === "youtube")
        return Response.json({
          video_results: [
            {
              link: "https://www.youtube.com/watch?v=full-forum",
              title: "District 1 full candidate forum",
              description: "Unedited recording",
              published_date: "Oct 12, 2026",
            },
            {
              link: "https://youtu.be/old-debate",
              title: "Old debate",
              published_date: "Oct 12, 2020",
            },
            { link: "https://evil.example/watch", title: "Pretend video" },
          ],
        });
      return Response.json(emptySearch);
    });
    const config = options(client(network));
    config.campaignSites = [];
    const result = await collectVoice(target, config);
    expect(queries.some((q) => q.includes('2026 (debate OR "candidate forum")'))).toBe(true);
    expect(queries.some((q) => q.includes('"candidate forum" OR "town hall"'))).toBe(true);
    expect(queries.some((q) => q.startsWith("Texas House District 1 2026"))).toBe(true);
    expect(result.leads).toEqual([
      expect.objectContaining({
        channel: "debate_video",
        priority: "debate_review",
        medium: "video",
        url: "https://www.youtube.com/watch?v=full-forum",
      }),
    ]);
    expect(result.sources).toEqual([]);
    expect(result.quotes).toEqual([]);
  });
  it("keeps event dates distinct from observation and excludes dated old pages", async () => {
    const network = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) =>
        String(input).includes("robots.txt")
          ? new Response(null, { status: 404 })
          : html("Old pledge", '<meta property="article:published_time" content="2020-01-01">'),
      );
    const config = options(client(network));
    delete config.serpApiKey;
    const result = await collectVoice(target, config);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      publishedAt: "2020-01-01",
      eventDate: { date: fetchedAt, basis: "page_observed" },
    });
    expect(fromSearchDate("Feb 31, 2026", fetchedAt).date).toBeUndefined();
    expect(
      extractVoicePage(
        "<html><body><main><p>one &amp; two</p><script>bad</script></main></body></html>",
      ).text,
    ).toBe("one & two");
    expect(() => quoteLeads({ originalText: "Nothing quoted" } as never, 5)).not.toThrow();
  });
});

const searchBody = (items: Record<string, unknown>[]) => ({ organic_results: items, news_results: items });
const robotsOk = () => new Response("User-agent: *\nAllow: /", { headers: { "content-type": "text/plain" } });
function fastClient(network: typeof fetch, extra: Partial<ConstructorParameters<typeof FrozenWebClient>[0]> = {}) {
  return new FrozenWebClient({
    directory,
    fetchedAt,
    intervalMs: 0,
    retryDelayMs: 1,
    allowedHosts: ["serpapi.com", "campaign.example", "news.example", "guide.example", "forum.example", "blocked.example", "vote411.example", "aliceexample.com"],
    fetch: network,
    ...extra,
  });
}

describe("relative and varied search dates", () => {
  it("parses YouTube compact, streamed and absolute formats without ever filling in fetchedAt", () => {
    expect(fromSearchDate("3w ago", fetchedAt)).toEqual({ date: "2026-10-03", basis: "published", precision: "week" });
    expect(fromSearchDate("Streamed 2 months ago", fetchedAt)).toMatchObject({ date: "2026-08-25", basis: "published", precision: "month" });
    expect(fromSearchDate("Streamed 10d ago", fetchedAt).date).toBe("2026-10-14");
    expect(fromSearchDate("2y ago", fetchedAt)).toMatchObject({ date: "2024-10-24", precision: "year" });
    expect(fromSearchDate("4h ago", fetchedAt)).toMatchObject({ date: fetchedAt, precision: "day" });
    expect(fromSearchDate("Oct 3, 2026", fetchedAt)).toMatchObject({ date: "2026-10-03" });
    expect(fromSearchDate("October 3, 2026", fetchedAt)).toMatchObject({ date: "2026-10-03" });
    expect(fromSearchDate("3 Oct 2026", fetchedAt)).toMatchObject({ date: "2026-10-03" });
    expect(fromSearchDate("Premiered 5 days ago", fetchedAt).date).toBe("2026-10-19");
    for (const bad of ["ad ago", "Live", "yesterday-ish", "Oct 3", "Feb 30, 2026"])
      expect(fromSearchDate(bad, fetchedAt)).toEqual({ basis: "unknown", precision: "day" });
    // relative dates are never day-exact beyond a few days
    expect(fromSearchDate("3w ago", fetchedAt).precision).not.toBe("day");
  });
  it("drops old videos whose parsed date is out of window and keeps undated ones", async () => {
    const network = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const u = new URL(String(input));
      if (u.searchParams.get("engine") === "youtube")
        return Response.json({
          video_results: [
            { link: "https://www.youtube.com/watch?v=new", title: "Candidate forum", published_date: "Streamed 3w ago" },
            { link: "https://www.youtube.com/watch?v=old", title: "Candidate forum 2021", published_date: "2y ago" },
            { link: "https://www.youtube.com/watch?v=none", title: "Candidate forum", published_date: "Live" },
          ],
        });
      return Response.json(emptySearch);
    });
    const config = options(fastClient(network));
    config.campaignSites = [];
    const result = await collectVoice(target, config);
    expect(result.leads.map((l) => l.url)).toEqual([
      "https://www.youtube.com/watch?v=new",
      "https://www.youtube.com/watch?v=none",
    ]);
    expect(result.leads[0]!.eventDate).toMatchObject({ basis: "published", precision: "week" });
    expect(result.leads[1]!.eventDate).toEqual({ basis: "unknown", precision: "day" });
    expect(inWindow(fromSearchDate("2y ago", fetchedAt), config.window)).toBe(false);
  });
});

describe("search robustness", () => {
  it("skips one bad link per result, keeps the channel searched, and records a gap", async () => {
    const network = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const u = new URL(String(input));
      if (u.searchParams.get("engine") === "youtube") return Response.json(emptySearch);
      if (u.hostname !== "serpapi.com")
        return u.pathname === "/robots.txt" ? robotsOk() : html("<p>Alice Example filed.</p>");
      return Response.json(
        searchBody([
          { link: "http://rules.house.gov/bill/1?api_key=secret", title: "bad", snippet: "x" },
          { link: "not a url", title: "worse", snippet: "x" },
          { link: "https://news.example/ok", title: "ok", snippet: "Alice Example" },
        ]),
      );
    });
    const config = options(fastClient(network));
    config.campaignSites = [];
    const result = await collectVoice(target, config);
    expect(result.coverage.filter((r) => r.status === "error")).toEqual([]);
    expect(result.leads.filter((l) => l.url === "https://news.example/ok").length).toBeGreaterThan(0);
    const skipped = result.coverage.filter((r) => /Search result #\d+ skipped/.test(r.reason));
    expect(skipped.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(skipped)).not.toContain("secret");
    expect(result.coverage.find((r) => r.channel === "news" && r.status === "searched")).toBeTruthy();
  });
  it("treats YouTube 'no results' as zero results, not an error, but real provider errors as errors with text", async () => {
    let video = { error: "Youtube hasn't returned any results for this query." } as Record<string, unknown>;
    const network = vi.fn<typeof fetch>().mockImplementation(async (input) =>
      new URL(String(input)).searchParams.get("engine") === "youtube" ? Response.json(video) : Response.json(emptySearch),
    );
    const config = options(fastClient(network));
    config.campaignSites = [];
    const empty = await collectVoice(target, config);
    const row = empty.coverage.find((r) => r.channel === "debate_video")!;
    expect(row.status).toBe("searched");
    expect(row.reason).toMatch(/no results/i);
    video = { error: "Invalid API key secret-token" };
    const failing = options(fastClient(network, { directory: join(directory, "b") }));
    failing.campaignSites = [];
    failing.serpApiKey = "secret-token";
    const bad = await collectVoice(target, failing);
    const errorRow = bad.coverage.find((r) => r.channel === "debate_video")!;
    expect(errorRow.status).toBe("error");
    expect(errorRow.reason).toContain("Invalid API key");
    expect(errorRow.reason).not.toContain("secret-token");
  });
  it("retries network failures with backoff, then records the real error text", async () => {
    let calls = 0;
    const flaky = vi.fn<typeof fetch>().mockImplementation(async () => {
      calls++;
      if (calls < 3) throw new TypeError("fetch failed");
      return Response.json(emptySearch);
    });
    const live = fastClient(flaky);
    const ok = await live.fetch("https://serpapi.com/search.json?q=a&api_key=k");
    expect(ok.ok).toBe(true);
    expect(calls).toBe(3);
    const dead = vi.fn<typeof fetch>().mockRejectedValue(Object.assign(new Error("timed out"), { name: "TimeoutError" }));
    const failing = fastClient(dead, { directory: join(directory, "dead") });
    await expect(failing.fetch("https://news.example/x")).rejects.toThrow(/timeout, 3 attempts/);
    expect(dead).toHaveBeenCalledTimes(3);
    const config = options(failing);
    config.campaignSites = [];
    const result = await collectVoice(target, config);
    const errors = result.coverage.filter((r) => r.status === "error");
    expect(errors).toHaveLength(8);
    for (const row of errors) expect(row.reason).toMatch(/Search query lost: Network request failed \(timeout/);
  });
  it("counts retried SerpAPI attempts against the request budget", async () => {
    const dead = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    const live = fastClient(dead, { serpApi: { keys: ["k"], maxRequests: 2 } });
    await expect(live.fetch("https://serpapi.com/search.json?q=a&api_key=k")).rejects.toThrow();
    expect(dead).toHaveBeenCalledTimes(2);
    expect(live.serpApiStats().live).toBe(2);
  });
});

describe("anti-bot hosts", () => {
  const blockedNetwork = (state: { pages: number }) =>
    vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const u = new URL(String(input));
      if (u.hostname === "serpapi.com")
        return Response.json(
          u.searchParams.get("engine") === "youtube"
            ? emptySearch
            : searchBody([
                { link: "https://blocked.example/a", title: "a", snippet: "Alice Example" },
                { link: "https://blocked.example/b", title: "b", snippet: "Alice Example" },
                { link: "https://blocked.example/c", title: "c", snippet: "Alice Example" },
                { link: "https://news.example/fine", title: "fine", snippet: "Alice Example" },
              ]),
        );
      if (u.hostname === "blocked.example") {
        if (u.pathname !== "/robots.txt") state.pages++;
        return new Response(null, { status: 202 });
      }
      if (u.pathname === "/robots.txt") return robotsOk();
      return html("<p>Alice Example said “We should keep fixing the transit schedule.”</p>");
    });
  it("labels 202/empty-body as blocked, stops fetching the host, and records the gap for every candidate", async () => {
    const state = { pages: 0 };
    const shared = fastClient(blockedNetwork(state));
    const base = options(shared);
    base.campaignSites = [];
    base.newsDomains = ["news.example", "blocked.example"];
    const second = { ...target, request: { ...target.request, candidate: { id: "candidate-b", name: "Bob Example" } } };
    const a = await collectVoice(target, base);
    const b = await collectVoice(second, base);
    const blocked = (r: Awaited<ReturnType<typeof collectVoice>>) => r.coverage.filter((c) => c.status === "blocked");
    expect(blocked(a).length).toBeGreaterThan(0);
    expect(blocked(a)[0]!.reason).toMatch(/Anti-bot response \(HTTP 202\)/);
    expect(blocked(a)[0]!.reason).not.toMatch(/Fetch\/extraction/);
    // Later candidate: same gap rows, no new network use against the blocked host.
    expect(blocked(b).length).toBe(blocked(a).length);
    expect(blocked(b).every((c) => /blocked for this run/.test(c.reason))).toBe(true);
    expect(state.pages).toBe(0); // robots 202 stops before any page request
    // Blocked pages do not consume page budget, so the allowed host is still reached.
    expect(a.sources.some((s) => s.url === "https://news.example/fine")).toBe(true);
    expect(b.sources.some((s) => s.url === "https://news.example/fine")).toBe(true);
    expect(a.coverage.filter((c) => c.status === "error" && c.channel === "page")).toEqual([]);
  });
  it("treats an empty 200 page body as blocked", async () => {
    const network = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const u = new URL(String(input));
      if (u.hostname === "serpapi.com") return Response.json(u.searchParams.get("engine") === "youtube" ? emptySearch : searchBody([{ link: "https://news.example/empty", snippet: "x" }]));
      if (u.pathname === "/robots.txt") return new Response(null, { status: 404 });
      return new Response("", { headers: { "content-type": "text/html" } });
    });
    const config = options(fastClient(network));
    config.campaignSites = [];
    const result = await collectVoice(target, config);
    expect(result.coverage.find((c) => c.status === "blocked")!.reason).toMatch(/Empty response body/);
  });
});

describe("approved host matching", () => {
  it("accepts subdomains and www variants of approved domains, never lookalikes", async () => {
    const network = vi.fn<typeof fetch>().mockImplementation(async () => new Response("ok"));
    const c = fastClient(network, { allowedHosts: ["vote411.example", "news.example"] });
    expect((await c.fetch("https://onyourballot.vote411.example/m/race")).ok).toBe(true);
    expect((await c.fetch("https://www.news.example/a")).ok).toBe(true);
    await expect(c.fetch("https://evilvote411.example/a")).rejects.toThrow("not approved");
    await expect(c.fetch("https://vote411.example.evil.test/a")).rejects.toThrow("not approved");
  });
  it("routes questionnaire results on a subdomain of a configured domain", async () => {
    const network = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const u = new URL(String(input));
      if (u.hostname === "serpapi.com")
        return Response.json(
          u.searchParams.get("engine") === "youtube"
            ? emptySearch
            : searchBody([{ link: "https://onyourballot.vote411.example/m/race-detail.do?id=1", snippet: "x" }]),
        );
      if (u.pathname === "/robots.txt") return new Response(null, { status: 404 });
      return html("<p>League of Women Voters guide.</p>");
    });
    const config = options(fastClient(network));
    config.campaignSites = [];
    config.questionnaireDomains = ["www.vote411.example"];
    config.verifiedDocuments = [{ url: "https://onyourballot.vote411.example/m/race-detail.do?id=1", type: "questionnaire", verifiedVia: "https://vote411.example/", contestId: "contest-1" }];
    const result = await collectVoice(target, config);
    expect(result.sources.map((s) => s.url)).toContain("https://onyourballot.vote411.example/m/race-detail.do?id=1");
  });
});

describe("questionnaire and answer quote leads", () => {
  const src = (originalText: string, extra: Record<string, unknown> = {}) =>
    ({ id: "s1", type: "news", originalText, ...extra }) as never;
  const ctx = { candidateId: "candidate-a", names: ["Alice Example"], rivalNames: ["Bob Rival"] };
  it("extracts Q/A answers as exact substrings when the candidate is named nearby", () => {
    const text = "Alice Example\nQ: What is your top priority?\nA: Fund reliable transit across the whole district.\n\nBob Rival\nQ: What is your top priority?\nA: Cut permitting delays for new homes everywhere.";
    const { leads, rejected } = extractQuoteLeads(src(text), 10, ctx);
    expect(leads.map((l) => l.quote)).toEqual(["Fund reliable transit across the whole district."]);
    expect(rejected).toBe(1);
    for (const lead of leads) expect(text.slice(lead.quoteSpan.start, lead.quoteSpan.end)).toBe(lead.quote);
    expect(leads[0]).toMatchObject({ kind: "qa_answer", attribution: "name_proximity", requiresAttributionReview: true });
  });
  it("reads heading/paragraph answers only on questionnaire pages", () => {
    const text = "Alice Example\nWhat would you do about housing?\nLegalize more homes near frequent transit stops.\n";
    expect(extractQuoteLeads(src(text, { type: "questionnaire" }), 5, ctx).leads.map((l) => l.kind)).toEqual(["heading_answer"]);
    expect(extractQuoteLeads(src(text, { type: "news" }), 5, ctx).leads).toEqual([]);
  });
  it("accepts everything from a verified single-candidate page", () => {
    const text = "What would you do about housing?\nLegalize more homes near frequent transit stops.";
    const out = extractQuoteLeads(src(text, { type: "questionnaire", candidateId: "candidate-a" }), 5, ctx);
    expect(out.leads).toHaveLength(1);
    expect(out.leads[0]!.attribution).toBe("verified_single_candidate");
    expect(out.rejected).toBe(0);
  });
  it("rejects quotes from an article that never names the candidate (wrong-person quotes)", () => {
    const text = "Judge Orlando said “We will keep the county budget flat for another year.” Later Plummer replied “That plan underfunds the courts and the jail entirely.”";
    const out = extractQuoteLeads(src(text), 10, { candidateId: "ellis", names: ["Maggie Ellis"] });
    expect(out.leads).toEqual([]);
    expect(out.rejected).toBe(2);
  });
  it("uses bounded distance and the nearest name, not any mention on the page", () => {
    const filler = " Lorem ipsum dolor sit amet.".repeat(30);
    const quote = "“We should build more housing near reliable transit.”";
    const far = extractQuoteLeads(src(`Example said hello.${filler} ${quote}`), 5, ctx);
    expect(far.leads).toEqual([]);
    const near = extractQuoteLeads(src(`${filler} Alice Example said ${quote}`), 5, ctx);
    expect(near.leads).toHaveLength(1);
    const rival = extractQuoteLeads(src(`Alice Example spoke.${filler.slice(0, 100)} Bob Rival said ${quote}`), 5, ctx);
    expect(rival.leads).toEqual([]);
    // a name inside the quotation is not speaker evidence
    const inside = extractQuoteLeads(src("“Alice Example has never voted for a transit budget in her life.”"), 5, ctx);
    expect(inside.leads).toEqual([]);
  });
  it("reports rejected counts per source through collectVoice", async () => {
    const network = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const u = new URL(String(input));
      if (u.hostname === "serpapi.com") return Response.json(u.searchParams.get("engine") === "youtube" ? emptySearch : searchBody([{ link: "https://news.example/mixed", snippet: "x" }]));
      if (u.pathname === "/robots.txt") return new Response(null, { status: 404 });
      return html("<p>Someone Else said “We will keep the county budget flat for another year.”</p>", '<meta property="article:published_time" content="2026-10-20">');
    });
    const config = options(fastClient(network));
    config.campaignSites = [];
    const result = await collectVoice(target, config);
    expect(result.quotes).toEqual([]);
    expect(result.quoteStats![0]).toMatchObject({ accepted: 0, rejected: 1 });
    expect(result.coverage.find((c) => c.status === "fetched")!.reason).toMatch(/0 kept, 1 rejected/);
  });
});

describe("campaign site coverage and safe discovery", () => {
  it("records an explicit gap when no verified campaign site is configured", async () => {
    const network = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(emptySearch));
    const config = options(fastClient(network));
    config.campaignSites = [];
    const result = await collectVoice(target, config);
    const row = result.coverage.find((c) => c.channel === "campaign" && c.status === "not_configured")!;
    expect(row.reason).toContain("no verified campaign site configured; search-found campaign sites are not auto-trusted");
    expect(row.reason).toContain("0/3");
    const empty = result.coverage.find((c) => c.channel === "news" && /Page budget: 0\/3/.test(c.reason))!;
    expect(empty.reason).toMatch(/coverage gap, not evidence of absence/);
  });
  it("queues a strongly matching apex domain as an unverified lead without promoting it", async () => {
    const network = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const u = new URL(String(input));
      if (u.hostname === "serpapi.com")
        return Response.json(
          u.searchParams.get("engine") === "youtube"
            ? emptySearch
            : searchBody([
                { link: "https://aliceexample.com/", title: "Alice Example for Texas House", snippet: "Alice Example, candidate for State Representative, House District 1" },
                { link: "https://randomsite.com/", title: "Alice Example", snippet: "State Representative" },
                { link: "https://www.facebook.com/aliceexample", title: "Alice Example", snippet: "State Representative" },
                { link: "https://aliceexample.org/blog/post", title: "Alice Example's neighbor", snippet: "A nice garden" },
              ]),
        );
      if (u.pathname === "/robots.txt") return new Response(null, { status: 404 });
      return html("<h1>Alice Example for State Representative</h1><p>Vote for Alice Example, Texas House District 1.</p>");
    });
    const config = options(fastClient(network));
    config.campaignSites = [];
    const result = await collectVoice(target, config);
    expect(result.unverifiedCampaignSiteLeads!).toHaveLength(1);
    expect(result.unverifiedCampaignSiteLeads![0]).toMatchObject({
      status: "unverified_campaign_site_lead",
      candidateId: "candidate-a",
      url: "https://aliceexample.com/",
      checkedText: "page",
    });
    expect(result.sources.some((s) => s.type === "campaign_site")).toBe(false);
    expect(result.sources.every((s) => !s.candidateId)).toBe(true);
    expect(result.coverage.some((c) => c.status === "needs_review" && /unverified_campaign_site_lead/.test(c.reason))).toBe(true);
  });
  it("uses the search snippet when the host is not approved, and drops leads that don't name the office", async () => {
    const network = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const u = new URL(String(input));
      if (u.hostname === "serpapi.com")
        return Response.json(
          u.searchParams.get("engine") === "youtube"
            ? emptySearch
            : searchBody([
                { link: "https://aliceexample.net/", title: "Alice Example", snippet: "Candidate for Texas House District 1" },
                { link: "https://aliceexample.io/", title: "Alice Example", snippet: "Alice Example photography" },
              ]),
        );
      return new Response(null, { status: 404 });
    });
    const config = options(fastClient(network));
    config.campaignSites = [];
    const result = await collectVoice(target, config);
    expect(result.unverifiedCampaignSiteLeads!.map((l) => [l.url, l.checkedText])).toEqual([["https://aliceexample.net/", "search_snippet"]]);
    expect(network.mock.calls.some(([url]) => /aliceexample\.net/.test(String(url)))).toBe(false);
  });
});

describe("application error pages", () => {
  it("rejects app error pages such as a Vote411 stack trace", () => {
    expect(() => extractVoicePage("<html><head><title>Voter Guide Toolkit: Program Error</title></head><body>oops</body></html>")).toThrow("Application error");
  });
});
