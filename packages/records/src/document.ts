/**
 * Deterministic document helpers for approved HTML/PDF sources.
 * Rules only: no model calls, no fuzzy OCR, no invented spans.
 */

/** Decode common HTML entities and numeric character references without a DOM. */
export function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)));
}

/**
 * Strip tags to plain text with stable newlines. Script/style removed.
 * Locators for HTML actions use character offsets into this plain text
 * (`text:start-end`) so provenance stays reproducible without a DOM tree.
 */
export function htmlToPlainText(html: string): string {
  let text = html.replace(/\r\n?/g, "\n");
  text = text.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<(br|hr)\b[^>]*>/gi, "\n");
  text = text.replace(/<\/(p|div|tr|li|h[1-6]|blockquote|section|article|header|footer|br)>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = decodeEntities(text);
  text = text.replace(/\u00a0/g, " ");
  text = text.replace(/[ \t\f\v]+/g, " ");
  text = text.replace(/ *\n */g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

export function textSpanLocator(start: number, end: number): string {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
    throw new Error("Invalid text span");
  }
  return `text:${start}-${end}`;
}

/** Find an exact substring occurrence; fail closed if zero or multiple matches. */
export function uniqueSpan(haystack: string, needle: string): { start: number; end: number; locator: string } {
  if (!needle) throw new Error("Empty span needle");
  const start = haystack.indexOf(needle);
  if (start < 0) throw new Error("Span needle not found in document text");
  if (haystack.indexOf(needle, start + 1) >= 0) throw new Error("Span needle is not unique in document text");
  const end = start + needle.length;
  return { start, end, locator: textSpanLocator(start, end) };
}

export function assertHtmlDocument(text: string): void {
  const head = text.slice(0, 2000).toLowerCase();
  if (!/<html\b/.test(head) && !/<!doctype\s+html\b/.test(head)) {
    throw new Error("Expected an HTML document");
  }
  if (/<parsererror\b/.test(head)) throw new Error("HTML parser error document rejected");
}

export function assertPdfBytes(bytes: Uint8Array): void {
  const mag = String.fromCharCode(...bytes.slice(0, 5));
  if (mag !== "%PDF-") throw new Error("Expected a PDF document");
}

/**
 * Extract PDF text in page order via PDF.js (unpdf). Join pages with form-feed
 * so locators can name page boundaries without inventing layout.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  assertPdfBytes(bytes);
  // unpdf/PDF.js rejects Node Buffer (a Uint8Array subclass); copy into a plain view.
  const data = new Uint8Array(bytes);
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  if (!Array.isArray(text) || text.length !== totalPages) {
    throw new Error("PDF text extraction returned an unexpected page shape");
  }
  return text.map((page) => page.replace(/\r\n?/g, "\n").trimEnd()).join("\n\f\n").trim();
}
