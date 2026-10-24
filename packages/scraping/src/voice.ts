import { load } from "cheerio";
import robotsParser from "robots-parser";
import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";
import type { CandidateResearchRequest, EventDate, Source, SourceType } from "@ftb/types";
import { fromSearchDate, fromTimestamp, googleDateRange, inWindow, type Window } from "./dates.js";
import { FrozenWebClient, hash, publicWebUrl } from "./snapshot.js";

export const VOICE_VERSION = "voice-v1";
export const SEARCH_TEMPLATES = {
  campaign: "{identity} campaign platform issues priorities",
  questionnaire: "{identity} candidate questionnaire voter guide",
  debate: '{identity} {year} (debate OR "candidate forum") (video OR transcript OR recording)',
  contest_debate:
    '{contest} {year} (debate OR "candidate forum") (video OR transcript OR recording)',
  forum: '{identity} {year} ("candidate forum" OR "town hall") (recording OR transcript)',
  debate_video: "{identity} {year} debate forum",
  speech: "{identity} debate forum speech transcript",
  news: "{identity}",
} as const;
export type VoiceChannel = keyof typeof SEARCH_TEMPLATES;
export interface ResearchTarget {
  contestId: string;
  request: CandidateResearchRequest;
  searchContext?: string; // human-readable office/place, e.g. "Texas House District 54"
}
export interface CampaignSite {
  candidateId: string;
  url: string;
  verifiedVia: string; // reviewed identity mapping; a search match alone isn't verification
}
export interface VerifiedVoiceDocument {
  url: string;
  type: "questionnaire" | "debate_speech";
  verifiedVia: string; // reviewed document kind, not just query intent
}
export interface SearchLead {
  channel: VoiceChannel;
  url: string;
  title: string;
  snippet: string;
  eventDate: EventDate;
  rank: number;
  priority: "debate_review" | "standard";
  medium: "page" | "video";
  candidateMatch: "name_in_metadata" | "unverified"; // retrieval hint, NEVER speaker proof
}
export interface QuoteLead {
  sourceId: string;
  quote: string;
  quoteSpan: { start: number; end: number };
  requiresAttributionReview: true;
}
export interface VoiceCoverage {
  channel: VoiceChannel | "page";
  url?: string;
  status:
    | "searched"
    | "fetched"
    | "blocked"
    | "not_configured"
    | "error"
    | "outside_window"
    | "needs_review";
  reason: string;
}
export interface VoiceOptions {
  client: FrozenWebClient;
  fetchedAt: string;
  window: Window;
  serpApiKey?: string;
  campaignSites: CampaignSite[];
  verifiedDocuments?: VerifiedVoiceDocument[];
  newsDomains: string[];
  questionnaireDomains: string[];
  speechDomains: string[];
  resultsPerQuery: number; // same caps/config for every candidate
  maxPagesPerChannel: number;
  maxQuotesPerSource: number;
}

const resultSchema = z.object({
  link: z.string().url(),
  title: z.string().default(""),
  snippet: z.string().default(""),
  date: z.string().optional(),
});
const searchSchema = z.object({
  error: z.string().optional(),
  organic_results: z.array(resultSchema).optional(),
  news_results: z.array(resultSchema).optional(),
  search_information: z
    .object({ organic_results_state: z.string().optional() })
    .passthrough()
    .optional(),
});
const videoSearchSchema = z.object({
  error: z.string().optional(),
  video_results: z
    .array(
      z.object({
        link: z.string().url(),
        title: z.string().default(""),
        description: z.string().default(""),
        published_date: z.string().optional(),
      }),
    )
    .optional(),
  search_information: z.object({ total_results: z.number().optional() }).passthrough().optional(),
});

