import { createHash } from "node:crypto";
import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { AdapterContext, AdapterResult, RecordsAdapter } from "../adapters";
import { inWindow, provenance } from "../model";
import { findJusticeAttribution, opinionDateFromText } from "./shared";

const adapterVersion = "tames-opinions/v1";

const configSchema = z.object({
  urls: z.array(z.string().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && (
      url.hostname.endsWith("txcourts.gov") ||
      url.hostname.endsWith("search.txcourts.gov")
    );
  })).min(1),
  role: z.string().trim().min(1),
  body: z.string().trim().min(1).default("Texas Court of Appeals"),
  justiceLabels: z.array(z.string().trim().min(1)).min(1),
  memberCandidateId: z.string().trim().min(1),
}).strict();

/**
 * Official TAMES / search.txcourts.gov media PDFs and index HTML.
 * Author attribution requires an explicit byline in the opinion text.
 */
export const tamesOpinionsAdapter: RecordsAdapter = {
  kind: "tames-opinions",
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
    const indexUrls: string[] = [];

    for (const url of config.urls) {
      if (/\.pdf$/i.test(url) || /SearchMedia\.aspx/i.test(url)) pdfUrls.add(url);
      else indexUrls.push(url);
    }

    for (const url of indexUrls) {
      try {
        const snapshot = await context.client.get(url, { format: "html" });
        for (const hit of snapshot.text.matchAll(/href=["']([^"']*SearchMedia\.aspx\?[^"']+)["']/gi)) {
          const absolute = new URL(hit[1].replace(/&amp;/g, "&"), snapshot.sourceUrl);
          if (absolute.protocol === "https:" && absolute.hostname.endsWith("txcourts.gov")) {
            pdfUrls.add(absolute.toString());
          }
        }
      } catch (error) {
        problems.push(error instanceof Error ? error.message : "TAMES index failed");
      }
    }

    for (const pdfUrl of pdfUrls) {
      try {
        const snapshot = await context.client.get(pdfUrl, { format: "pdf" });
        const attribution = findJusticeAttribution(snapshot.text, config.justiceLabels);
        if (!attribution) continue;
        const date = opinionDateFromText(snapshot.text);
        if (!date) {
          problems.push(`No opinion date in ${pdfUrl}`);
          continue;
        }
        if (!inWindow(date, context.window)) continue;
        const id = `tames:${createHash("sha256").update(JSON.stringify([
          pdfUrl, context.request.candidate.id, attribution.kind, date,
        ])).digest("hex")}`;
        actions.set(id, {
          id,
          actorId: context.request.candidate.id,
          issueIds: [],
          role: config.role,
          body: config.body,
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
        problems.push(error instanceof Error ? error.message : "TAMES document failed");
      }
    }

    return {
      actions: [...actions.values()],
      status: problems.length ? (actions.size ? "partial" : "needs_review") : "complete",
      reason: problems.length
        ? problems.slice(0, 5).join(" ")
        : `Attributed ${actions.size} TAMES opinion/order document(s).`,
    };
  },
};
