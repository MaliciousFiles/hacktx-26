import { createHash } from "node:crypto";
import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { AdapterContext, AdapterResult, RecordsAdapter } from "../adapters";
import { htmlToPlainText, textSpanLocator } from "../document";
import { inWindow, provenance } from "../model";
import { findJusticeAttribution, opinionDateFromText } from "./shared";

const adapterVersion = "scotx-orders/v1";

const configSchema = z.object({
  /** Orders & Opinions index pages and/or direct official opinion PDF URLs. */
  urls: z.array(z.string().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && (
      url.hostname.endsWith("txcourts.gov") ||
      url.hostname.endsWith("search.txcourts.gov")
    );
  })).min(1),
  role: z.string().trim().min(1).default("Justice, Supreme Court of Texas"),
  /** Exact author/dissent/concurrence surname or byline as printed, e.g. "Blacklock". */
  justiceLabels: z.array(z.string().trim().min(1)).min(1),
  memberCandidateId: z.string().trim().min(1),
}).strict();

export interface ScotxOpinionLink {
  href: string;
  label: string;
  locator: string;
}

/** Deterministic discovery of PDF/HTML opinion links from a SCOTX index page. */
export function parseScotxIndex(html: string, pageUrl: string): ScotxOpinionLink[] {
  const links: ScotxOpinionLink[] = [];
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const href = match[1];
    const label = htmlToPlainText(match[2]).trim();
    if (!label) continue;
    let absolute: URL;
    try { absolute = new URL(href, pageUrl); } catch { continue; }
    if (absolute.protocol !== "https:") continue;
    if (!absolute.hostname.endsWith("txcourts.gov") && !absolute.hostname.endsWith("search.txcourts.gov")) continue;
    const path = absolute.pathname.toLowerCase();
    if (!/\.pdf$/i.test(path) && !/opinion|order|SearchMedia/i.test(absolute.href + label)) continue;
    links.push({
      href: absolute.toString(),
      label,
      locator: textSpanLocator(match.index, match.index + match[0].length),
    });
  }
  return links;
}

export const scotxOrdersAdapter: RecordsAdapter = {
  kind: "scotx-orders",
  async collect(context: AdapterContext, value: unknown): Promise<AdapterResult> {
    const parsed = configSchema.safeParse(value);
    if (!parsed.success) {
      return { actions: [], status: "needs_review", reason: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const config = parsed.data;
    if (config.memberCandidateId !== context.request.candidate.id) {
      return { actions: [], status: "needs_review", reason: "memberCandidateId must match the request candidate ID" };
    }

    const actions = new Map<string, OfficialAction>();
    const problems: string[] = [];
    const pdfUrls = new Set<string>();

    for (const url of config.urls) {
      try {
        if (/\.pdf$/i.test(url) || /SearchMedia\.aspx/i.test(url)) {
          pdfUrls.add(url);
          continue;
        }
        const snapshot = await context.client.get(url, { format: "html" });
        for (const link of parseScotxIndex(snapshot.text, snapshot.sourceUrl)) {
          if (/\.pdf$/i.test(link.href) || /SearchMedia/i.test(link.href)) pdfUrls.add(link.href);
        }
      } catch (error) {
        problems.push(error instanceof Error ? error.message : "SCOTX index failed");
      }
    }

    for (const pdfUrl of [...pdfUrls]) {
      try {
        const snapshot = await context.client.get(pdfUrl, { format: "pdf" });
        const attribution = findJusticeAttribution(snapshot.text, config.justiceLabels);
        if (!attribution) continue;
        const date = opinionDateFromText(snapshot.text);
        if (!date) {
          problems.push(`No dated line in ${pdfUrl}`);
          continue;
        }
        if (!inWindow(date, context.window)) continue;
        const id = `scotx:${createHash("sha256").update(JSON.stringify([
          pdfUrl, context.request.candidate.id, attribution.kind, date,
        ])).digest("hex")}`;
        actions.set(id, {
          id,
          actorId: context.request.candidate.id,
          issueIds: [],
          role: config.role,
          body: "Supreme Court of Texas",
          type: "judicial_opinion",
          stance: "n/a",
          date,
          title: `${attribution.kind}: ${attribution.span}`,
          officialText: attribution.span,
          sourceUrl: snapshot.sourceUrl,
          extraction: "pdf",
          dateBasis: "document_date",
          attribution: { method: "named_record", sourceActorId: attribution.label },
          provenance: [provenance(snapshot, adapterVersion, attribution.locator)],
        });
      } catch (error) {
        problems.push(error instanceof Error ? error.message : "Opinion PDF failed");
      }
    }

    return {
      actions: [...actions.values()],
      status: problems.length ? (actions.size ? "partial" : "needs_review") : "complete",
      reason: problems.length
        ? problems.slice(0, 5).join(" ")
        : `Attributed ${actions.size} SCOTX opinion/order document(s).`,
    };
  },
};
