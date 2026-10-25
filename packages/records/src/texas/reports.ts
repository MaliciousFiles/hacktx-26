import { createHash } from "node:crypto";
import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { AdapterContext, AdapterResult, RecordsAdapter } from "../adapters";
import { collectionConfig } from "../adapters";
import { decodeEntities, htmlToPlainText, textSpanLocator } from "../document";
import { inWindow, isISODate, provenance } from "../model";
import type { Snapshot } from "../model";
import { tenureSchema } from "../executive/shared";
import { legislatureYear, sessionLegislature, texasSessionCodes } from "./sessions";

/**
 * Texas Legislature Online (capitol.texas.gov) published reports. These are the
 * official TLO "Bills Signed/Vetoed by the Governor" and per-member "Bills
 * Authored" reports. They list one row per bill with its latest action.
 */
const REPORT_BASE = "https://capitol.texas.gov/reports/report.aspx";

export function tloReportUrl(session: string, id: string, code?: string): string {
  if (!/^\d{2,3}(R|[1-9])$/.test(session)) throw new Error(`Invalid Texas session code: ${session}`);
  if (!/^[a-z]+$/i.test(id)) throw new Error("Invalid TLO report id");
  if (code !== undefined && !/^A\d+$/.test(code)) throw new Error("Invalid TLO member code");
  return `${REPORT_BASE}?LegSess=${session}&ID=${id}${code ? `&Code=${code}` : ""}`;
}

export interface TloReportRow {
  /** `HB 305` */
  bill: string;
  billType: string;
  billNumber: number;
  /** Official bill history page (https). */
  billUrl: string;
  authors: string[];
  sponsors: string[];
  lastActionDate?: string;
  lastActionText: string;
  caption: string;
  /** Which report section the row belongs to, e.g. "author" / "jointauthor". */
  section: string;
}

export interface TloReport {
  title: string;
  /** Subject line, e.g. `Rep. Gina Hinojosa` on member reports. */
  subject: string;
  sessionLabel: string;
  rows: TloReportRow[];
}

function clean(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function splitList(value: string): string[] {
  return value.split("|").map((part) => part.trim()).filter(Boolean);
}

function mdyToIso(value: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value.trim());
  if (!match) return undefined;
  const iso = `${match[3]}-${match[1]}-${match[2]}`;
  return isISODate(iso) ? iso : undefined;
}

