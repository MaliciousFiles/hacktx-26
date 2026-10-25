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
import { fromSearchDate } from "./dates.js";

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
        const query = url.searchParams.get("q")!;
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
          "<p>Alice: “We should build more housing near reliable transit.”</p><p>Bob: “We need a different approach to these priorities.”</p>",
        );
      return html(
        "<p>She said “We should build more housing near reliable transit.”</p>",
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
