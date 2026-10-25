import { createHash } from "node:crypto";
import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { AdapterContext, AdapterResult, RecordsAdapter } from "../adapters";
import { collectionConfig } from "../adapters";
import { decodeEntities, htmlToPlainText, textSpanLocator } from "../document";
import { inWindow, normalizeName, provenance } from "../model";
import type { Snapshot } from "../model";
import { tenureSchema } from "./shared";

const adapterVersion = "lrl-governor-orders/v1";
const LRL_ORIGIN = "https://lrl.texas.gov";
const SEARCH = `${LRL_ORIGIN}/legeLeaders/governors/searchProc.cfm`;

const configSchema = z.object({
  /** LRL "Governor" option value on the governor documents search (Greg Abbott 45, Rick Perry 44, …). */
  authorId: z.number().int().positive(),
  /** Exact author name as printed in the LRL results; every row must carry it. */
  authorName: z.string().trim().min(1),
  /** LRL document type: 5 = Executive order. */
  docType: z.number().int().positive().default(5),
  role: z.string().trim().min(1).default("Governor of Texas"),
  tenure: tenureSchema,
  /** Also fetch each scanned order PDF to attach it as a second provenance when its text names the order. */
  fetchDocuments: z.boolean().default(true),
  maxDocuments: z.number().int().min(1).max(2000).default(500),
}).strict();

export interface LrlGovernorRow {
  /** Normalized https URL of the scanned PDF. */
  url: string;
  /** `Executive Order GA-57 Relating to …` exactly as printed in the LRL results. */
  title: string;
  /** `GA-57` */
  orderId?: string;
  author: string;
  date: string;
  session: string;
}

function clean(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function mdyToIso(value: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value.trim());
  if (!match) return undefined;
  const iso = `${match[3]}-${match[1]}-${match[2]}`;
  return Number.isNaN(Date.parse(iso)) ? undefined : iso;
}

export function lrlGovernorSearchUrl(authorId: number, docType: number): string {
  return `${SEARCH}?docAuthor=${authorId}&govDocType=${docType}`;
}

/** Result rows of the LRL governor documents search (newest first). */
export function parseLrlGovernorDocuments(html: string): LrlGovernorRow[] {
  const rows: LrlGovernorRow[] = [];
  for (const row of html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    // Older rows link the legacy host (`http://www.lrl.state.tx.us/scanned/…`, raw spaces).
    const link = /<a\s+href="(?:https?:\/\/(?:www\.)?lrl\.(?:state\.tx\.us|texas\.gov))?(\/scanned\/govdocs\/[^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/i.exec(row[1]);
    if (!link) continue;
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => clean(cell[1]));
    const date = cells[2] ? mdyToIso(cells[2]) : undefined;
    if (!date) continue;
    const title = clean(link[2]);
    rows.push({
      url: `${LRL_ORIGIN}${encodeURI(decodeURI(link[1]))}`,
      title,
      orderId: /\b(?:Executive Order|Proclamation)\s+([A-Z]{1,3}-?\d+)/i.exec(title)?.[1],
      author: cells[1] ?? "",
      date,
      session: cells[3] ?? "",
    });
  }
  return rows;
}

function orderPattern(orderId: string): RegExp {
  const [, prefix, number] = /^([A-Z]+)-?(\d+)$/i.exec(orderId) ?? [];
  // OCR output often drops the hyphen or pads digits, so match loosely.
  return new RegExp(`${prefix}\\W{0,2}0*${Number(number)}\\b`, "i");
}

/**
 * Governor executive orders from the Legislative Reference Library's governor documents catalog
 * (https://lrl.texas.gov/legeLeaders/governors/search.cfm). The gov.texas.gov order index is
 * script-rendered; LRL lists every order with number, caption, date and the scanned PDF.
 * The catalog row is the source of the date and caption (the scanned PDFs are OCR and often
 * garbled); a PDF that reads as the same order is attached as extra provenance.
 */
