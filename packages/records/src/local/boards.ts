import { z } from "zod";
import type { AdapterContext, AdapterResult, RecordsAdapter } from "../adapters";
import { htmlToPlainText } from "../document";
import { inWindow, isISODate, type ResearchDocument } from "../model";
import { sameFullName } from "../texas/legislator";
import { createOfficialMinutesAdapter } from "../minutes/official-minutes";
import { links, researchDocument } from "./research-documents";
import { collectionConfig } from "../adapters";

export const ACC_MEMBERS = "https://offices.austincc.edu/board-of-trustees/board-members/";
export const ACC_MEETINGS = "https://offices.austincc.edu/board-of-trustees/board-meetings/";
export const AISD_MEMBERS = "https://www.austinisd.org/board/members";
export const AISD_PORTAL = "https://austin-isd.community.diligentoneplatform.com";
export const AISD_BOARDDOCS = "https://go.boarddocs.com/tx/austinisd/Board.nsf/Public";
const configSchema = z.object({ maxDocuments: z.number().int().min(1).max(1000).default(100), ocr: z.boolean().default(true) }).strict();
const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function printedDate(text: string): string | undefined {
  const match = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2}),?\s+(20\d{2})\b/i.exec(text);
  if (!match) return;
  const date = `${match[3]}-${String(months.indexOf(match[1].slice(0, 3).toLowerCase()) + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  return isISODate(date) ? date : undefined;
}

export function parseAccMinutes(html: string, base = ACC_MEETINGS) {
  const result = new Map<string, { url: string; date: string; title: string }>();
  for (const table of html.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    let date: string | undefined;
    for (const row of table[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
      date = printedDate(htmlToPlainText(row[0].replace(/<\/t[dh]>/gi, "\n"))) ?? date;
      if (!date) continue;
      for (const link of links(row[0], base).filter((l) => /^minutes$/i.test(l.label))) {
        const url = new URL(link.url);
        if (url.hostname === "drive.google.com") {
          const id = /^\/file\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/.exec(url.pathname)?.[1] ?? url.searchParams.get("id");
          if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) continue;
          result.set(link.url, { url: `https://drive.google.com/uc?export=download&id=${id}`, date, title: `ACC Board of Trustees minutes ${date}` });
        } else if ((url.hostname === "austincc.edu" || url.hostname.endsWith(".austincc.edu")) && /\.pdf$/i.test(url.pathname)) {
          result.set(link.url, { ...link, date, title: `ACC Board of Trustees minutes ${date}` });
        }
      }
    }
  }
  return [...result.values()].sort((a, b) => b.date.localeCompare(a.date) || a.url.localeCompare(b.url));
}

async function memberLabels(context: AdapterContext, url: string): Promise<string[]> {
  const snapshot = await context.client.get(url, { format: "html" });
  const names = [context.request.candidate.name, ...(context.request.candidate.aliases ?? [])];
  const labels = [
    ...links(snapshot.text, url).map((l) => l.label),
    ...[...snapshot.text.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)].map((m) => htmlToPlainText(m[1])),
  ].map((label) => label.replace(/^(?:Dr\.?|Trustee)\s+/i, "").replace(/,\s*(?:At.Large|District|Position).*$/i, ""));
  const matches = [...new Set(labels.filter((label) => names.some((name) => sameFullName(name, label))))];
  return matches.length ? [...new Set([...names, ...matches])] : [];
}

async function collectMinutes(context: AdapterContext, entries: { url: string; date: string; title: string; format: "pdf" | "html" }[], labels: string[], family: string, config: z.infer<typeof configSchema>, notes: string[]): Promise<AdapterResult> {
  const documents: ResearchDocument[] = [], actions: AdapterResult["actions"] = [];
  const eligible = entries.filter((entry) => inWindow(entry.date, context.window));
  let failed = 0;
  for (const entry of eligible.slice(0, config.maxDocuments)) {
    try {
      const snapshot = await context.client.get(entry.url, { format: entry.format, allowEmptyPdf: true });
      const archived = await researchDocument(context, snapshot, { title: entry.title, date: entry.date, sourceFamily: family, relationship: "board_minutes", ocr: config.ocr });
      documents.push(archived.document);
      if (archived.problem) notes.push(`${entry.date}: ${archived.problem}`);
      // Never extract automatic votes from OCR; only exact native-text named votes.
      if (archived.document.textBasis === "native") {
        const result = await createOfficialMinutesAdapter().collect(context, {
          urls: [entry.url], role: `${family} trustee`, body: family, memberLabels: labels,
          memberCandidateId: context.request.candidate.id, meetingDate: entry.date,
          documentFormat: entry.format, enableLlmFallback: false,
        });
        actions.push(...result.actions);
        if (result.status !== "complete") notes.push(result.reason);
      }
    } catch (error) { failed++; notes.push(`${entry.date}: ${error instanceof Error ? error.message : "minutes fetch failed"}`); }
  }
  return {
    actions: [...new Map(actions.map((action) => [action.id, action])).values()], documents, status: "partial",
    reason: `${family}: ${eligible.length} in-window minutes discovered; ${documents.length} archived; ${failed} failed; ${Math.max(0, eligible.length - config.maxDocuments)} beyond document budget. ${notes.join(" ")} Current-roster members only; office history, unpublished minutes and archive completeness unverified. Research documents are not personal actions.`,
  };
}

