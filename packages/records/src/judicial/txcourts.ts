import { createHash } from "node:crypto";
import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { AdapterContext, AdapterResult, RecordsAdapter } from "../adapters";
import { collectionConfig } from "../adapters";
import { decodeEntities, htmlToPlainText, textSpanLocator } from "../document";
import { inWindow, candidateNames, provenance } from "../model";
import type { Snapshot } from "../model";
import { nameTokens, sameFullName } from "../texas/legislator";

const adapterVersion = "tx-court-opinions/v1";
const COURTS_WWW = "https://www.txcourts.gov";
const SEARCH = "https://search.txcourts.gov";

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th", "13th", "14th", "15th"];

export interface TxCourt { code: string; name: string; rosterUrl: string; role: string }

/** The 17 appellate courts on the Texas Judicial Branch site. */
export const TX_COURTS: TxCourt[] = [
  { code: "cossup", name: "Supreme Court of Texas", rosterUrl: `${COURTS_WWW}/supreme/about-the-court/justices/`, role: "Justice, Supreme Court of Texas" },
  { code: "coscca", name: "Texas Court of Criminal Appeals", rosterUrl: `${COURTS_WWW}/cca/about-the-court/judges/`, role: "Judge, Texas Court of Criminal Appeals" },
  ...ORDINALS.map((ordinal, index) => ({
    code: `coa${String(index + 1).padStart(2, "0")}`,
    name: `${ordinal} Court of Appeals`,
    rosterUrl: `${COURTS_WWW}/${ordinal}coa/about-the-court/justices/`,
    role: `Justice, ${ordinal} Court of Appeals of Texas`,
  })),
];

const configSchema = z.object({
  /** Court codes to check for the candidate (default: all 17 appellate courts). */
  courts: z.array(z.string().regex(/^(cossup|coscca|coa(0[1-9]|1[0-5]))$/)).min(1).optional(),
  /** Released-opinion days older than this many years before the window end are not fetched. */
  lookbackYears: z.number().int().min(1).max(40).default(6),
  /** Safety bound on released-opinion day pages fetched for one candidate. */
  maxDays: z.number().int().min(1).max(4000).default(2500),
  maxActions: z.number().int().min(1).max(5000).default(400),
}).strict();

export interface RosterMember { title: string; name: string }

/** Judges/justices listed on a court's official roster page ("Chief Justice Byrne", "Judge Bert Richardson"). */
export function parseCourtRoster(html: string): RosterMember[] {
  const plain = htmlToPlainText(html);
  const members = new Map<string, RosterMember>();
  for (const match of plain.matchAll(/^(Chief Justice|Presiding Judge|Justice|Judge) ([^\n.]{3,60})$/gm)) {
    const name = match[2].trim();
    // Bios and menus add sentences; a roster heading is only a 2-5 word personal name.
    if (name.split(/\s+/).length < 2 || name.split(/\s+/).length > 6) continue;
    members.set(nameTokens(name).join(" "), { title: match[1], name });
  }
  return [...members.values()];
}

export interface DocketDocument {
  /** Document label as printed, e.g. `Memorandum Opinion by Justice Triana`. */
  label: string;
  kind: "majority" | "dissent" | "concurrence" | "concur_dissent" | "other";
  /** Surname printed after the title, e.g. `Triana`. */
  authorLabel?: string;
  authorTitle?: string;
}

export interface DocketRow {
  caseNumber: string;
  documents: DocketDocument[];
  style: string;
  court: string;
  disposition: string;
  panel: string[];
}

export function docketDateUrl(code: string, mdy: string): string {
  return `${SEARCH}/Docket.aspx?coa=${code}&FullDate=${mdy}`;
}

function classify(label: string): DocketDocument["kind"] {
  if (/concurring\s+and\s+dissenting|concur(?:rence)?\s+and\s+dissent/i.test(label)) return "concur_dissent";
  if (/dissent/i.test(label)) return "dissent";
  if (/concur/i.test(label)) return "concurrence";
  if (/majority|opinion|original|published|memorandum/i.test(label)) return "majority";
  return "other";
}