export const lrlGovernorOrdersAdapter: RecordsAdapter = {
  kind: "lrl-governor-orders",
  async collect(context: AdapterContext, value: unknown): Promise<AdapterResult> {
    const parsed = configSchema.safeParse(value);
    if (!parsed.success) {
      return { actions: [], status: "needs_review", reason: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const config = collectionConfig(parsed.data, context);
    if (config.tenure.candidateId !== context.request.candidate.id) {
      return { actions: [], status: "needs_review", reason: "tenure.candidateId must match the request candidate ID" };
    }

    const searchUrl = lrlGovernorSearchUrl(config.authorId, config.docType);
    const listing: Snapshot = await context.client.get(searchUrl, { format: "html" });
    const plain = htmlToPlainText(listing.text);
    const rows = parseLrlGovernorDocuments(listing.text);
    if (rows.length === 0) {
      return { actions: [], status: "needs_review", reason: "The LRL governor documents search returned no parseable rows." };
    }

    const problems: string[] = [];
    const actions: OfficialAction[] = [];
    let pdfAttached = 0;
    let considered = 0;
    const wanted = normalizeName(config.authorName);

    for (const row of rows) {
      if (normalizeName(row.author) !== wanted) {
        problems.push(`Row author "${row.author}" is not ${config.authorName}: ${row.title.slice(0, 60)}`);
        continue;
      }
      if (row.date < config.tenure.start || (config.tenure.end && row.date > config.tenure.end)) continue; // out of tenure
      if (!inWindow(row.date, context.window)) continue;
      if (++considered > config.maxDocuments) break;

      let at = plain.indexOf(row.title);
      // Plain-text conversion can differ from the cleaned title in entities/spacing; the order label is stable.
      if (at < 0 && row.orderId) at = plain.indexOf(row.title.slice(0, row.title.indexOf(row.orderId) + row.orderId.length));
      if (at < 0) {
        problems.push(`Could not locate catalog row text for ${row.orderId ?? row.title.slice(0, 40)}.`);
        continue;
      }
      const dateAt = plain.indexOf(row.date.slice(5, 7) + "/" + row.date.slice(8, 10) + "/" + row.date.slice(0, 4), at);
      const end = dateAt >= 0 ? dateAt + 10 : at + row.title.length;
      const refs = [provenance(listing, adapterVersion, textSpanLocator(at, end))];
      let sourceUrl = listing.sourceUrl;
      let extraction: OfficialAction["extraction"] = "html";

      if (config.fetchDocuments) {
        try {
          const pdf = await context.client.get(row.url, { format: "pdf" });
          const hit = row.orderId ? orderPattern(row.orderId).exec(pdf.text) : undefined;
          if (hit && /executive\s+order|proclamation/i.test(pdf.text)) {
            refs.push(provenance(pdf, adapterVersion, textSpanLocator(hit.index, hit.index + hit[0].length)));
            sourceUrl = pdf.sourceUrl;
            extraction = "pdf";
            pdfAttached++;
          }
        } catch { /* a missing or unreadable scan leaves the catalog row as the only provenance */ }
      }

      actions.push({
        id: `gov-eo:${createHash("sha256").update(JSON.stringify([context.request.candidate.id, row.orderId ?? row.title, row.date])).digest("hex")}`,
        actorId: context.request.candidate.id,
        issueIds: [],
        role: config.role,
        body: "Office of the Governor of Texas",
        type: "executive_order",
        stance: "n/a",
        date: row.date,
        title: row.title,
        officialText: row.title,
        sourceUrl,
        extraction,
        dateBasis: "document_date",
        attribution: {
          method: "office_tenure",
          tenure: { start: config.tenure.start, end: config.tenure.end, sourceUrl: config.tenure.sourceUrl },
        },
        provenance: refs,
      });
    }

    return {
      actions,
      status: actions.length === 0 ? "needs_review" : problems.length ? "partial" : "complete",
      reason: `${actions.length} executive order(s) from the LRL governor documents catalog for ${config.authorName} (${pdfAttached} with a matching scanned PDF attached).${problems.length ? ` ${problems.length} issue(s): ${problems.slice(0, 3).join(" ")}` : ""}`,
    };
  },
};
