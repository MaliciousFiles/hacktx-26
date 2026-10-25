import { load } from "cheerio";
import robotsParser from "robots-parser";
import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";
import type { CandidateResearchRequest, EventDate, Source, SourceType } from "@ftb/types";
import { fromSearchDate, fromTimestamp, googleDateRange, inWindow, type Window } from "./dates.js";
import {
  FrozenWebClient,
  SerpApiUnavailableError,
  describeError,
  hash,
  hostMatches,
  publicWebUrl,
} from "./snapshot.js";
import { extractQuoteLeads, quoteLeads, type QuoteLead } from "./quotes.js";

export { extractQuoteLeads, quoteLeads, type QuoteLead };

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
  /** Other candidates in this contest; sharpens quote speaker attribution (nearest name wins). */
  rivalNames?: string[];
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
  /** Reviewed: this questionnaire page contains only this candidate's answers. */
  candidateId?: string;
  /** Reviewed: a multi-candidate guide/forum for this contest (needs speaker spans). */
  contestId?: string;
}

function documentApplies(doc: VerifiedVoiceDocument, target: ResearchTarget): boolean {
  return doc.candidateId
    ? doc.candidateId === target.request.candidate.id
    : doc.contestId === target.contestId;
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
export interface QuoteStat {
  sourceId: string;
  url: string;
  accepted: number;
  /** Quote/answer spans dropped for lack of speaker evidence (not the candidate's name nearby). */
  rejected: number;
  scanned: number;
}
/** A search-found site that looks like the candidate's own. Human review only: never a Source. */
export interface UnverifiedCampaignSiteLead {
  status: "unverified_campaign_site_lead";
  candidateId: string;
  url: string;
  channel: VoiceChannel;
  title: string;
  checkedText: "page" | "search_snippet";
  hostMatch: string;
  namesCandidate: true;
  namesOffice: true;
  reason: string;
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
  link: z.string(),
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
        link: z.string(),
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
  return domains.some((domain) => hostMatches(host, domain));
}

const EMPTY_RESULTS = /(?:hasn'?t|has not|did not|didn'?t) (?:returned?|any)? ?(?:any )?results|no results/i;

class PageProblem extends Error {
  constructor(
    readonly status: "blocked" | "needs_review",
    message: string,
  ) {
    super(message);
  }
}

/** Short, credential-free label for a search-result link we could not use. */
function linkLabel(link: string): string {
  try {
    const url = new URL(link);
    return `${url.protocol}//${url.host}${url.pathname}`.slice(0, 200);
  } catch {
    return link.split(/[?#]/)[0]!.slice(0, 120);
  }
}

const SOCIAL_OR_AGGREGATOR =
  /(^|\.)(facebook|instagram|x|twitter|tiktok|youtube|youtu|linkedin|reddit|threads|wikipedia|ballotpedia|bsky|medium|substack)\.(com|org|be|app)$/i;

const OFFICE_TERMS: Record<string, RegExp> = {
  us_senate: /\b(u\.?s\.? senat|senate)/i,
  us_house: /\b(congress|u\.?s\.? house|house of representatives)/i,
  governor: /\bgovernor\b/i,
  tx_lt_governor: /\blieutenant governor|lt\.? gov/i,
  tx_ag: /\battorney general\b/i,
  tx_comptroller: /\bcomptroller\b/i,
  tx_land_commissioner: /\bland (office|commissioner)|general land office/i,
  tx_agriculture_commissioner: /\bagriculture\b/i,
  tx_railroad_commissioner: /\brailroad commission/i,
  tx_supreme_court: /\bsupreme court\b/i,
  tx_court_of_criminal_appeals: /\bcriminal appeals\b/i,
  tx_sboe: /\b(state board of education|sboe)\b/i,
  tx_house: /\b(state representative|texas house|house district|hd\s?\d+)/i,
  county_judge: /\bcounty judge\b/i,
  county_treasurer: /\btreasurer\b/i,
  county_clerk: /\bcounty clerk\b/i,
  district_clerk: /\bdistrict clerk\b/i,
  college_trustee: /\b(trustee|austin community college|\bacc\b)/i,
  school_board: /\b(school board|isd|trustee)/i,
  city_council: /\b(city council|council member|councilmember)/i,
};

function officePattern(target: ResearchTarget): RegExp {
  const office = target.request.position.office;
  const known = OFFICE_TERMS[office];
  if (known) return known;
  const words = office
    .replace(/^tx_/, "")
    .split("_")
    .filter((word) => word.length > 2)
    .join("\\s+");
  return new RegExp(`\\b${words || "candidate"}\\b`, "i");
}

/** Letters-only host label without TLD or www, e.g. "zoforaustin" for www.zoforaustin.com. */
function apexLabel(host: string): string | undefined {
  const labels = host.toLowerCase().replace(/^www\./, "").split(".");
  return labels.length === 2 ? labels[0]!.replace(/[^a-z0-9]/g, "") : undefined;
}

function hostNameMatch(label: string, names: string[]): string | undefined {
  for (const name of names) {
    const parts = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z\s-]/g, "")
      .split(/\s+/)
      .filter((part) => part && !["jr", "sr", "ii", "iii", "iv"].includes(part));
    const first = parts[0];
    const last = parts.at(-1);
    if (parts.length > 1 && last && last.length >= 4 && label.includes(last))
      return `host contains surname "${last}"`;
    if (parts.length > 1 && first && first.length >= 2 && new RegExp(`^${first}for[a-z]+$`).test(label))
      return `host is "${first}for…" (first name + "for")`;
  }
  return undefined;
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
  if (
    /program error|internal server error|application error|stack trace/i.test(title) ||
    /\bat (?:java|org|com)\.[\w.$]+\(.*\.java:\d+\)/.test($("body").text())
  ) {
    throw new Error("Application error page is not source text");
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

export async function collectVoice(
  target: ResearchTarget,
  options: VoiceOptions,
): Promise<{
  sources: Source[];
  leads: SearchLead[];
  quotes: QuoteLead[];
  /** Optional so existing collectVoice stand-ins stay assignable; the real collector always sets both. */
  quoteStats?: QuoteStat[];
  unverifiedCampaignSiteLeads?: UnverifiedCampaignSiteLead[];
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
    coverage: VoiceCoverage[] = [],
    quoteStats: QuoteStat[] = [],
    siteLeads: UnverifiedCampaignSiteLead[] = [];
  const quotesBySource = new Map<string, QuoteLead[]>();
  const provenance: { sourceId: string; snapshotId: string; extractorVersion: string }[] = [];
  const candidate = target.request.candidate;
  const candidateNames = [candidate.name, ...(candidate.aliases ?? [])];
  const approvedSites = options.campaignSites.filter(
    (site) => site.candidateId === candidate.id && site.verifiedVia,
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
  // Reviewed questionnaires and debate transcripts are fetched directly, ahead
  // of search results, so they don't depend on a search engine surfacing them.
  const seeded = (type: VerifiedVoiceDocument["type"]) =>
    (options.verifiedDocuments ?? [])
      .filter((doc) => doc.type === type && doc.verifiedVia && documentApplies(doc, target))
      .map((doc) => publicWebUrl(doc.url))
      .sort();
  const queues: Record<VoiceChannel, string[]> = {
    campaign: approvedSites.map((site) => site.url),
    questionnaire: seeded("questionnaire"),
    debate: seeded("debate_speech"),
    contest_debate: [],
    forum: [],
    debate_video: [],
    speech: [],
    news: [],
  };
  const candidateMatch = (text: string): SearchLead["candidateMatch"] =>
    candidateNames.some((name) => text.toLowerCase().includes(name.toLowerCase()))
      ? "name_in_metadata"
      : "unverified";
  const redact = (error: unknown) => describeError(error, [options.serpApiKey]);
  const officeTest = officePattern(target);
  const siteCandidates = new Map<string, SearchLead>();

  /** One search hit. A bad link skips only that hit and leaves a per-result gap. */
  const addLead = (
    channel: VoiceChannel,
    item: { link: string; title: string; snippet: string; date?: string },
    rank: number,
    medium: SearchLead["medium"],
  ) => {
    let clean: string;
    try {
      clean = publicWebUrl(item.link);
      if (medium === "video" && !matchesHost(clean, ["youtube.com", "youtu.be"])) return;
    } catch (error) {
      coverage.push({
        channel,
        url: linkLabel(item.link),
        status: "needs_review",
        reason: `Search result #${rank + 1} skipped (${redact(error)}); the rest of this channel was kept`,
      });
      return;
    }
    const eventDate = fromSearchDate(item.date, options.fetchedAt);
    if (!inWindow(eventDate, options.window)) return;
    const lead: SearchLead = {
      channel,
      url: clean,
      title: item.title,
      snippet: item.snippet,
      eventDate,
      rank,
      priority: (
        medium === "video" ? true : ["debate", "contest_debate", "forum"].includes(channel)
      )
        ? /\b(debate|forum|town hall)\b/i.test(`${item.title} ${item.snippet}`)
          ? "debate_review"
          : "standard"
        : "standard",
      medium,
      candidateMatch: candidateMatch(`${item.title} ${item.snippet}`),
    };
    leads.push(lead);
    if (medium === "page") {
      if (matchesHost(clean, domains[channel])) queues[channel].push(clean);
      const host = new URL(clean).hostname;
      if (!siteCandidates.has(host.replace(/^www\./, ""))) siteCandidates.set(host.replace(/^www\./, ""), lead);
    }
  };

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
        const empty =
          (body.error && EMPTY_RESULTS.test(body.error)) ||
          (!body.error && !body.video_results && body.search_information?.total_results === 0);
        if (body.error && !empty) throw new Error(`Video search provider error: ${body.error}`);
        if (!empty && !body.video_results) throw new Error("Unrecognized video search response");
        for (const [rank, item] of (body.video_results ?? [])
          .slice(0, options.resultsPerQuery)
          .entries())
          addLead(
            channel,
            { link: item.link, title: item.title, snippet: item.description, date: item.published_date },
            rank,
            "video",
          );
        coverage.push({
          channel,
          status: "searched",
          reason: empty
            ? "Video search ran and the provider reported no results (zero results, not an error)"
            : "Dedicated debate/forum video discovery; recordings are priority review leads, not verified transcripts or speaker quotes",
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
      const empty = !!body.error && EMPTY_RESULTS.test(body.error);
      if (body.error && !empty) throw new Error(`Search provider error: ${body.error}`);
      const results = channel === "news" ? body.news_results : body.organic_results;
      if (
        !empty &&
        !results &&
        !body.search_information?.organic_results_state?.includes("Fully empty")
      ) {
        throw new Error("Unrecognized search response; not treated as zero results");
      }
      for (const [rank, item] of (results ?? []).slice(0, options.resultsPerQuery).entries())
        addLead(channel, { link: item.link, title: item.title, snippet: item.snippet, date: item.date }, rank, "page");
      coverage.push({
        channel,
        status: "searched",
        reason: empty
          ? "Search ran and the provider reported no results (zero results, not an error)"
          : "Fixed query processed; results are discovery leads, not verified identity or quotes",
      });
    } catch (error) {
      if (error instanceof SerpApiUnavailableError) {
        coverage.push({
          channel,
          status: "error",
          reason: `SerpAPI unavailable (${error.reason}): ${error.message}. Coverage gap, not zero results; rerun to fill from cache plus new searches`,
        });
        continue;
      }
      coverage.push({
        channel,
        status: "error",
        reason: `Search query lost: ${redact(error)}. Coverage gap, not zero results; rerun to fill from cache`,
      });
    }
  }

  /** Robots-checked, WAF-aware read of one page. Throws PageProblem for gaps with a clear cause. */
  const readPage = async (url: string): Promise<ReturnType<typeof extractVoicePage>> => {
    const host = new URL(url).hostname;
    const block = (why: string): never => {
      options.client.noteBlocked(host, why);
      throw new PageProblem(
        "blocked",
        `${why}. No bypass attempted; this is a coverage gap, not evidence the candidate said nothing`,
      );
    };
    const tripped = options.client.blockedHost(host);
    if (tripped)
      throw new PageProblem(
        "blocked",
        `Skipped: ${host} is blocked for this run (${tripped}); not fetched again. Gap recorded for every candidate whose pages are on this host`,
      );
    const robotsUrl = new URL("/robots.txt", url).href;
    const robots = await options.client.fetch(robotsUrl);
    if (robots.status === 202 || robots.status === 429)
      block(`Anti-bot response (HTTP ${robots.status}) from ${host} on robots.txt`);
    const robotsText = robots.ok ? await robots.text() : "";
    const policy = robotsParser(robotsUrl, robotsText);
    const crawlDelay = policy.getCrawlDelay("FairyTaleBallot") ?? 0;
    if (robots.status === 403) block(`Anti-bot or access-denied response (HTTP 403) from ${host} on robots.txt`);
    if (
      robots.status !== 404 &&
      (!robots.ok ||
        /<html\b|<!doctype/i.test(robotsText) ||
        policy.isAllowed(url, "FairyTaleBallot") === false ||
        crawlDelay > 30)
    ) {
      throw new PageProblem(
        "blocked",
        robots.ok
          ? "Publisher robots policy disallows access"
          : `Publisher robots policy could not be checked (HTTP ${robots.status})`,
      );
    }
    // Offline/cache replays need no publisher delay; otherwise honor it.
    if (crawlDelay > 0 && !options.client.isOffline) await delay(crawlDelay * 1000);
    const response = await options.client.fetch(url);
    if (response.status === 202)
      block(`Anti-bot challenge (HTTP 202, empty body) from ${host}`);
    if (response.status === 403 || response.status === 429)
      block(`Anti-bot or rate-limit response (HTTP ${response.status}) from ${host}`);
    if (!response.ok) throw new Error(`Page HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0) block(`Empty response body from ${host} (anti-bot suspected)`);
    if (!response.headers.get("content-type")?.includes("text/html"))
      throw new Error(
        `Only HTML pages supported in this adapter (got ${response.headers.get("content-type") || "unknown type"}); transcripts/PDFs need explicit adapters`,
      );
    try {
      return extractVoicePage(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch (error) {
      if (error instanceof Error && /Anti-bot/.test(error.message))
        block(`Anti-bot challenge page served by ${host}`);
      throw error;
    }
  };

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
        const page = await readPage(url);
        // A currently served campaign platform remains relevant even if the CMS
        // says it was first published years ago. Observation is NOT a speech date.
        if (channel !== "campaign" && !inWindow(page.date, options.window)) {
          coverage.push({
            channel: "page",
            url,
            status: "outside_window",
            reason: "Page publication date is outside the frozen window",
          });
          continue;
        }
        const verifiedDocument = options.verifiedDocuments?.find(
          (item) =>
            publicWebUrl(item.url) === url && item.verifiedVia && documentApplies(item, target),
        );
        const ownQuestionnaire =
          verifiedDocument?.type === "questionnaire" &&
          verifiedDocument.candidateId === candidate.id;
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
        const eventDate: EventDate =
          channel === "campaign"
            ? { date: options.fetchedAt, basis: "page_observed", precision: "day" }
            : page.date.date
              ? page.date
              : { basis: "unknown", precision: "day" };
        const contentHash = hash(page.text);
        const source: Source = {
          id: `src-voice-${hash(JSON.stringify([target.contestId, candidate.id, url, contentHash, VOICE_VERSION]))}`,
          contestId: target.contestId,
          // Multi-speaker news/forums/guides require reviewed attribution spans upstream.
          ...(channel === "campaign" || ownQuestionnaire ? { candidateId: candidate.id } : {}),
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
        const extraction = extractQuoteLeads(source, options.maxQuotesPerSource, {
          candidateId: candidate.id,
          names: candidateNames,
          ...(target.rivalNames ? { rivalNames: target.rivalNames } : {}),
        });
        quotesBySource.set(source.id, extraction.leads);
        quoteStats.push({
          sourceId: source.id,
          url,
          accepted: extraction.leads.length,
          rejected: extraction.rejected,
          scanned: extraction.scanned,
        });
        coverage.push({
          channel: "page",
          url,
          status: "fetched",
          reason: `Extracted bounded HTML snapshot; identity/speaker review still required for third-party sources. Quote leads: ${extraction.leads.length} kept, ${extraction.rejected} rejected for no speaker evidence (candidate name not nearby)`,
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
                /issues|platform|priorit(?:y|ies)|polic(?:y|ies)|vision/i.test(
                  new URL(link).pathname,
                ) &&
                !queues.campaign.includes(link)
              )
                queues.campaign.push(link);
            } catch {
              /* non-web link */
            }
          }
        }
      } catch (error) {
        if (error instanceof PageProblem) {
          // A blocked page says nothing about the candidate, so it must not eat the
          // page budget (otherwise candidates processed later would silently get more or less).
          if (error.status === "blocked") fetched--;
          coverage.push({ channel: "page", url, status: error.status, reason: error.message });
        } else
          coverage.push({
            channel: "page",
            url,
            status: "error",
            reason: `Fetch/extraction failed: ${redact(error)}. No login, paywall, redirect, or anti-bot bypass attempted`,
          });
      }
    }
    if (channel === "campaign" && approvedSites.length === 0) {
      coverage.push({
        channel,
        status: "not_configured",
        reason: `no verified campaign site configured; search-found campaign sites are not auto-trusted. Page budget: 0/${options.maxPagesPerChannel}`,
      });
    } else if (fetched === 0) {
      coverage.push({
        channel,
        status: "searched",
        reason: `Page budget: 0/${options.maxPagesPerChannel}; no result on an approved host or reviewed document was available for this channel (coverage gap, not evidence of absence)`,
      });
    } else {
      coverage.push({
        channel,
        status: "searched",
        reason: `Page budget: ${fetched}/${options.maxPagesPerChannel}; coverage is bounded, not exhaustive`,
      });
    }
  }

  // Safe discovery: possible own-campaign sites become review leads only. They are never
  // fetched as campaign_site, never given a candidateId, and never auto-promoted.
  if (approvedSites.length === 0) {
    const known = [
      ...options.newsDomains,
      ...options.questionnaireDomains,
      ...options.speechDomains,
    ];
    for (const [host, lead] of [...siteCandidates.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const label = apexLabel(host);
      if (!label || SOCIAL_OR_AGGREGATOR.test(host) || /\.(gov|edu|mil)$/i.test(host)) continue;
      if (known.some((domain) => hostMatches(host, domain))) continue;
      const hostMatchReason = hostNameMatch(label, candidateNames);
      if (!hostMatchReason) continue;
      let text = `${lead.title}\n${lead.snippet}`;
      let checkedText: UnverifiedCampaignSiteLead["checkedText"] = "search_snippet";
      if (options.client.isHostAllowed(host) && !options.client.blockedHost(host)) {
        try {
          const page = await readPage(lead.url);
          text = `${page.title}\n${page.text}`;
          checkedText = "page";
        } catch {
          /* fall back to the search result's own text */
        }
      }
      if (!candidateMatch(text).startsWith("name") || !officeTest.test(text)) continue;
      siteLeads.push({
        status: "unverified_campaign_site_lead",
        candidateId: candidate.id,
        url: lead.url,
        channel: lead.channel,
        title: lead.title,
        checkedText,
        hostMatch: hostMatchReason,
        namesCandidate: true,
        namesOffice: true,
        reason:
          "Search-found apex domain matches the candidate name and its text names the candidate and office. Needs human review and a verifiedVia link before it can be pinned; not trusted, not collected as a campaign Source",
      });
      coverage.push({
        channel: lead.channel,
        url: lead.url,
        status: "needs_review",
        reason:
          "unverified_campaign_site_lead: possible official campaign site found by search; queued for human review, not verified and not collected",
      });
    }
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
    quotes: sources.flatMap((source) => quotesBySource.get(source.id) ?? []),
    quoteStats,
    unverifiedCampaignSiteLeads: siteLeads,
    coverage,
    provenance,
    duplicateSources,
  };
}