function matchesHost(url: string, domains: string[]): boolean {
  const host = new URL(url).hostname;
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** Fixed queries don't optimize for scandal or a preferred stance. Search text
 * is a discovery lead only; it never becomes a full-page Source or own speech. */
export function voiceQueries(
  target: ResearchTarget,
  window: Window,
): { channel: VoiceChannel; query: string }[] {
  const quote = (text: string) => `"${text.replace(/["\\\r\n]/g, " ")}"`;
  const { candidate, position } = target.request;
  const context =
    target.searchContext ??
    `${position.office.replaceAll("_", " ")} ${position.jurisdiction.replaceAll("/", " ")}${position.district ? ` district ${position.district}` : ""}`;
  const identity = `${quote(candidate.name)} ${context.replace(/["\\\r\n]/g, " ")}`;
  return (Object.keys(SEARCH_TEMPLATES) as VoiceChannel[]).map((channel) => ({
    channel,
    query: SEARCH_TEMPLATES[channel]
      .replace("{identity}", identity)
      .replace("{contest}", context.replace(/["\\\r\n]/g, " "))
      .replace("{year}", String(target.request.year)),
  }));
}

function textDate(value: string | undefined): EventDate {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value))
    return { basis: "unknown", precision: "day" };
  const result = fromTimestamp(value);
  return result.date === value.slice(0, 10) ? result : { basis: "unknown", precision: "day" };
}

/** Versioned deterministic HTML -> immutable extracted text. Raw HTML stays in
 * the byte snapshot; quotes use offsets into this exact extracted artifact.
 * No JS execution, paywall removal, speaker guessing, or timestamp invention. */
export function extractVoicePage(html: string): {
  text: string;
  title: string;
  date: EventDate;
  links: string[];
} {
  const $ = load(html);
  const title = $("title").first().text().trim();
  if (
    /^(just a moment|access denied|attention required|robot check)/i.test(title) ||
    $("#challenge-form,#cf-challenge-running").length
  ) {
    throw new Error("Anti-bot challenge is not source text");
  }
  const date = textDate(
    $('meta[property="article:published_time"],meta[name="date"],meta[itemprop="datePublished"]')
      .first()
      .attr("content"),
  );
  const links = $("a[href]")
    .map((_, node) => $(node).attr("href")!)
    .get();
  $("script,style,noscript,nav,header,footer,form,[hidden],[aria-hidden='true']").remove();
  const root = $("main").first().length
    ? $("main").first()
    : $("article").first().length
      ? $("article").first()
      : $("body");
  root.find("br").replaceWith("\n");
  root.find("p,div,li,h1,h2,h3,h4,h5,h6,blockquote,section,tr").append("\n");
  const text = root
    .text()
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) throw new Error("Page has no extractable text; no browser or login bypass attempted");
  return { text, title, date, links };
}

/** Candidates for review, NOT notable-quote judgments or approved attribution.
 * Exact UTF-16 offsets, including punctuation; never join separate fragments. */
export function quoteLeads(source: Source, cap: number): QuoteLead[] {
  const out: QuoteLead[] = [];
  for (const match of source.originalText.matchAll(/“[^“”\n]{30,1000}”|"[^"\n]{30,1000}"/g)) {
    if (out.length >= cap) break;
    out.push({
      sourceId: source.id,
      quote: match[0],
      quoteSpan: { start: match.index, end: match.index + match[0].length },
      requiresAttributionReview: true,
    });
  }
  return out;
}

export async function collectVoice(
  target: ResearchTarget,
  options: VoiceOptions,
): Promise<{
  sources: Source[];
  leads: SearchLead[];
  quotes: QuoteLead[];
  coverage: VoiceCoverage[];
  provenance: { sourceId: string; snapshotId: string; extractorVersion: string }[];
  duplicateSources: {
    sourceId: string;
    duplicateOf: string;
    reason: "identical_normalized_text";
  }[];
}> {
  for (const [key, cap] of Object.entries({
    resultsPerQuery: options.resultsPerQuery,
    maxPagesPerChannel: options.maxPagesPerChannel,
    maxQuotesPerSource: options.maxQuotesPerSource,
  })) {
    if (!Number.isSafeInteger(cap) || cap < 1 || cap > 100) throw new Error(`Invalid ${key}`);
  }
  if (options.window.since > options.window.until || options.window.until > options.fetchedAt) {
    throw new Error("Research window must end by the frozen fetchedAt date");
  }
  const sources: Source[] = [],
    leads: SearchLead[] = [],
    coverage: VoiceCoverage[] = [];
  const provenance: { sourceId: string; snapshotId: string; extractorVersion: string }[] = [];
  const approvedSites = options.campaignSites.filter(
    (site) => site.candidateId === target.request.candidate.id && site.verifiedVia,
  );
  const campaignDomains = approvedSites.map((site) => new URL(site.url).hostname);
  const domains: Record<VoiceChannel, string[]> = {
    campaign: campaignDomains,
    questionnaire: options.questionnaireDomains,
    speech: options.speechDomains,
    debate: options.speechDomains,
    contest_debate: options.speechDomains,
    forum: options.speechDomains,
    debate_video: [],
    news: options.newsDomains,
  };
  const queues: Record<VoiceChannel, string[]> = {
    campaign: approvedSites.map((site) => site.url),
    questionnaire: [],
    debate: [],
    contest_debate: [],
    forum: [],
    debate_video: [],
    speech: [],
    news: [],
  };
  const candidateMatch = (text: string): SearchLead["candidateMatch"] =>
    text.toLowerCase().includes(target.request.candidate.name.toLowerCase())
      ? "name_in_metadata"
      : "unverified";
  for (const { channel, query } of voiceQueries(target, options.window)) {
    if (!options.serpApiKey) {
      coverage.push({
        channel,
        status: "not_configured",
        reason: "No SerpApi key; verified campaign seeds can still be fetched",
      });
      continue;
    }
    try {
      const url = new URL("https://serpapi.com/search.json");
      if (channel === "debate_video") {
        for (const [key, value] of Object.entries({
          engine: "youtube",
          search_query: query,
          api_key: options.serpApiKey,
        }))
          url.searchParams.set(key, value);
        const response = await options.client.fetch(url.href);
        if (!response.ok) throw new Error(`Video search HTTP ${response.status}`);
        const body = videoSearchSchema.parse(await response.json());
        if (body.error || (!body.video_results && body.search_information?.total_results !== 0))
          throw new Error("Invalid video search response");
        for (const [rank, item] of (body.video_results ?? [])
          .slice(0, options.resultsPerQuery)
          .entries()) {
          const clean = publicWebUrl(item.link);
          if (!matchesHost(clean, ["youtube.com", "youtu.be"])) continue;
          const eventDate = fromSearchDate(item.published_date, options.fetchedAt);
          if (!inWindow(eventDate, options.window)) continue;
          leads.push({
            channel,
            url: clean,
            title: item.title,
            snippet: item.description,
            eventDate,
            rank,
            priority: /\b(debate|forum|town hall)\b/i.test(`${item.title} ${item.description}`)
              ? "debate_review"
              : "standard",
            medium: "video",
            candidateMatch: candidateMatch(`${item.title} ${item.description}`),
          });
        }
        coverage.push({
          channel,
          status: "searched",
          reason:
            "Dedicated debate/forum video discovery; recordings are priority review leads, not verified transcripts or speaker quotes",
        });
        continue;
      }
      for (const [key, value] of Object.entries({
        engine: "google",
        q: query,
        tbs: googleDateRange(options.window),
        num: String(options.resultsPerQuery),
        hl: "en",
        gl: "us",
        api_key: options.serpApiKey,
        ...(channel === "news" ? { tbm: "nws" } : {}),
      }))
        url.searchParams.set(key, value);
      const response = await options.client.fetch(url.href);
      if (!response.ok) throw new Error(`Search HTTP ${response.status}`);
      const body = searchSchema.parse(await response.json());
      if (body.error) throw new Error("Search provider returned an error");
      const results = channel === "news" ? body.news_results : body.organic_results;
      if (!results && !body.search_information?.organic_results_state?.includes("Fully empty")) {
        throw new Error("Unrecognized search response; not treated as zero results");
      }
      for (const [rank, item] of (results ?? []).slice(0, options.resultsPerQuery).entries()) {
        const clean = publicWebUrl(item.link);
        const eventDate = fromSearchDate(item.date, options.fetchedAt);
        if (!inWindow(eventDate, options.window)) continue;
        leads.push({
          channel,
          url: clean,
          title: item.title,
          snippet: item.snippet,
          eventDate,
          rank,
          priority:
            ["debate", "contest_debate", "forum"].includes(channel) &&
            /\b(debate|forum|town hall)\b/i.test(`${item.title} ${item.snippet}`)
              ? "debate_review"
              : "standard",
          medium: "page",
          candidateMatch: candidateMatch(`${item.title} ${item.snippet}`),
        });
        if (matchesHost(clean, domains[channel])) queues[channel].push(clean);
      }
      coverage.push({
        channel,
        status: "searched",
        reason:
          "Fixed query processed; results are discovery leads, not verified identity or quotes",
      });
    } catch {
      coverage.push({
        channel,
        status: "error",
        reason:
          "Search failed or returned invalid data; inspect frozen response (no credential-bearing diagnostics)",
      });
    }
  }

  const seen = new Set<string>();
  for (const channel of Object.keys(queues) as VoiceChannel[]) {
    // Rank then URL for search; verified seeds first. Caps never silently imply complete coverage.
    let fetched = 0;
    for (let i = 0; i < queues[channel].length && fetched < options.maxPagesPerChannel; i++) {
      const url = publicWebUrl(queues[channel][i]!);
      if (seen.has(url)) continue;
      seen.add(url);
      fetched++;
      try {
        const robotsUrl = new URL("/robots.txt", url).href;
        const robots = await options.client.fetch(robotsUrl);
        const robotsText = robots.ok ? await robots.text() : "";
        const policy = robotsParser(robotsUrl, robotsText);
        const crawlDelay = policy.getCrawlDelay("FairyTaleBallot") ?? 0;
        if (
          robots.status !== 404 &&
          (!robots.ok ||
            /<html\b|<!doctype/i.test(robotsText) ||
            policy.isAllowed(url, "FairyTaleBallot") === false ||
            crawlDelay > 30)
        ) {
          coverage.push({
            channel: "page",
            url,
            status: "blocked",
            reason: "Publisher robots policy disallows access or could not be checked",
          });
          continue;
        }
        // Offline/cache replays need no publisher delay; otherwise honor it.
        if (crawlDelay > 0 && !options.client.isOffline) await delay(crawlDelay * 1000);
        const response = await options.client.fetch(url);
        if (!response.ok) throw new Error(`Page HTTP ${response.status}`);
        if (!response.headers.get("content-type")?.includes("text/html"))
          throw new Error(
            "Only HTML pages supported in this adapter; transcripts/PDFs need explicit adapters",
          );
        const page = extractVoicePage(
          new TextDecoder("utf-8", { fatal: true }).decode(await response.arrayBuffer()),
        );
        if (!inWindow(page.date, options.window)) {
          coverage.push({
            channel: "page",
            url,
            status: "outside_window",
            reason: "Page publication date is outside the frozen window",
          });
          continue;
        }
        const verifiedDocument = options.verifiedDocuments?.find(
          (item) => publicWebUrl(item.url) === url && item.verifiedVia,
        );
        // A query mentioning "questionnaire" or "speech" doesn't prove the
        // result is one. General reporting remains news, not candidate speech.
        const type: SourceType | undefined =
          channel === "campaign"
            ? "campaign_site"
            : (verifiedDocument?.type ??
              (matchesHost(url, options.newsDomains) ? "news" : undefined));
        if (!type) {
          coverage.push({
            channel: "page",
            url,
            status: "needs_review",
            reason:
              "Frozen page needs reviewed document-kind mapping before becoming a questionnaire or transcript Source",
          });
          continue;
        }
        const eventDate: EventDate = page.date.date
          ? page.date
          : channel === "campaign"
            ? { date: options.fetchedAt, basis: "page_observed", precision: "day" }
            : { basis: "unknown", precision: "day" };
        const contentHash = hash(page.text);
        const source: Source = {
          id: `src-voice-${hash(JSON.stringify([target.contestId, target.request.candidate.id, url, contentHash, VOICE_VERSION]))}`,
          contestId: target.contestId,
          // Multi-speaker news/forums/questionnaires require reviewed attribution spans upstream.
          ...(channel === "campaign" ? { candidateId: target.request.candidate.id } : {}),
          type,
          url,
          outlet: new URL(url).hostname,
          fetchedAt: options.fetchedAt,
          ...(page.date.date ? { publishedAt: page.date.date } : {}),
          eventDate,
          contentHash,
          originalText: page.text,
          text: page.text.replace(/\s+/g, " ").trim(),
        };
        const snapshot = options.client.snapshots().find((item) => item.url === url);
        if (!snapshot) throw new Error("Missing page snapshot");
        sources.push(source);
        provenance.push({
          sourceId: source.id,
          snapshotId: snapshot.id,
          extractorVersion: VOICE_VERSION,
        });
        coverage.push({
          channel: "page",
          url,
          status: "fetched",
          reason:
            "Extracted bounded HTML snapshot; identity/speaker review still required for third-party sources",
        });
        if (
          channel === "campaign" &&
          approvedSites.some((site) => publicWebUrl(site.url) === url)
        ) {
          // Only one hop from a reviewed campaign origin; never general web crawling.
          for (const href of [...new Set(page.links)].sort()) {
            try {
              const link = publicWebUrl(new URL(href, url).href);
              if (
                new URL(link).origin === new URL(url).origin &&
                /issues|platform|priorities|policies|vision/i.test(new URL(link).pathname) &&
                !queues.campaign.includes(link)
              )
                queues.campaign.push(link);
            } catch {
              /* non-web link */
            }
          }
        }
      } catch {
        coverage.push({
          channel: "page",
          url,
          status: "error",
          reason:
            "Fetch/extraction unavailable; no login, paywall, redirect, or anti-bot bypass attempted",
        });
      }
    }
    coverage.push({
      channel,
      status: "searched",
      reason: `Page budget: ${fetched}/${options.maxPagesPerChannel}; coverage is bounded, not exhaustive`,
    });
  }
  sources.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const firstByText = new Map<string, string>();
  const duplicateSources: {
    sourceId: string;
    duplicateOf: string;
    reason: "identical_normalized_text";
  }[] = [];
  for (const source of sources) {
    const fingerprint = hash(source.text);
    const first = firstByText.get(fingerprint);
    if (first)
      duplicateSources.push({
        sourceId: source.id,
        duplicateOf: first,
        reason: "identical_normalized_text",
      });
    else firstByText.set(fingerprint, source.id);
  }
  return {
    sources,
    leads,
    quotes: sources.flatMap((source) => quoteLeads(source, options.maxQuotesPerSource)),
    coverage,
    provenance,
    duplicateSources,
  };
}
