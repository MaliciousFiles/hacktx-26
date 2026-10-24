import { createHash } from "node:crypto";
import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { AdapterContext, AdapterResult, RecordsAdapter } from "../adapters";
import { htmlToPlainText, textSpanLocator } from "../document";
import { inWindow, isoDate, provenance } from "../model";

const adapterVersion = "tlo-bill-analysis/v1";

const configSchema = z.object({
  urls: z.array(z.string().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && (
      url.hostname.endsWith("capitol.texas.gov") ||
      url.hostname.endsWith("legis.texas.gov") ||
      url.hostname.endsWith("hro.house.texas.gov") ||
      url.hostname.endsWith("senate.texas.gov")
    );
  }, "Official analysis host required")).min(1),
  role: z.string().trim().min(1),
  bill: z.string().trim().min(1),
  /** Civil date of the analysis version when printed; required — never invent from fetch time. */
  analysisDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memberCandidateId: z.string().trim().min(1),
}).strict();

/**
 * Pull official bill-analysis / fiscal-note prose as authored context.
 * Not a vote. Date must be supplied from the document's printed version date
 * (or a verified accompanying index), never wall-clock.
 */
export const tloBillAnalysisAdapter: RecordsAdapter = {
  kind: "tlo-bill-analysis",
  async collect(context: AdapterContext, value: unknown): Promise<AdapterResult> {
    const parsed = configSchema.safeParse(value);
    if (!parsed.success) {
      return { actions: [], status: "needs_review", reason: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const config = parsed.data;
    if (config.memberCandidateId !== context.request.candidate.id) {
      return { actions: [], status: "needs_review", reason: "memberCandidateId must match the request candidate ID" };
    }
    const date = isoDate(config.analysisDate);
    if (!inWindow(date, context.window)) {
      return { actions: [], status: "complete", reason: "Configured analysis date is outside the collection window" };
    }

    const actions: OfficialAction[] = [];
    const problems: string[] = [];
    for (const url of config.urls) {
      try {
        const snapshot = await context.client.get(url, { format: "html" });
        const plain = htmlToPlainText(snapshot.text);
        if (plain.length < 80) throw new Error("Analysis text too short to be a bill analysis");
        // Prefer an explicit BILL ANALYSIS heading when present; otherwise whole body.
        const heading = /bill analysis/i.exec(plain);
        const start = heading ? heading.index : 0;
        const body = plain.slice(start).trim();
        const excerpt = body.slice(0, 4000);
        const id = `tlo-analysis:${createHash("sha256").update(JSON.stringify([
          config.bill, url, context.request.candidate.id, date,
        ])).digest("hex")}`;
        actions.push({
          id,
          actorId: context.request.candidate.id,
          issueIds: [],
          role: config.role,
          body: "Texas Legislature",
          type: "authored",
          stance: "author",
          date,
          title: `${config.bill} bill analysis`,
          officialText: excerpt,
          sourceUrl: snapshot.sourceUrl,
          extraction: "html",
          dateBasis: "document_date",
          attribution: { method: "named_record", sourceActorId: config.bill },
          provenance: [
            provenance(snapshot, adapterVersion, textSpanLocator(start, start + Math.min(body.length, 4000))),
          ],
        });
      } catch (error) {
        problems.push(error instanceof Error ? error.message : "Analysis fetch failed");
      }
    }
    return {
      actions,
      status: problems.length ? (actions.length ? "partial" : "needs_review") : "complete",
      reason: problems.length ? problems.join(" ") : `Loaded ${actions.length} official analysis document(s).`,
    };
  },
};