function cleanCell(value: string): string {
  return decodeEntities(value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Rows of the "Released Orders & Opinions" day page (RadGrid markup). */
export function parseDocketDay(html: string): DocketRow[] {
  const rows: DocketRow[] = [];
  const starts = [...html.matchAll(/<tr class="rg(?:Alt)?Row"/g)].map((m) => m.index!);
  for (const [i, start] of starts.entries()) {
    const chunk = html.slice(start, starts[i + 1] ?? html.length);
    const caseNumber = /<a [^>]*lnkCase"[^>]*>([^<]+)<\/a>/.exec(chunk)?.[1]?.trim();
    if (!caseNumber) continue;
    const documents: DocketDocument[] = [];
    const docTable = /<table class="docGrid"[\s\S]*?<\/table>/.exec(chunk)?.[0] ?? "";
    for (const doc of docTable.matchAll(/<tr>\s*<td>([\s\S]*?)<\/td>/g)) {
      const label = cleanCell(doc[1]);
      if (!label) continue;
      const by = /\bby\s+(Chief Justice|Presiding Judge|Justice|Judge)\s+(.+)$/i.exec(label);
      documents.push({
        label, kind: classify(label),
        ...(by ? { authorTitle: by[1], authorLabel: by[2].trim() } : {}),
      });
    }
    const style = /<td class="caseStyle">([\s\S]*?)<\/td>/.exec(chunk)?.[1] ?? "";
    const [styleText, courtText] = style.split(/<br\s*\/?>/i).map(cleanCell);
    const disposition = cleanCell(/<td class="caseDisp"[^>]*>([\s\S]*?)<\/td>/.exec(chunk)?.[1] ?? "");
    const tail = chunk.slice(chunk.search(/class="caseDisp"/));
    const panelCell = /<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/.exec(tail)?.[1] ?? "";
    const panel = panelCell.split(/<br\s*\/?>/i).map(cleanCell).filter((value) => value && value !== "&nbsp;" && value !== "\u00a0");
    rows.push({ caseNumber, documents, style: styleText ?? "", court: courtText ?? "", disposition, panel });
  }
  return rows;
}

function heading(html: string): string | undefined {
  return /Released Orders &(?:amp;)? Opinions for (\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(html)
    ?.slice(1).map((part, index) => (index < 2 ? part.padStart(2, "0") : part)).join("/");
}

function mdyToIso(mdy: string): string {
  const [month, day, year] = mdy.split("/");
  return `${year}-${month}-${day}`;
}

const QUARTERS = ["01-01-", "04-01-", "07-01-", "10-01-"] as const;

function hiddenField(html: string, name: string): string {
  const match = new RegExp(`name="${name}"[^>]*value="([^"]*)"`).exec(html);
  return match ? decodeEntities(match[1]) : "";
}

/** Days with released orders/opinions: quarter listings are ASP.NET postbacks on the court's search page. */
async function releaseDays(context: AdapterContext, court: TxCourt, fromYear: number, toYear: number): Promise<{ days: string[]; failures: number }> {
  const url = `${SEARCH}/DocketSrch.aspx?coa=${court.code}`;
  const initial = await context.client.get(url, { format: "html" });
  const state = Object.fromEntries(["__EVENTTARGET", "__EVENTARGUMENT", "__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"]
    .map((name) => [name, hiddenField(initial.text, name)]));
  const days = new Set<string>();
  let failures = 0;
  for (let year = toYear; year >= fromYear; year--) {
    for (const quarter of QUARTERS) {
      try {
        const page = await context.client.get(url, {
          format: "html",
          form: {
            ...state,
            "ctl00$ContentPlaceHolder1$ddlYear": String(year),
            "ctl00$ContentPlaceHolder1$ddlQuarter": quarter,
            "ctl00$ContentPlaceHolder1$btnSearch": "Refresh",
          },
        });
        for (const match of page.text.matchAll(/FullDate=(\d{2}\/\d{2}\/\d{4})/g)) days.add(match[1]);
      } catch { failures++; }
    }
  }
  return { days: [...days].filter((mdy) => Number(mdy.slice(-4)) >= fromYear)
    .sort((a, b) => mdyToIso(b).localeCompare(mdyToIso(a))), failures };
}

function surnameKey(name: string): string {
  const tokens = nameTokens(name);
  return tokens[tokens.length - 1] ?? "";
}

const KIND_TEXT: Record<DocketDocument["kind"], string> = {
  majority: "Opinion", dissent: "Dissent", concurrence: "Concurrence", concur_dissent: "Concurrence and dissent", other: "Opinion",
};

/**
 * Written opinions of an Texas appellate judge from the courts' official "Released Orders &
 * Opinions" day pages (search.txcourts.gov): author of majority/memorandum opinions and of
 * separate dissents and concurrences, with the case, disposition and panel. Identity is the
 * candidate's exact full name on that court's official roster; the printed author surname must
 * be unique on the roster. Panel membership without a separate opinion is not an action.
 */
export const txCourtOpinionsAdapter: RecordsAdapter = {
  kind: "tx-court-opinions",
  async collect(context: AdapterContext, value: unknown): Promise<AdapterResult> {
    const parsed = configSchema.safeParse(value ?? {});
    if (!parsed.success) {
      return { actions: [], status: "needs_review", reason: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const config = collectionConfig(parsed.data, context);
    const names = [...candidateNames(context.request)];
    const courts = TX_COURTS.filter((court) => !config.courts || config.courts.includes(court.code));

    const found: { court: TxCourt; member: RosterMember; roster: Snapshot; rosterPlain: string }[] = [];
    const rosterProblems: string[] = [];
    for (const court of courts) {
      try {
        const roster = await context.client.get(court.rosterUrl, { format: "html" });
        const members = parseCourtRoster(roster.text);
        const hits = members.filter((member) => names.some((name) => sameFullName(name, member.name)));
        for (const member of hits) {
          const surname = surnameKey(member.name);
          if (members.filter((other) => surnameKey(other.name) === surname).length > 1) {
            rosterProblems.push(`${court.name}: surname ${surname} is shared by several roster members; opinions cannot be attributed by surname.`);
            continue;
          }
          found.push({ court, member, roster, rosterPlain: htmlToPlainText(roster.text) });
        }
      } catch (error) {
        rosterProblems.push(`${court.name}: roster unavailable (${error instanceof Error ? error.message : "error"}).`);
      }
    }
    if (found.length === 0) {
      return {
        actions: [], status: "needs_review",
        reason: `No exact full-name match on an official Texas appellate court roster (current members only). ${rosterProblems.slice(0, 2).join(" ")}`.trim(),
      };
    }

    const toYear = Number(context.window.before.slice(0, 4));
    const fromYear = Math.max(Number(context.window.since.slice(0, 4)), toYear - config.lookbackYears);
    const actions = new Map<string, OfficialAction>();
    const notes: string[] = [...rosterProblems];
    let daysScanned = 0;
    let failedDays = 0;
    let mismatchedDays = 0;

    for (const { court, member, roster, rosterPlain } of found) {
      const surname = surnameKey(member.name);
      const at = rosterPlain.indexOf(`${member.title} ${member.name}`);
      const identityRef = provenance(roster, adapterVersion, textSpanLocator(Math.max(at, 0), Math.max(at, 0) + `${member.title} ${member.name}`.length));
      let inventory: Awaited<ReturnType<typeof releaseDays>>;
      try { inventory = await releaseDays(context, court, fromYear, toYear); }
      catch { notes.push(`${court.name}: release-day inventory unavailable.`); continue; }
      const days = inventory.days.filter((day) => inWindow(mdyToIso(day), context.window));
      notes.push(`${court.name}: ${inventory.failures} failed quarter inventory request(s); ${Math.max(0, days.length - config.maxDays)} release day(s) beyond day budget.`);
      let courtActions = 0;
      for (const mdy of days.slice(0, config.maxDays)) {
        const iso = mdyToIso(mdy);
        if (!inWindow(iso, context.window)) continue;
        let page: Snapshot;
        try { page = await context.client.get(docketDateUrl(court.code, mdy), { format: "html" }); }
        catch { failedDays++; continue; }
        daysScanned++;
        const printed = heading(page.text);
        if (!printed || printed !== mdy) { mismatchedDays++; continue; }
        const plain = htmlToPlainText(page.text);
        for (const row of parseDocketDay(page.text)) {
          for (const doc of row.documents) {
            if (!doc.authorLabel || surnameKey(doc.authorLabel) !== surname) continue;
            if (!/\b(chief justice|justice|judge|presiding judge)\b/i.test(doc.authorTitle ?? "")) continue;
            const rowAt = plain.indexOf(row.caseNumber);
            const docAt = rowAt >= 0 ? plain.indexOf(doc.label, rowAt) : -1;
            if (rowAt < 0 || docAt < 0) continue;
            const id = `tx-court:${createHash("sha256").update(JSON.stringify([court.code, context.request.candidate.id, iso, row.caseNumber, doc.label])).digest("hex")}`;
            const kindText = KIND_TEXT[doc.kind];
            actions.set(id, {
              id,
              actorId: context.request.candidate.id,
              issueIds: [],
              role: court.role,
              body: court.name,
              type: "judicial_opinion",
              // Writing the majority opinion is authorship; a dissent is a recorded "no" on the judgment.
              stance: doc.kind === "majority" ? "author" : doc.kind === "dissent" ? "no" : "n/a",
              date: iso,
              title: `${kindText} by ${doc.authorTitle} ${doc.authorLabel}: ${row.style} (${row.caseNumber})`,
              officialText: [doc.label, row.style, row.court, row.disposition, row.panel.length ? `Panel: ${row.panel.join(", ")}` : ""].filter(Boolean).join(" — "),
              sourceUrl: page.sourceUrl,
              extraction: "html",
              dateBasis: "action_date",
              attribution: { method: "named_record", sourceActorId: `${doc.authorTitle} ${doc.authorLabel}` },
              provenance: [provenance(page, adapterVersion, textSpanLocator(rowAt, docAt + doc.label.length)), identityRef],
            });
            courtActions++;
          }
        }
        if (actions.size >= config.maxActions) break;
      }
      notes.push(`${court.name}: matched ${member.title} ${member.name}; ${days.length} release day(s) listed since ${fromYear}, ${courtActions} written opinion(s) attributed.`);
    }

    const list = [...actions.values()].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)).slice(0, config.maxActions);
    notes.push(`${failedDays} failed day request(s); ${mismatchedDays} missing/mismatched day heading(s). Action budget ${config.maxActions}${actions.size >= config.maxActions ? " reached; remaining opinions not collected" : " not reached"}. Only written opinions are actions; panel membership and the judge's earlier courts/time before ${fromYear} are not collected. Dissent labels describe a judicial judgment, not a policy stance.`);
    return {
      actions: list,
      status: list.length > 0 ? "partial" : "needs_review",
      reason: `${daysScanned} released-opinion day page(s) scanned. ${notes.join(" ")}`,
    };
  },
};
