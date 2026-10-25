import { createHash } from "node:crypto";
import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { AdapterContext, AdapterResult, RecordsAdapter } from "../adapters";
import { htmlToPlainText, textSpanLocator } from "../document";
import { inWindow, provenance } from "../model";
import { hostAllowed, officialHttps, parseHeaderDate, tenureSchema } from "./shared";

const adapterVersion = "ag-opinions/v1";
const HEADER_CHARS = 1200;

const configSchema = z.object({
  urls: z.array(officialHttps).min(1),
  role: z.string().trim().min(1).default("Texas Attorney General"),
  /** Office tenure required — AG opinions are officeholder acts, not personal floor votes. */
  tenure: tenureSchema,
  /** Optional opinion number printed in the document, e.g. "KP-0001". */
  opinionId: z.string().trim().min(1).optional(),
}).strict();

/**
 * Official AG opinion HTML/PDF. Press releases are not accepted as proof.
 * Attribution is office_tenure only when the document is an AG opinion/order
 * and the action date falls inside verified tenure.
 */
export const agOpinionsAdapter: RecordsAdapter = {
  kind: "ag-opinions",
  async collect(context: AdapterContext, value: unknown): Promise<AdapterResult> {
    const parsed = configSchema.safeParse(value);
    if (!parsed.success) {
      return { actions: [], status: "needs_review", reason: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const config = parsed.data;
    if (config.tenure.candidateId !== context.request.candidate.id) {
      return { actions: [], status: "needs_review", reason: "tenure.candidateId must match the request candidate ID" };
    }

    const actions: OfficialAction[] = [];
    const problems: string[] = [];

    for (const url of config.urls) {
      if (!hostAllowed(url, ["texasattorneygeneral.gov", "texas.gov", "sos.state.tx.us"])) {
        problems.push(`Host not on AG/official allowlist: ${url}`);
        continue;
      }
      try {
        const isPdf = /\.pdf$/i.test(url);
        const snapshot = await context.client.get(url, { format: isPdf ? "pdf" : "html" });
        const plain = isPdf ? snapshot.text : htmlToPlainText(snapshot.text);
        if (!/attorney\s+general|opinion\s+no\.?|kp-\d+/i.test(plain)) {
          problems.push(`Document does not look like an AG opinion: ${url}`);
          continue;
        }
        if (/press\s+release/i.test(plain) && !/opinion/i.test(plain.slice(0, 500))) {
          problems.push(`Press release rejected as AG opinion proof: ${url}`);
          continue;
        }
        // The date is the letter's header; later dates in the body cite statutes and earlier opinions.
        const folderYear = /\/opinion\/(\d{4})\//.exec(new URL(url).pathname)?.[1];
        const date = parseHeaderDate(plain.slice(0, HEADER_CHARS), folderYear ? Number(folderYear) : undefined);
        if (!date) {
          problems.push(`No printed date in ${url}`);
          continue;
        }
        if (date < config.tenure.start || (config.tenure.end && date > config.tenure.end)) {
          problems.push(`Opinion date ${date} outside verified AG tenure`);
          continue;
        }
        if (!inWindow(date, context.window)) continue;

        const fromUrl = /\/([a-z]{2})-?(\d{3,5})\.pdf$/i.exec(new URL(url).pathname);
        const idMarker = config.opinionId
          ?? (fromUrl ? `${fromUrl[1].toUpperCase()}-${fromUrl[2]}` : undefined)
          ?? plain.match(/\bKP-\d+\b/i)?.[0]
          ?? plain.match(/Opinion\s+No\.?\s*([A-Z0-9-]+)/i)?.[0]
          ?? "opinion";
        const markerAt = plain.toLowerCase().indexOf(idMarker.toLowerCase());
        const locator = markerAt >= 0
          ? textSpanLocator(markerAt, markerAt + idMarker.length)
          : textSpanLocator(0, Math.min(120, plain.length));

        actions.push({
          id: `ag:${createHash("sha256").update(JSON.stringify([url, context.request.candidate.id, date, idMarker])).digest("hex")}`,
          actorId: context.request.candidate.id,
          issueIds: [],
          role: config.role,
          body: "Office of the Attorney General of Texas",
          type: "legal_opinion",
          stance: "n/a",
          date,
          title: `AG ${idMarker}`,
          officialText: plain.slice(0, 4000),
          sourceUrl: snapshot.sourceUrl,
          extraction: isPdf ? "pdf" : "html",
          dateBasis: "document_date",
          attribution: {
            method: "office_tenure",
            tenure: {
              start: config.tenure.start,
              end: config.tenure.end,
              sourceUrl: config.tenure.sourceUrl,
            },
          },
          provenance: [provenance(snapshot, adapterVersion, locator)],
        });
      } catch (error) {
        problems.push(error instanceof Error ? error.message : "AG document failed");
      }
    }

    return {
      actions,
      status: problems.length ? (actions.length ? "partial" : "needs_review") : "complete",
      reason: problems.length ? problems.slice(0, 5).join(" ") : `Attributed ${actions.length} AG opinion(s).`,
    };
  },
};
