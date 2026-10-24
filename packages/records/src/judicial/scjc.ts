import { createHash } from "node:crypto";
import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { AdapterContext, AdapterResult, RecordsAdapter } from "../adapters";
import { htmlToPlainText, textSpanLocator, uniqueSpan } from "../document";
import { inWindow, isoDate, normalizeName, provenance } from "../model";

const adapterVersion = "scjc-sanctions/v1";

const configSchema = z.object({
  urls: z.array(z.string().url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && (
      url.hostname.endsWith("scjc.texas.gov") ||
      url.hostname.endsWith("txcourts.gov")
    );
  })).min(1),
  role: z.string().trim().min(1).default("Texas judge"),
  /** Exact subject name as printed on the sanction/order page. */
  subjectNames: z.array(z.string().trim().min(1)).min(1),
  memberCandidateId: z.string().trim().min(1),
}).strict();

/**
 * State Commission on Judicial Conduct — only when the candidate is the named
 * subject of an official public sanction/order. No inference from docket noise.
 */
export const scjcSanctionsAdapter: RecordsAdapter = {
  kind: "scjc-sanctions",
  async collect(context: AdapterContext, value: unknown): Promise<AdapterResult> {
    const parsed = configSchema.safeParse(value);
    if (!parsed.success) {
      return { actions: [], status: "needs_review", reason: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const config = parsed.data;
    if (config.memberCandidateId !== context.request.candidate.id) {
      return { actions: [], status: "needs_review", reason: "memberCandidateId must match the request candidate ID" };
    }

    const names = new Set(config.subjectNames.map(normalizeName));
    const actions: OfficialAction[] = [];
    const problems: string[] = [];

    for (const url of config.urls) {
      try {
        const isPdf = /\.pdf$/i.test(url);
        const snapshot = await context.client.get(url, { format: isPdf ? "pdf" : "html" });
        const plain = isPdf ? snapshot.text : htmlToPlainText(snapshot.text);
        const named = config.subjectNames.find((name) => plain.toLocaleLowerCase("en-US").includes(normalizeName(name)));
        if (!named || !names.has(normalizeName(named))) {
          continue;
        }
        if (!/(sanction|public\s+(warning|admonition|reprimand)|order\s+of\s+(suspension|removal))/i.test(plain)) {
          problems.push(`Page does not contain an explicit sanction/order marker: ${url}`);
          continue;
        }
        const dated = plain.match(
          /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i,
        );
        if (!dated) {
          problems.push(`Sanction page lacks a civil date: ${url}`);
          continue;
        }
        const months: Record<string, string> = {
          january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
          july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
        };
        const date = isoDate(`${dated[3]}-${months[dated[1].toLowerCase()]}-${dated[2].padStart(2, "0")}`);
        if (!inWindow(date, context.window)) continue;
        const nameSpan = uniqueSpan(plain, named);
        const id = `scjc:${createHash("sha256").update(JSON.stringify([
          url, context.request.candidate.id, date, named,
        ])).digest("hex")}`;
        actions.push({
          id,
          actorId: context.request.candidate.id,
          issueIds: [],
          role: config.role,
          body: "State Commission on Judicial Conduct",
          type: "legal_opinion",
          stance: "n/a",
          date,
          title: `SCJC matter involving ${named}`,
          officialText: plain.slice(Math.max(0, nameSpan.start - 120), nameSpan.end + 400).trim(),
          sourceUrl: snapshot.sourceUrl,
          extraction: isPdf ? "pdf" : "html",
          dateBasis: "document_date",
          attribution: { method: "named_record", sourceActorId: named },
          provenance: [
            provenance(snapshot, adapterVersion, nameSpan.locator),
            provenance(snapshot, adapterVersion, textSpanLocator(dated.index!, dated.index! + dated[0].length)),
          ],
        });
      } catch (error) {
        problems.push(error instanceof Error ? error.message : "SCJC document failed");
      }
    }

    return {
      actions,
      status: problems.length ? (actions.length ? "partial" : "needs_review") : "complete",
      reason: problems.length
        ? problems.slice(0, 5).join(" ")
        : `Attributed ${actions.length} SCJC sanction/order document(s).`,
    };
  },
};
