import type { OfficialAction } from "@ftb/types";
import { z } from "zod";
import type { RecordsAdapter } from "../adapters";
import { inWindow, isoDate, provenance } from "../model";
import { parseXml, xmlText } from "../xml";
import { addAction, bioguide, many, memberId, positiveCount, result, sourceConfig, text, unresolvedIdentity } from "./shared";

export const govinfoBillstatusConfigSchema = sourceConfig(["www.govinfo.gov", "govinfo.gov", "api.govinfo.gov"]);
export type GovinfoBillstatusConfig = z.infer<typeof govinfoBillstatusConfigSchema>;

const date = text.transform(isoDate);
const personSchema = z.object({
  bioguideId: bioguide.optional(), identifiers: z.object({ bioguideId: bioguide }).optional(),
  sponsorshipDate: date.optional(), sponsorshipWithdrawnDate: date.optional(),
  isByRequest: z.enum(["Y", "N", "true", "false", "1", "0"]).optional(),
  byRequestType: xmlText.optional(),
}).refine((person) => Boolean(person.bioguideId ?? person.identifiers?.bioguideId), "Missing sponsor Bioguide ID")
  .refine((person) => !person.bioguideId || !person.identifiers || person.bioguideId === person.identifiers.bioguideId,
    "Conflicting sponsor Bioguide IDs")
  .transform((person) => ({
    id: (person.bioguideId ?? person.identifiers!.bioguideId),
    sponsorshipDate: person.sponsorshipDate, withdrawnDate: person.sponsorshipWithdrawnDate,
    byRequest: ["Y", "true", "1"].includes(person.isByRequest ?? "")
      || Boolean(person.byRequestType && !/^(no|n|false|0)$/i.test(person.byRequestType)),
  }));
const emptyContainer = (value: unknown) => value === "" || value === undefined || value === null ? {} : value;
const peopleSchema = z.preprocess(emptyContainer, z.object({ item: many(personSchema) }));
const actionSchema = z.object({ actionDate: date, text: text });
const actionsSchema = z.preprocess(emptyContainer, z.object({
  item: many(actionSchema), actions: z.object({ item: many(actionSchema) }).optional(),
}));
const billSchema = z.object({
  congress: positiveCount, number: positiveCount,
  type: z.enum(["HR", "S", "HJRES", "SJRES", "HCONRES", "SCONRES", "HRES", "SRES"]),
  introducedDate: date, title: text,
  sponsors: peopleSchema, cosponsors: peopleSchema, actions: actionsSchema,
  titles: z.preprocess(emptyContainer, z.object({ item: many(z.object({
    title: text, titleType: xmlText.optional(), titleTypeCode: xmlText.optional(), billTextVersionCode: xmlText.optional(),
  })) })),
});

export function parseGovinfoBillstatus(xml: string) {
  const root = z.object({ bill: billSchema }).parse(parseXml(xml, "billStatus").billStatus);
  const bill = root.bill;
  if (bill.sponsors.item.length > 1) throw new Error("Multiple primary sponsors require review");
  const seen = new Set<string>();
  for (const person of [...bill.sponsors.item, ...bill.cosponsors.item]) {
    if (seen.has(person.id)) throw new Error(`Duplicate sponsor/cosponsor ID: ${person.id}`);
    seen.add(person.id);
    if (person.sponsorshipDate && person.sponsorshipDate < bill.introducedDate) {
      throw new Error("Sponsorship date precedes bill introduction");
    }
    if (person.withdrawnDate && person.sponsorshipDate && person.withdrawnDate < person.sponsorshipDate) {
      throw new Error("Cosponsorship withdrawal precedes sponsorship");
    }
  }
  // Prefer the explicitly introduced title to the latest enacted/display title.
  const introducedTitle = bill.titles.item.find((title) => title.titleTypeCode === "6"
    || title.titleType === "Official Title as Introduced")
    ?? bill.titles.item.find((title) => ["IH", "IS"].includes(title.billTextVersionCode ?? ""));
  const titleIndex = introducedTitle ? bill.titles.item.indexOf(introducedTitle) : -1;
  return {
    ...bill, title: introducedTitle?.title ?? bill.title,
    titleLocator: titleIndex >= 0 ? `/billStatus/bill/titles/item[${titleIndex + 1}]/title` : "/billStatus/bill/title",
    contexts: [
      ...bill.actions.item.map((action, index) => ({ ...action, locator: `/billStatus/bill/actions/item[${index + 1}]` })),
      ...(bill.actions.actions?.item ?? []).map((action, index) => ({ ...action, locator: `/billStatus/bill/actions/actions/item[${index + 1}]` })),
    ],
    // Summaries (billSummaries/item, item, or summary) and recordedVotes are
    // intentionally NOT projected: latest summaries are not historical bill
    // versions, and aggregate vote links do not establish any member's vote.
  };
}

