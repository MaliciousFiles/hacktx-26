import { sha256 } from "../fetch";
import type { AdapterContext } from "../adapters";
import { decodeEntities, htmlToPlainText } from "../document";
import type { ResearchDocument, Snapshot } from "../model";
import { reviewScannedPdf } from "../pdf-review";

export function links(html: string, base: string): { url: string; label: string }[] {
  const found = new Map<string, { url: string; label: string }>();
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(decodeEntities(match[1]), base);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) continue;
      if (url.hostname === new URL(base).hostname) url.protocol = "https:";
      const label = htmlToPlainText(match[2]).trim();
      found.set(`${url.href}\0${label}`, { url: url.href, label });
    } catch { /* malformed link is not a discovery result */ }
  }
  return [...found.values()];
}

export async function researchDocument(context: AdapterContext, snapshot: Snapshot, input: {
  title: string; sourceFamily: string; relationship: ResearchDocument["relationship"];
  date?: string; ocr?: boolean;
}): Promise<{ document: ResearchDocument; problem?: string }> {
  const document: ResearchDocument = {
    id: sha256(`${context.request.candidate.id}:${snapshot.id}:${input.sourceFamily}`),
    candidateId: context.request.candidate.id, title: input.title,
    sourceUrl: snapshot.sourceUrl, sourceFamily: input.sourceFamily, relationship: input.relationship,
    date: input.date ?? null, dateBasis: input.date ? "meeting_inventory" : "unknown",
    textBasis: snapshot.text.trim() ? "native" : "unreadable",
    snapshotId: snapshot.id, contentHash: snapshot.contentHash, reviewRequired: true,
  };
  if (snapshot.format === "pdf" && !snapshot.text.trim() && input.ocr !== false) {
    try {
      const derivative = await reviewScannedPdf(context.client, snapshot);
      if (!derivative.output.pages.some((p) => p.lines.some((l) => l.text.trim())))
        return { document, problem: "OCR produced no text; original PDF retained" };
      document.textBasis = "ocr_unreviewed";
      document.derivedTextHash = derivative.outputHash;
      document.derivedText = derivative.output;
      return { document, problem: `OCR is an unreviewed derivative, not quote/vote evidence${derivative.truncated ? "; OCR page budget reached" : ""}` };
    } catch (error) {
      return { document, problem: `OCR unavailable: ${error instanceof Error ? error.message : "error"}; original PDF retained` };
    }
  }
  return { document };
}
