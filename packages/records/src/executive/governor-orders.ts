import { createHash } from "node:crypto";
import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { AdapterContext, AdapterResult, RecordsAdapter } from "../adapters";
import { htmlToPlainText, textSpanLocator } from "../document";
import { inWindow, provenance } from "../model";
import { hostAllowed, officialHttps, parsePrintedDate, tenureSchema } from "./shared";

const adapterVersion = "governor-orders/v1";

const configSchema = z.object({
  urls: z.array(officialHttps).min(1),
  role: z.string().trim().min(1).default("Governor of Texas"),
  tenure: tenureSchema,
}).strict();

/**
 * Governor executive orders / proclamations from official gov.texas.gov (or
 * LRL-linked official PDFs). A dated order is not a yes/no vote.
 */
export const governorOrdersAdapter: RecordsAdapter = {
  kind: "governor-orders",
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
      if (!hostAllowed(url, ["gov.texas.gov", "lrl.texas.gov", "texas.gov"])) {
        problems.push(`Host not on governor/official allowlist: ${url}`);
        continue;
      }
      try {
        const isPdf = /\.pdf$/i.test(url);
        const snapshot = await context.client.get(url, { format: isPdf ? "pdf" : "html" });
        const plain = isPdf ? snapshot.text : htmlToPlainText(snapshot.text);
        if (!/executive\s+order|proclamation|by\s+the\s+governor/i.test(plain)) {
          problems.push(`Document is not an executive order/proclamation: ${url}`);
          continue;
        }
        const date = parsePrintedDate(plain);
        if (!date) {
          problems.push(`No printed date in ${url}`);
          continue;
        }
        if (date < config.tenure.start || (config.tenure.end && date > config.tenure.end)) {
          problems.push(`Order date ${date} outside verified governor tenure`);
          continue;
        }
        if (!inWindow(date, context.window)) continue;

        const titleHit = plain.match(/Executive\s+Order\s+[A-Z0-9-]+|Proclamation(?:\s+No\.?\s*[A-Z0-9-]+)?/i);
        const title = titleHit?.[0] ?? "Governor executive order";
        const at = titleHit?.index ?? 0;
        actions.push({
          id: `gov-eo:${createHash("sha256").update(JSON.stringify([url, context.request.candidate.id, date, title])).digest("hex")}`,
          actorId: context.request.candidate.id,
          issueIds: [],
          role: config.role,
          body: "Office of the Governor of Texas",
          type: "executive_order",
          stance: "n/a",
          date,
          title,
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
          provenance: [provenance(snapshot, adapterVersion, textSpanLocator(at, at + title.length))],
        });
      } catch (error) {
        problems.push(error instanceof Error ? error.message : "Governor document failed");
      }
    }

    return {
      actions,
      status: problems.length ? (actions.length ? "partial" : "needs_review") : "complete",
      reason: problems.length ? problems.slice(0, 5).join(" ") : `Attributed ${actions.length} governor order(s).`,
    };
  },
};