export const accBoardAdapter: RecordsAdapter = {
  kind: "acc-board-minutes",
  async collect(context, input) {
    const config = collectionConfig(configSchema.parse(input ?? {}), context);
    const labels = await memberLabels(context, ACC_MEMBERS);
    if (!labels.length) return { actions: [], status: "needs_review", reason: "No exact full-name match on the official current ACC board roster; former trustee service unverified." };
    const entries = new Map<string, ReturnType<typeof parseAccMinutes>[number]>();
    const notes: string[] = [];
    for (const url of [ACC_MEETINGS, `${ACC_MEETINGS}meeting-archives/`]) {
      try {
        const page = await context.client.get(url, { format: "html" });
        for (const entry of parseAccMinutes(page.text, url)) entries.set(entry.url, entry);
      } catch { notes.push(`Minutes index unavailable: ${url}`); }
    }
    return collectMinutes(context, [...entries.values()].sort((a, b) => b.date.localeCompare(a.date)).map((e) => ({ ...e, format: "pdf" })), labels, "Austin Community College Board of Trustees", config, notes);
  },
};

const meetingSchema = z.object({ Id: z.number().int().positive(), MeetingDate: z.string().refine(isISODate), Name: z.string(), Published: z.boolean(), ExternalCalendar: z.boolean().optional() });
const minutesSchema = z.object({ Documents: z.array(z.object({ Id: z.number().int().positive(), DocumentType: z.number().int(), IsPublic: z.boolean(), Name: z.string().optional() })) });

export const aisdBoardAdapter: RecordsAdapter = {
  kind: "aisd-board-minutes",
  async collect(context, input) {
    const config = collectionConfig(configSchema.parse(input ?? {}), context);
    const labels = await memberLabels(context, AISD_MEMBERS);
    if (!labels.length) return { actions: [], status: "needs_review", reason: "No exact full-name match on the official current AISD board roster; former trustee service unverified." };
    const notes: string[] = [];
    // BoardDocs is a separate, earlier archive. Try its public entry point; never bypass denials.
    try { await context.client.get(AISD_BOARDDOCS, { format: "html" }); notes.push("BoardDocs public index archived; legacy Lotus meeting/minutes traversal not yet verified."); }
    catch { notes.push("BoardDocs legacy public archive unavailable/denied; no CAPTCHA or authentication bypass attempted."); }
    const entries: { url: string; date: string; title: string; format: "pdf" | "html" }[] = [];
    let meetingCount = 0, missing = 0, failures = 0;
    // One civil-year inventory per request: bounded responses and explicit per-year failures.
    for (let year = Number(context.window.since.slice(0, 4)); year <= Number(context.window.before.slice(0, 4)); year++) {
      if (year < 2026) continue; // Official transition to this portal: July 2026.
      const from = [context.window.since, `${year}-01-01`, "2026-07-01"].sort().at(-1)!;
      const to = [context.window.before, `${year + 1}-01-01`].sort()[0];
      if (from >= to) continue;
      try {
        const url = `${AISD_PORTAL}/Services/MeetingsService.svc/meetings?from=${from}&to=${to}`;
        const inventory = await context.client.get(url, { format: "json" });
        const meetings = z.array(meetingSchema).parse(JSON.parse(inventory.text)).filter((m) => m.Published && !m.ExternalCalendar && inWindow(m.MeetingDate, context.window));
        meetingCount += meetings.length;
        for (const meeting of meetings.slice(0, config.maxDocuments)) {
          try {
            const snapshot = await context.client.get(`${AISD_PORTAL}/Services/MeetingsService.svc/meetings/${meeting.Id}/meetingDocuments`, { format: "json" });
            const documents = minutesSchema.parse(JSON.parse(snapshot.text)).Documents;
            const minutes = documents.filter((d) => d.IsPublic && [9, 10, 53, 55].includes(d.DocumentType));
            if (!minutes.length) missing++;
            // Prefer adopted HTML, then published HTML, then PDFs; one version per meeting.
            const selected = minutes.sort((a, b) => [55, 9, 53, 10].indexOf(a.DocumentType) - [55, 9, 53, 10].indexOf(b.DocumentType))[0];
            if (selected) entries.push({ url: `${AISD_PORTAL}/document/${selected.Id}`, date: meeting.MeetingDate, title: `${meeting.Name} minutes`, format: [9, 55].includes(selected.DocumentType) ? "html" : "pdf" });
          } catch { failures++; }
        }
        if (meetings.length > config.maxDocuments) notes.push(`${meetings.length - config.maxDocuments} meetings beyond per-year inventory traversal budget.`);
      } catch { failures++; notes.push(`${year} Diligent meeting inventory unavailable.`); }
    }
    notes.push(`${meetingCount} published meetings listed; ${missing} inspected meetings without public minutes; ${failures} inventory/document failures. Agendas, non-public documents and draft/closed minutes are not votes.`);
    return collectMinutes(context, entries, labels, "Austin ISD Board of Trustees", config, notes);
  },
};
