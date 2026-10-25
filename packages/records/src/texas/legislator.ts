import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { AdapterContext, AdapterResult, RecordsAdapter } from "../adapters";
import { collectionConfig } from "../adapters";
import { candidateNames, isContested } from "../model";
import { tloBillHistoryAdapter } from "./adapter";
import { txHouseJournalAdapter, txSenateJournalAdapter } from "./journals";
import { chamberInLegislature, lrlProfileUrl, lrlSearchUrl, parseLrlProfile, parseLrlSearch } from "./lrl";
import type { LrlProfile } from "./lrl";
import { parseTloReport, tloReportUrl } from "./reports";
import type { TloReportRow } from "./reports";
import { isRegularSession, legislatureYear, sessionLegislature, texasSessionCodes } from "./sessions";
import { tloBillHistoryUrl, tloBillTypes } from "./urls";

/**
 * One Texas legislator's history, discovered end to end from official TLO sources:
 *
 * 1. Identity: the current TLO House/Senate roster → member code, verified by the
 *    member's own TLO page ("Information for Rep. Gina Hinojosa").
 * 2. Sessions served and authored bills: TLO's per-member "Bills Authored" report,
 *    one request per session (the report names the member, so a wrong code fails).
 * 3. Authored-bill dates: official TLO bill-history XML (the "Filed" action).
 * 4. Floor votes: House Journal record votes for each regular session served,
 *    attributed by the journal label derived from that session's TLO display name.
 *
 * Fail closed: an unresolved/ambiguous identity or an unreadable page yields an
 * explicit gap, never a guessed attribution.
 */
const configSchema = z.object({
  sessions: z.array(z.string().regex(/^\d{2,3}(R|[1-9])$/)).min(1).optional(),
  /** Most-advanced primary-authored bills per session that get a bill-history lookup (dates). */
  authoredPerSession: z.number().int().min(0).max(500).default(25),
  includeJournals: z.boolean().default(true),
  /**
   * Keep only contested floor votes (minority side >= 10% of yes+no; the PLAN's draft
   * "contested" threshold) and, per session, the closest N. Lopsided and unanimous votes
   * carry about zero weight and would bury the signal. 0 = no per-session cap.
   */
  maxVotesPerSession: z.number().int().min(0).max(5000).default(150),
  /** Safety bound on House Journal day pages per session. */
  maxJournalDays: z.number().int().min(10).max(300).default(200),
}).strict();

const TLO = "https://capitol.texas.gov";

export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{M}+/gu, "");
}

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