/** Parse the `bill-search-results` rows of a TLO report page. Fails closed on page shapes it does not recognise. */
export function parseTloReport(html: string): TloReport {
  const title = clean(/<h2>([\s\S]*?)<\/h2>/i.exec(html)?.[1] ?? "");
  if (!title) throw new Error("TLO report has no title");
  const subject = clean(/<span class="TitleItem">([\s\S]*?)<\/span>/i.exec(html)?.[1] ?? "");
  const sessionLabel = clean(/<span class="TitleSubItem">([^<]*Legislature[^<]*)<\/span>/i.exec(html)?.[1] ?? "");

  // Section anchors (`<a name="author">`) partition member reports; plain reports have none.
  const anchors = [...html.matchAll(/<a name="([a-z]+)"><\/a>/gi)].map((m) => ({ name: m[1].toLowerCase(), at: m.index }));
  const sectionAt = (index: number): string => {
    let name = "";
    for (const anchor of anchors) if (anchor.at <= index) name = anchor.name;
    return name;
  };

  const rows: TloReportRow[] = [];
  // Rows contain nested divs; split on the row opener instead of balancing tags.
  const starts = [...html.matchAll(/<div class="row">/gi)].map((m) => m.index);
  for (let i = 0; i < starts.length; i++) {
    const chunk = html.slice(starts[i], starts[i + 1] ?? html.length);
    const link = /<a href="([^"]*BillLookup\/History\.aspx\?[^"]*)">([^<]*)<\/a>/i.exec(chunk);
    if (!link) continue;
    const bill = clean(link[2]);
    const parts = /^([A-Z]{2,3})\s+(\d{1,5})$/.exec(bill);
    if (!parts) throw new Error(`Unrecognised bill label in TLO report: ${bill}`);
    const field = (label: string): string | undefined => {
      // `<b>Author</b>:\n</div><div class="bill-search-result-data">value</div>` and `<b>Last Action:</b></div>…`
      const match = new RegExp(`<b>${label}:?</b>:?\\s*</div>\\s*<div class="bill-search-result-data">([\\s\\S]*?)</div>`, "i").exec(chunk);
      return match ? clean(match[1]) : undefined;
    };
    const lastAction = field("Last Action") ?? "";
    const billUrl = decodeEntities(link[1]).replace(/^http:\/\//i, "https://");
    rows.push({
      bill,
      billType: parts[1],
      billNumber: Number(parts[2]),
      billUrl,
      authors: splitList(field("Author") ?? ""),
      sponsors: splitList(field("Sponsor") ?? ""),
      lastActionDate: mdyToIso(lastAction),
      lastActionText: lastAction.replace(/^\d{2}\/\d{2}\/\d{4}\s*/, "").replace(/\s+/g, " ").trim(),
      caption: field("Caption") ?? "",
      section: sectionAt(starts[i]),
    });
  }
  return { title, subject, sessionLabel, rows };
}

// ——— Governor action reports ———

const configSchema = z.object({
  /** Session codes such as 89R, 891. Defaults to every session in the request window. */
  sessions: z.array(z.string().regex(/^\d{2,3}(R|[1-9])$/)).min(1).optional(),
  role: z.string().trim().min(1).default("Governor of Texas"),
  tenure: tenureSchema,
  /**
   * Signed bills in the leadership priority range (HB/SB 1..N) are included; the
   * Legislature reserves the lowest bill numbers for each session's top priorities.
   * Every veto is always included. Set 0 to skip signings entirely.
   */
  signedPriorityMax: z.number().int().min(0).max(1000).default(99),
}).strict();

const adapterVersion = "tlo-governor-report/v1";

function actionId(session: string, bill: string, kind: string, date: string, candidateId: string): string {
  return `tlo-gov:${createHash("sha256").update(JSON.stringify([session, bill, kind, date, candidateId])).digest("hex")}`;
}

function sessionOfUrl(url: string): string {
  return /LegSess=([^&]+)/.exec(url)?.[1] ?? "";
}

function rowLocator(plain: string, row: TloReportRow): string {
  const start = plain.indexOf(row.bill);
  if (start < 0) throw new Error(`Bill ${row.bill} not found in report text`);
  return textSpanLocator(start, start + row.bill.length);
}

function toGovernorAction(
  context: AdapterContext,
  config: z.infer<typeof configSchema>,
  snapshot: Snapshot,
  plain: string,
  row: TloReportRow,
  kind: "signed" | "vetoed",
): OfficialAction {
  const session = sessionOfUrl(snapshot.sourceUrl);
  const date = row.lastActionDate!;
  return {
    id: actionId(session, row.bill, kind, date, context.request.candidate.id),
    actorId: context.request.candidate.id,
    issueIds: [],
    role: config.role,
    body: "Office of the Governor of Texas",
    type: kind,
    stance: "n/a",
    date,
    title: `${row.bill}: ${kind === "vetoed" ? "Vetoed by the Governor" : "Signed by the Governor"} — ${row.caption}`.slice(0, 400),
    officialText: [row.caption, `Last action: ${row.lastActionText}`].filter(Boolean).join("\n"),
    sourceUrl: snapshot.sourceUrl,
    measureUrl: row.billUrl,
    extraction: "html",
    dateBasis: "action_date",
    attribution: {
      method: "office_tenure",
      tenure: { start: config.tenure.start, end: config.tenure.end, sourceUrl: config.tenure.sourceUrl },
    },
    provenance: [provenance(snapshot, adapterVersion, rowLocator(plain, row))],
  };
}

export const tloGovernorReportAdapter: RecordsAdapter = {
  kind: "tlo-governor-report",
  async collect(context: AdapterContext, value: unknown): Promise<AdapterResult> {
    const parsed = configSchema.safeParse(value);
    if (!parsed.success) {
      return { actions: [], status: "needs_review", reason: parsed.error.issues.map((issue) => issue.message).join("; ") };
    }
    const config = collectionConfig(parsed.data, context);
    if (config.tenure.candidateId !== context.request.candidate.id) {
      return { actions: [], status: "needs_review", reason: "tenure.candidateId must match the request candidate ID" };
    }
    // Only sessions that convened during the verified tenure can hold this governor's actions.
    const firstYear = Number(config.tenure.start.slice(0, 4));
    const lastYear = Number((config.tenure.end ?? context.window.before).slice(0, 4));
    const sessions = (config.sessions ?? texasSessionCodes(
      Number(context.window.since.slice(0, 4)), Number(context.window.before.slice(0, 4)),
    )).filter((session) => {
      const year = legislatureYear(sessionLegislature(session));
      return year >= firstYear && year <= lastYear;
    });
    const actions = new Map<string, OfficialAction>();
    const problems: string[] = [];
    let vetoes = 0;
    let signedKept = 0;
    let signedSkipped = 0;

    for (const session of sessions) {
      for (const [reportId, kind] of [["vetoedbygov", "vetoed"], ["signedbygov", "signed"]] as const) {
        if (kind === "signed" && config.signedPriorityMax === 0) continue;
        const url = tloReportUrl(session, reportId);
        try {
          const snapshot = await context.client.get(url, { format: "html" });
          const report = parseTloReport(snapshot.text);
          const plain = htmlToPlainText(snapshot.text);
          for (const row of report.rows) {
            if (!row.lastActionDate) { problems.push(`${session} ${row.bill}: no dated last action`); continue; }
            if (kind === "vetoed") {
              if (!/vetoed by the governor/i.test(row.lastActionText)) continue;
            } else {
              // Last-action text starts with a one-letter chamber/event code ("E Effective on 9/1/25").
              if (!/^(?:[A-Z]\s+)?(?:signed by the governor|effective|see remarks for effective date)/i.test(row.lastActionText)) continue;
              if (!["HB", "SB"].includes(row.billType) || row.billNumber > config.signedPriorityMax) { signedSkipped++; continue; }
            }
            const date = row.lastActionDate;
            // Earlier/later actions in a session that straddles a change of governor belong to the other one.
            if (date < config.tenure.start || (config.tenure.end && date > config.tenure.end)) continue;
            if (!inWindow(date, context.window)) continue;
            const action = toGovernorAction(context, config, snapshot, plain, row, kind);
            actions.set(action.id, action);
            if (kind === "vetoed") vetoes++; else signedKept++;
          }
        } catch (error) {
          problems.push(`${session} ${reportId}: ${error instanceof Error ? error.message : "report failed"}`);
        }
      }
    }

    const notes = [
      `${vetoes} veto(es) and ${signedKept} HB/SB signing(s) (bill numbers 1–${config.signedPriorityMax}) from ${sessions.length} session(s) of official TLO governor reports.`,
      signedSkipped ? `${signedSkipped} other signings were not emitted (resolutions or other non-HB/SB measures${config.signedPriorityMax < 1000 ? ", or bills numbered above the configured limit" : ""}).` : "",
      "The signing/veto date is the report's last-action date, which TLO records on the day the Governor acted.",
      problems.length ? `${problems.length} issue(s): ${problems.slice(0, 3).join("; ")}` : "",
    ].filter(Boolean);
    return {
      actions: [...actions.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
      status: actions.size === 0 && problems.length ? "unavailable" : "partial",
      reason: notes.join(" "),
    };
  },
};
