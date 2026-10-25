import { createHash } from "node:crypto";
import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { AdapterContext, AdapterResult, RecordsAdapter } from "../adapters";
import { htmlToPlainText, textSpanLocator, uniqueSpan } from "../document";
import { inWindow, normalizeName, provenance } from "../model";
import { headingDateFromText, hostAllowed, officialHttps, signedDateFromText, tenureSchema } from "./shared";

const adapterVersion = "texas-register/v1";

const configSchema = z.object({
  urls: z.array(officialHttps).min(1),
  role: z.string().trim().min(1),
  /** Section heading that must appear, e.g. "The Governor" or "Attorney General". */
  section: z.string().trim().min(1),
  /** Actor name that must appear in the section body. */
  actorLabels: z.array(z.string().trim().min(1)).min(1),
  memberCandidateId: z.string().trim().min(1),
  /** Required: these are acts of an office holder (appointments, orders), so a
   * name appearing in the section is not enough to attribute them. */
  tenure: tenureSchema,
  actionType: z.enum([
    "executive_order", "legal_opinion", "appointment", "signed", "rule_vote",
  ]).default("appointment"),
}).strict();

/**
 * Texas Register issue HTML sections. Agency notices without a named actor are
 * withheld. Tenure is required for officeholder-attributed acts.
 */
export const texasRegisterAdapter: RecordsAdapter = {
  kind: "texas-register",
  async collect(context: AdapterContext, value: unknown): Promise<AdapterResult> {
    const parsed = configSchema.safeParse(value);
    if (!parsed.success) {
      return { actions: [], status: "needs_review", reason: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    const config = parsed.data;
    if (config.memberCandidateId !== context.request.candidate.id) {
      return { actions: [], status: "needs_review", reason: "memberCandidateId must match the request candidate ID" };
    }
    if (config.tenure && config.tenure.candidateId !== context.request.candidate.id) {
      return { actions: [], status: "needs_review", reason: "tenure.candidateId must match the request candidate ID" };
    }

    const labels = new Set(config.actorLabels.map(normalizeName));
    const actions: OfficialAction[] = [];
    const problems: string[] = [];

    for (const url of config.urls) {
      if (!hostAllowed(url, ["sos.state.tx.us", "sos.texas.gov", "texas.gov"])) {
        problems.push(`Host not on Texas Register allowlist: ${url}`);
        continue;
      }
      try {
        const snapshot = await context.client.get(url, { format: "html" });
        const plain = htmlToPlainText(snapshot.text);
        const sectionRe = new RegExp(config.section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        const sectionHit = sectionRe.exec(plain);
        if (!sectionHit) {
          problems.push(`Section "${config.section}" not found in ${url}`);
          continue;
        }
        const body = plain.slice(sectionHit.index, sectionHit.index + 8000);
        // Whole-word, exactly printed label. A substring match would also hit
        // mentions like "appointed by Governor X" in someone else's entry.
        const actor = config.actorLabels.find((label) =>
          new RegExp(`(?<![\\p{L}])${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "u").test(body),
        );
        if (!actor || !labels.has(normalizeName(actor))) {
          problems.push(`Named actor not present in ${config.section} section`);
          continue;
        }
        // Heading/signing date only; the first date in a section can be a term
        // expiration ("for a term to expire February 1, 2031") or a recital.
        const date = headingDateFromText(body, "Appointments?") ?? signedDateFromText(body);
        if (!date) {
          problems.push(`No heading or signing date in ${config.section}`);
          continue;
        }
        if (date < config.tenure.start || (config.tenure.end && date > config.tenure.end)) {
          problems.push(`Register date ${date} outside verified tenure`);
          continue;
        }
        if (!inWindow(date, context.window)) continue;

        const actorSpan = uniqueSpan(body, actor);
        actions.push({
          id: `txreg:${createHash("sha256").update(JSON.stringify([
            url, context.request.candidate.id, date, config.section, actor,
          ])).digest("hex")}`,
          actorId: context.request.candidate.id,
          issueIds: [],
          role: config.role,
          body: "Texas Register",
          type: config.actionType,
          stance: "n/a",
          date,
          title: `Texas Register — ${config.section}`,
          officialText: body.slice(0, 3000),
          sourceUrl: snapshot.sourceUrl,
          extraction: "html",
          dateBasis: "document_date",
          attribution: config.tenure
            ? {
                method: "office_tenure",
                tenure: {
                  start: config.tenure.start,
                  end: config.tenure.end,
                  sourceUrl: config.tenure.sourceUrl,
                },
              }
            : { method: "named_record", sourceActorId: actor },
          provenance: [
            provenance(snapshot, adapterVersion, textSpanLocator(
              sectionHit.index + actorSpan.start,
              sectionHit.index + actorSpan.end,
            )),
          ],
        });
      } catch (error) {
        problems.push(error instanceof Error ? error.message : "Texas Register fetch failed");
      }
    }

    return {
      actions,
      status: problems.length ? (actions.length ? "partial" : "needs_review") : "complete",
      reason: problems.length ? problems.slice(0, 5).join(" ") : `Attributed ${actions.length} Texas Register item(s).`,
    };
  },
};
