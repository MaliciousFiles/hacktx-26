import { z } from "zod";
import type { AdapterContext, RecordsAdapter } from "../adapters";
import { htmlToPlainText } from "../document";
import type { ResearchDocument } from "../model";
import { sameFullName } from "../texas/legislator";
import { links, researchDocument } from "./research-documents";
import { collectionConfig } from "../adapters";

export const TRAVIS_OFFICE_SEEDS = [
  { url: "https://www.traviscountytx.gov/district-clerk/bio", archive: "https://www.traviscountytx.gov/district-clerk/reports", family: "Travis County District Clerk" },
  { url: "https://countyclerk.traviscountytx.gov/about-the-county-clerk/", archive: "https://countyclerk.traviscountytx.gov/departments/civil/civil-state-oca/", family: "Travis County Clerk" },
  { url: "https://www.traviscountytx.gov/treasurer", archive: "https://www.traviscountytx.gov/treasurer", family: "Travis County Treasurer" },
];
export const TRAVIS_COURT_INDEXES = [
  "https://www.traviscountytx.gov/courts/civil",
  "https://www.traviscountytx.gov/courts/criminal",
  "https://www.traviscountytx.gov/courts/civil/county",
  "https://www.traviscountytx.gov/justices-of-peace",
];
const courtArchives = [
  "https://www.traviscountytx.gov/courts/files/civil-district",
  "https://www.traviscountytx.gov/courts/files/civil-county",
  "https://www.traviscountytx.gov/courts/files/criminal-district",
  "https://www.traviscountytx.gov/justices-of-peace",
];
const configSchema = z.object({ maxDocuments: z.number().int().min(1).max(1000).default(100), maxPages: z.number().int().min(1).max(200).default(60), ocr: z.boolean().default(true) }).strict();