export const govinfoBillstatusAdapter: RecordsAdapter = {
  kind: "govinfo-billstatus",
  async collect(context, config) {
    const options = govinfoBillstatusConfigSchema.parse(config);
    const id = memberId(context);
    if (!id) return unresolvedIdentity();
    const actions = new Map<string, OfficialAction>();
    const warnings = new Set<string>();
    for (const url of [...new Set(options.urls)].sort()) {
      const snapshot = await context.client.get(url, { format: "xml", root: "billStatus" });
      const bill = parseGovinfoBillstatus(snapshot.text);
      let matched = false;
      const body = bill.type.startsWith("H") ? "U.S. House of Representatives" : "U.S. Senate";
      for (const [kind, people] of [["authored", bill.sponsors.item], ["cosponsored", bill.cosponsors.item]] as const) {
        const index = people.findIndex((person) => person.id === id);
        if (index < 0) continue;
        matched = true;
        const person = people[index];
        // A primary sponsor is documented at introduction; later cosponsors
        // require their actual accession date, even if isOriginalCosponsor says Y.
        const actionDate = kind === "authored" ? bill.introducedDate : person.sponsorshipDate;
        if (!actionDate) {
          warnings.add("A matching cosponsor has no sponsorshipDate; no introduction date was substituted.");
          continue;
        }
        if (!inWindow(actionDate, context.window)) continue;
        if (person.byRequest) warnings.add("By-request sponsorship is recorded as a procedural act, not assumed personal support.");
        if (person.withdrawnDate && person.withdrawnDate < context.window.before) {
          warnings.add(`Cosponsorship withdrawal is documented on ${person.withdrawnDate}; the historical sponsorship is not continuing support.`);
        }
        const container = kind === "authored" ? "sponsors" : "cosponsors";
        const introduction = kind === "authored" ? bill.contexts.find((action) => action.actionDate === actionDate
          && /^Introduced in (House|Senate)\.?$/i.test(action.text)) : undefined;
        addAction(actions, {
          id: `us-congress:bill:${bill.congress}:${bill.type.toLowerCase()}:${bill.number}:${kind}:${id}:${actionDate}`,
          actorId: context.request.candidate.id, issueIds: [], role: options.role ?? body, body, type: kind,
          stance: kind === "authored" && !person.byRequest ? "author" : "n/a", date: actionDate,
          title: bill.title, officialText: [bill.title, introduction?.text].filter(Boolean).join("\n"),
          sourceUrl: snapshot.sourceUrl, extraction: "xml", attribution: { method: "member_id", sourceActorId: id },
          provenance: [
            provenance(snapshot, "govinfo-billstatus/v1", `/billStatus/bill/${container}/item[${index + 1}]`),
            provenance(snapshot, "govinfo-billstatus/v1", bill.titleLocator),
            ...(kind === "authored" ? [provenance(snapshot, "govinfo-billstatus/v1", "/billStatus/bill/introducedDate")] : []),
            ...(introduction ? [provenance(snapshot, "govinfo-billstatus/v1", introduction.locator)] : []),
          ],
        });
      }
      if (!matched && bill.introducedDate < context.window.before) {
        warnings.add("Some supplied bills have no matching sponsor/cosponsor identity; this is not a complete office or career search.");
      }
    }
    return result(actions.values(), "GovInfo BILLSTATUS sponsorship", warnings);
  },
};