/** Lowercase, accent-free word tokens with punctuation and name suffixes removed. */
export function nameTokens(value: string): string[] {
  return stripAccents(value).toLocaleLowerCase("en-US")
    .replace(/["“”(][^")”]*[")”]/g, " ") // nicknames: Zohaib "Zo" Qadri
    .replace(/[.,']/g, " ").replace(/[-–]/g, " ")
    .split(/\s+/).filter((token) => token && !SUFFIXES.has(token));
}

/** Same person by first and last name (middle names/initials and accents ignored). */
export function sameFullName(a: string, b: string): boolean {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (left.length < 2 || right.length < 2) return false;
  return left[0] === right[0] && left[left.length - 1] === right[right.length - 1];
}

function surnameOf(name: string): string {
  const tokens = nameTokens(name);
  return tokens[tokens.length - 1] ?? "";
}

export interface RosterEntry { label: string; code: string; chamber: "H" | "S" }

export function parseRoster(html: string, chamber: "H" | "S"): RosterEntry[] {
  const entries: RosterEntry[] = [];
  const pattern = /<a href='MemberInfo\.aspx\?Leg=\d+&Chamber=([HS])&Code=(A\d+)'>\s*([^<]+?)\s*<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    if (match[1] === chamber) entries.push({ label: match[3].replace(/\s+/g, " ").trim(), code: match[2], chamber });
  }
  return entries;
}

/** `Information for Rep. Gina Hinojosa` → { title: "Rep.", name: "Gina Hinojosa" } */
export function parseMemberInfoName(html: string): { title: string; name: string } | undefined {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const match = /Information for\s+(Rep\.|Sen\.)\s+(.+?)\s+Legislature:/i.exec(text);
  return match ? { title: match[1], name: match[2].trim() } : undefined;
}

/** Roster label surname: `Bell, Cecil` → bell; `Hinojosa` → hinojosa. */
function rosterSurname(label: string): string {
  return nameTokens(label.includes(",") ? label.split(",")[0] : label).join(" ");
}

/**
 * TLO display name as printed in bill lists → the House Journal's possible labels.
 * TLO and the journal disambiguate duplicate surnames differently ("Hinojosa, Gina" in the
 * 85th TLO data, plain "Hinojosa" in that session's journal), so both forms are configured.
 * That is safe: the journal prints every duplicate-surname member with an initial, so a
 * plain surname appears only when it is unique in the House that session, and if both forms
 * ever appear on one roll-call side the journal adapter rejects the vote as ambiguous.
 */
export function journalLabelsFor(display: string): string[] {
  const [surname, first] = display.split(",").map((part) => part.trim());
  const initial = first ? stripAccents(first).charAt(0).toUpperCase() : "";
  return initial ? [`${surname}, ${initial}.`, surname] : [surname];
}

/** Contested votes only, closest first, bounded per session. */
export function selectContestedVotes(actions: OfficialAction[], cap: number): OfficialAction[] {
  const share = (action: OfficialAction): number => {
    const { yes, no } = action.margin!;
    return Math.min(yes, no) / (yes + no);
  };
  const contested = actions.filter((action) => action.margin && isContested(action.margin));
  contested.sort((a, b) => share(b) - share(a) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return cap > 0 ? contested.slice(0, cap) : contested;
}

/** Primary-authored bills ranked by how far they got, then bill number. */
export function progressRank(lastActionText: string): number {
  if (/\b(effective|signed by the governor|vetoed)\b|see remarks for effective/i.test(lastActionText)) return 5;
  if (/sent to the governor|reported enrolled|\bpassed\b|adopted|enrolled/i.test(lastActionText)) return 4;
  if (/reported favorably|committee report|placed on|calendar|reported out|read (?:second|third) time/i.test(lastActionText)) return 3;
  if (/considered in public hearing|scheduled for public hearing|left pending|withdrawn/i.test(lastActionText)) return 2;
  return 1;
}

export function rankAuthored(rows: TloReportRow[], limit: number): TloReportRow[] {
  return [...rows]
    .filter((row) => (tloBillTypes as readonly string[]).includes(row.billType))
    .sort((a, b) => progressRank(b.lastActionText) - progressRank(a.lastActionText) || a.billNumber - b.billNumber)
    .slice(0, limit);
}

/** The author token common to every primary-authored row: the member's display name that session. */
export function displayNameFor(rows: TloReportRow[], surname: string): string | undefined {
  if (rows.length === 0) return undefined;
  let common = new Set(rows[0].authors);
  for (const row of rows.slice(1)) common = new Set(row.authors.filter((author) => common.has(author)));
  const matching = [...common].filter((author) => rosterSurname(author) === surname);
  return matching.length === 1 ? matching[0] : undefined;
}

export function houseJournalDayUrl(session: string, day: number): string {
  const legislature = sessionLegislature(session);
  return `https://journals.house.texas.gov/hjrnl/${legislature}r/html/${legislature}RDAY${String(day).padStart(2, "0")}FINAL.HTM`;
}

interface Identity { code: string; chamber: "H" | "S"; fullName: string; title: string; infoUrl: string }

async function resolveMember(context: AdapterContext): Promise<{ identity?: Identity; reason: string }> {
  const names = [...candidateNames(context.request)];
  const wanted = new Set(names.map(surnameOf).filter(Boolean));
  const entries: RosterEntry[] = [];
  for (const chamber of ["H", "S"] as const) {
    const roster = await context.client.get(`${TLO}/Members/Members.aspx?Chamber=${chamber}`, { format: "html" });
    entries.push(...parseRoster(roster.text, chamber).filter((entry) => wanted.has(rosterSurname(entry.label))));
  }
  const verified: Identity[] = [];
  for (const entry of entries) {
    const infoUrl = `${TLO}/Members/MemberInfo.aspx?Leg=89&Chamber=${entry.chamber}&Code=${entry.code}`;
    const info = parseMemberInfoName((await context.client.get(infoUrl, { format: "html" })).text);
    if (info && names.some((name) => sameFullName(name, info.name))) {
      verified.push({ code: entry.code, chamber: entry.chamber, fullName: info.name, title: info.title, infoUrl });
    }
  }
  if (verified.length === 1) {
    return { identity: verified[0], reason: `Matched ${verified[0].title} ${verified[0].fullName} (${verified[0].chamber}-${verified[0].code}) by exact first/last name on the current TLO roster.` };
  }
  if (verified.length > 1) return { reason: "Ambiguous: several current TLO members share this candidate's name." };
  return { reason: "No exact full-name match on the current (89th) TLO House/Senate rosters." };
}

export interface LrlIdentity { profile: LrlProfile; url: string }

/** Candidate full name against an LRL profile name, honoring the quoted nickname (`Warren Kenneth "Ken" Paxton`). */
export function lrlNameMatches(candidateNames: string[], profile: LrlProfile): boolean {
  const variants = [profile.fullName];
  const tokens = nameTokens(profile.fullName);
  if (profile.nickname && tokens.length) variants.push(`${profile.nickname} ${tokens[tokens.length - 1]}`);
  return candidateNames.some((name) => variants.some((variant) => sameFullName(name, variant)));
}

async function resolveLrl(context: AdapterContext): Promise<LrlIdentity | undefined> {
  const names = [...candidateNames(context.request)];
  const queries = new Set<string>();
  for (const name of names) {
    const tokens = nameTokens(name);
    if (tokens.length >= 2) queries.add(`${tokens[tokens.length - 1]}|${tokens[0]}`);
  }
  const matches = new Map<number, LrlIdentity>();
  for (const query of queries) {
    const [last, first] = query.split("|");
    let hits;
    try {
      hits = parseLrlSearch((await context.client.get(lrlSearchUrl(last, first), { format: "html" })).text);
    } catch { continue; }
    for (const hit of hits.slice(0, 5)) {
      if (matches.has(hit.memberId)) continue;
      try {
        const url = lrlProfileUrl(hit.memberId);
        const profile = parseLrlProfile((await context.client.get(url, { format: "html" })).text);
        if (profile && lrlNameMatches(names, profile)) matches.set(hit.memberId, { profile, url });
      } catch { /* an unreadable profile is simply not a match */ }
    }
  }
  return matches.size === 1 ? [...matches.values()][0] : undefined;
}

function titleCase(token: string): string {
  return token.replace(/(^|[-'])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/**
 * Journal labels from the member's own names. Both journals print the bare surname when it is
 * unique in that chamber and an initial otherwise (`Bell, C.` in the House, `A. Hinojosa` in the
 * Senate), so surname plus every plausible initial covers both. A bare surname is only trusted
 * because LRL independently shows this person sat in that chamber that session.
 */
export function nameJournalLabels(
  names: string[], chamber: "H" | "S", extraFirstNames: string[] = [],
): string[] {
  const surnames = new Set<string>();
  const initials = new Set<string>();
  for (const name of names) {
    const tokens = nameTokens(name);
    if (tokens.length < 2) continue;
    surnames.add(titleCase(tokens[tokens.length - 1]));
    initials.add(tokens[0].charAt(0).toUpperCase());
  }
  for (const first of extraFirstNames) {
    const token = nameTokens(first)[0];
    if (token) initials.add(token.charAt(0).toUpperCase());
  }
  const labels = new Set<string>();
  for (const surname of surnames) {
    labels.add(surname);
    for (const initial of initials) labels.add(chamber === "H" ? `${surname}, ${initial}.` : `${initial}. ${surname}`);
  }
  return [...labels];
}

type DiscoveryCache = Map<string, Promise<string[]>>;
const discoveries = new WeakMap<object, DiscoveryCache>();

/** Journal day pages are shared by every candidate in a run; discover each session once. */
function discoverOnce(context: AdapterContext, key: string, find: () => Promise<string[]>): Promise<string[]> {
  let cache = discoveries.get(context.client);
  if (!cache) discoveries.set(context.client, (cache = new Map()));
  let found = cache.get(key);
  if (!found) cache.set(key, (found = find()));
  return found;
}

async function discoverHouseJournalUrls(
  context: AdapterContext, session: string, maxDays: number,
): Promise<string[]> {
  return discoverOnce(context, `house:${session}`, async () => {
    const urls: string[] = [];
    let misses = 0;
    for (let day = 1; day <= maxDays; day++) {
      const url = houseJournalDayUrl(session, day);
      try {
        await context.client.get(url, { format: "html" });
        urls.push(url);
        misses = 0;
      } catch {
        misses++;
        // Day pages are numbered from 1; a run of missing days after the first few ends the session.
        if (day > 5 && misses >= 6) break;
      }
    }
    return urls;
  });
}

export function senateJournalDayUrl(session: string, month: number, day: number): string {
  const legislature = sessionLegislature(session);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `https://journals.senate.texas.gov/sjrnl/${legislature}r/html/${legislature}RSJ${mm}-${dd}-F.HTM`;
}

/** Senate journals are one page per calendar date: probe every non-Sunday from the first possible convening day. */
async function discoverSenateJournalUrls(context: AdapterContext, session: string): Promise<string[]> {
  return discoverOnce(context, `senate:${session}`, async () => {
    const year = legislatureYear(sessionLegislature(session));
    const urls: string[] = [];
    const cursor = new Date(Date.UTC(year, 0, 8));
    const last = Date.UTC(year, 5, 8);
    while (cursor.getTime() <= last) {
      if (cursor.getUTCDay() !== 0) {
        const url = senateJournalDayUrl(session, cursor.getUTCMonth() + 1, cursor.getUTCDate());
        try {
          await context.client.get(url, { format: "html" });
          urls.push(url);
        } catch { /* no journal that day */ }
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return urls;
  });
}

export const txLegislatorAdapter: RecordsAdapter = {
  kind: "tx-legislator",
  async collect(context: AdapterContext, value: unknown): Promise<AdapterResult> {
    const parsed = configSchema.safeParse(value ?? {});
    if (!parsed.success) {
      return { actions: [], status: "needs_review", reason: parsed.error.issues.map((issue) => issue.message).join("; ") };
    }
    const config = collectionConfig(parsed.data, context);
    const found = await resolveMember(context);
    const identity = found.identity;
    const lrl = await resolveLrl(context);
    if (!identity && !lrl) {
      return { actions: [], status: "needs_review", reason: `${found.reason} No unique exact-name match in the LRL legislator directory (all legislators since 1846) either.` };
    }
    const surname = surnameOf(context.request.candidate.name);
    const names = [...candidateNames(context.request)];
    const extraFirst = [lrl?.profile.fullName.split(/\s+/)[0], lrl?.profile.nickname].filter((v): v is string => Boolean(v));

    const sessions = config.sessions ?? texasSessionCodes(
      Number(context.window.since.slice(0, 4)), Number(context.window.before.slice(0, 4)),
    );
    const actions = new Map<string, OfficialAction>();
    const notes: string[] = [];
    if (identity) notes.push(found.reason);
    if (lrl) notes.push(`LRL directory match "${lrl.profile.fullName}": ${lrl.profile.terms.map((t) => `${t.chamber === "H" ? "House" : "Senate"} D${t.district} (${t.legislatures.slice().sort((a, b) => a - b).join("/")})`).join(", ") || "no terms"}.`);
    const served: string[] = [];
    let authoredBills = 0;
    let houseSessions = 0;
    let senateSessions = 0;

    for (const session of sessions) {
      const legislature = sessionLegislature(session);
      // LRL (when matched) is the authority on whether and where the member sat that legislature.
      const chamber = lrl ? chamberInLegislature(lrl.profile, legislature) : identity?.chamber;
      if (lrl && !chamber) continue;
      const role = chamber === "S" ? "Texas Senate" : "Texas House of Representatives";
      const evidenceUrl = lrl?.url ?? identity!.infoUrl;

      let display: string | undefined;
      let reportUrl = evidenceUrl;
      if (identity) {
        reportUrl = tloReportUrl(session, "author", identity.code);
        let rows: TloReportRow[] = [];
        try {
          const report = parseTloReport((await context.client.get(reportUrl, { format: "html" })).text);
          rows = report.rows.filter((row) => row.section === "author");
          const subject = report.subject.replace(/^(Rep\.|Sen\.)\s*/i, "");
          if (report.rows.length > 0 && !sameFullName(subject, identity.fullName)) {
            notes.push(`${session}: report subject "${report.subject}" does not match ${identity.fullName}; skipped.`);
            rows = [];
          }
        } catch (error) {
          notes.push(`${session}: author report unavailable (${error instanceof Error ? error.message : "error"}).`);
        }
        if (rows.length > 0) {
          served.push(session);
          display = displayNameFor(rows, surname);
          // Authored bills (dated from TLO bill-history XML).
          if (config.authoredPerSession > 0 && display) {
            const picked = rankAuthored(rows, config.authoredPerSession);
            const result = await tloBillHistoryAdapter.collect(context, {
              urls: picked.map((row) => tloBillHistoryUrl(session, row.billType, row.billNumber)),
              role,
              memberName: display,
              memberCandidateId: context.request.candidate.id,
              memberIdentitySourceUrl: reportUrl,
              memberSessions: [session],
            });
            for (const action of result.actions) actions.set(action.id, action);
            authoredBills += result.actions.length;
            if (rows.length > picked.length) notes.push(`${session}: ${picked.length} of ${rows.length} primary-authored bills dated (most advanced first).`);
          } else if (!display) {
            notes.push(`${session}: could not determine the TLO display name; authored bills not dated.`);
          }
        } else if (!lrl) {
          continue; // no authored bills and no LRL service record: no evidence of service that session
        }
      }

      if (!config.includeJournals || !chamber || !isRegularSession(session)) continue;
      if (!lrl && !display) continue; // without LRL, labels are only trusted when TLO named the member that session
      const labels = new Set([
        ...(display && chamber === "H" ? journalLabelsFor(display) : []),
        ...nameJournalLabels(names, chamber, extraFirst),
      ]);
      const urls = chamber === "H"
        ? await discoverHouseJournalUrls(context, session, config.maxJournalDays)
        : await discoverSenateJournalUrls(context, session);
      if (urls.length === 0) {
        notes.push(`${session}: no ${chamber === "H" ? "House" : "Senate"} Journal day pages found.`);
        continue;
      }
      const result = await (chamber === "H" ? txHouseJournalAdapter : txSenateJournalAdapter).collect(context, {
        urls,
        role,
        journalLabels: [...labels],
        memberCandidateId: context.request.candidate.id,
        memberIdentitySourceUrl: evidenceUrl,
      });
      const kept = context.exhaustive ? result.actions : selectContestedVotes(result.actions, config.maxVotesPerSession);
      for (const action of kept) actions.set(action.id, action);
      const chamberLabel = chamber === "H" ? "House" : "Senate";
      if (kept.length > 0) {
        if (chamber === "H") houseSessions++; else senateSessions++;
        notes.push(`${session}: ${kept.length} of ${result.actions.length} attributed ${chamberLabel} record votes kept (contested, closest first).`);
      } else notes.push(`${session}: ${chamberLabel} Journal labels ${[...labels].join(" / ")} matched no contested record votes (${result.reason.slice(0, 120)}).`);
    }

    notes.unshift(`Authored bills found in ${served.length ? served.join(", ") : "no scanned session"} (${authoredBills} dated action(s)); floor votes in ${houseSessions} House and ${senateSessions} Senate session(s).`);
    notes.push("Called (special) sessions' floor votes and authored bills for members with no current TLO code are not collected.");
    return {
      actions: [...actions.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
      status: actions.size > 0 ? "partial" : "needs_review",
      reason: notes.join(" "),
    };
  },
};