/** Exact full name in an official heading, not a mention in an audit's distribution list. */
export function officeIdentityMatches(html: string, names: string[]): boolean {
  const introduction = /^([^\n.]{3,80}?) is the (?:newly )?elected County Clerk\b/im.exec(htmlToPlainText(html));
  if (introduction && names.some((name) => sameFullName(name, introduction[1]))) return true;
  const labels = [...html.matchAll(/<(h[1-6]|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => htmlToPlainText(m[2]));
  // Some official biographies place the title/name on a standalone introductory line.
  labels.push(...htmlToPlainText(html).split("\n").filter((line) => /^(?:The Honorable|Judge |Dolores .*Treasurer|Travis County.?s District Clerk)/i.test(line)));
  return labels.some((label) => {
    const name = label.replace(/^(?:The Honorable\s+|Judge\s+|About\s+)+/gi, "").replace(/,?\s+(?:County )?(?:Treasurer|District Clerk|County Clerk)$/i, "").trim();
    return names.some((candidate) => sameFullName(candidate, name));
  });
}

export function countyCourtLinks(html: string, base: string): string[] {
  return links(html, base).map((l) => l.url).filter((value) => {
    const url = new URL(value);
    return url.hostname === "www.traviscountytx.gov" &&
      /^\/(?:courts\/(?:civil|criminal)\/(?:district|county)(?:\/\d+)?|justices-of-peace\/jp[1-5])\/?$/.test(url.pathname);
  });
}

async function archive(context: AdapterContext, indexes: string[], family: string, relationship: ResearchDocument["relationship"], config: z.infer<typeof configSchema>, notes: string[]) {
  const documents: ResearchDocument[] = [];
  const discovered = new Map<string, string>();
  let failures = 0;
  for (const url of indexes) {
    try {
      const page = await context.client.get(url, { format: "html" });
      const doc = await researchDocument(context, page, { title: family, sourceFamily: family, relationship, ocr: false });
      documents.push(doc.document);
      for (const link of links(page.text, url)) {
        const target = new URL(link.url);
        if (target.protocol === "https:" && (target.hostname === "www.traviscountytx.gov" || target.hostname === "countyclerk.traviscountytx.gov") &&
          /\.pdf$/i.test(target.pathname) && !/\b(?:form|application|sample|template|docket|jury schedule)\b/i.test(link.label)) {
          discovered.set(link.url, link.label || "Official office document");
        }
      }
    } catch { failures++; notes.push(`Official archive unavailable: ${url}`); }
  }
  let attempted = 0;
  for (const [url, title] of [...discovered].slice(0, config.maxDocuments)) {
    attempted++;
    try {
      const snapshot = await context.client.get(url, { format: "pdf", allowEmptyPdf: true });
      const archived = await researchDocument(context, snapshot, { title, sourceFamily: family, relationship, ocr: config.ocr });
      documents.push(archived.document);
      if (archived.problem) notes.push(archived.problem);
    } catch { failures++; notes.push(`Official document unavailable: ${url}`); }
  }
  return { documents, counts: `${discovered.size} linked PDFs discovered; ${attempted} attempted; ${failures} index/document failures; ${Math.max(0, discovered.size - attempted)} beyond document budget.` };
}

/** Non-voting office output is private context, never fabricated OfficialAction. */
export const travisOfficeRecordsAdapter: RecordsAdapter = {
  kind: "travis-office-records",
  async collect(context, input) {
    const config = collectionConfig(configSchema.parse(input ?? {}), context);
    const names = [context.request.candidate.name, ...(context.request.candidate.aliases ?? [])];
    const documents: ResearchDocument[] = [], notes: string[] = [];
    let matches = 0;
    for (const office of TRAVIS_OFFICE_SEEDS) {
      try {
        const roster = await context.client.get(office.url, { format: "html" });
        // The district-clerk bio uses a sentence rather than a name heading.
        const bioName = /District Clerk,?\s+([^<\n]+?)\s+arrived/i.exec(htmlToPlainText(roster.text))?.[1];
        if (!officeIdentityMatches(roster.text, names) && !(bioName && names.some((name) => sameFullName(name, bioName)))) continue;
        matches++;
        documents.push((await researchDocument(context, roster, { title: `${office.family} official profile`, sourceFamily: office.family, relationship: "office_context", ocr: false })).document);
        const result = await archive(context, [office.archive], office.family, "office_context", config, notes);
        documents.push(...result.documents); notes.push(result.counts);
      } catch { notes.push(`Office identity page unavailable: ${office.url}`); }
    }
    const courts = new Set<string>();
    const queue = [...TRAVIS_COURT_INDEXES];
    const seen = new Set<string>();
    while (queue.length && seen.size < config.maxPages) {
      const url = queue.shift()!;
      if (seen.has(url)) continue;
      seen.add(url);
      try {
        const page = await context.client.get(url, { format: "html" });
        if (officeIdentityMatches(page.text, names)) {
          courts.add(url);
          documents.push((await researchDocument(context, page, { title: "Official Travis County trial-court profile", sourceFamily: "Travis County trial courts", relationship: "court_context", ocr: false })).document);
        }
        for (const link of countyCourtLinks(page.text, url)) if (!seen.has(link) && !queue.includes(link)) queue.push(link);
      } catch { notes.push(`Court directory/profile unavailable: ${url}`); }
    }
    if (queue.length) notes.push(`${queue.length} court directory pages remain beyond page budget.`);
    if (courts.size) {
      matches += courts.size;
      const result = await archive(context, [...new Set([...courts, ...courtArchives])], "Travis County trial courts", "court_context", config, notes);
      documents.push(...result.documents); notes.push(result.counts);
    }
    return {
      actions: [], documents: [...new Map(documents.map((d) => [d.id, d])).values()], status: matches ? "partial" : "needs_review",
      reason: `${matches} current office/court identity page(s) matched by full name; ${seen.size} court pages inspected. ${notes.join(" ")} Office reports, profiles and shared court rules are research context, not personal decisions or proof of performance. Dates remain unknown unless verified; no case-party, juvenile, sealed, authenticated or voter records are scraped. Historical office tenures, report pagination and case decisions remain unverified.`,
    };
  },
};
