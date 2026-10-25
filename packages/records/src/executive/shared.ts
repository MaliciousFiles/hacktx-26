import { z } from "zod";
import { isoDate } from "../model";

export const officialHttps = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}, "HTTPS official URL required");

export const tenureSchema = z.object({
  candidateId: z.string().trim().min(1),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sourceUrl: officialHttps,
}).strict().superRefine((value, ctx) => {
  if (value.end && value.end < value.start) {
    ctx.addIssue({ code: "custom", message: "tenure end precedes start" });
  }
});

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};
const MONTH = "(January|February|March|April|May|June|July|August|September|October|November|December)";

function toIso(month: string, day: string, year: string): string | undefined {
  const mm = MONTHS[month.toLowerCase()];
  if (!mm) return undefined;
  try {
    return isoDate(`${year}-${mm}-${day.padStart(2, "0")}`);
  } catch {
    return undefined;
  }
}

/** The LAST date matched by any of the labeled patterns (month, day, year groups). */
function lastLabeled(plain: string, patterns: RegExp[]): string | undefined {
  let best: { at: number; date: string } | undefined;
  for (const pattern of patterns) {
    for (const match of plain.matchAll(pattern)) {
      const { month, day, year } = match.groups ?? {};
      const date = month && day && year ? toIso(month, day, year) : undefined;
      if (date && (!best || match.index >= best.at)) best = { at: match.index, date };
    }
  }
  return best?.date;
}

/**
 * Signature/issuance date of a Governor order or proclamation. Uses only an
 * explicit signing phrase ("this the 13th day of March, 2020", "Signed/Issued
 * March 13, 2020"), never the first date in the text, which is often a WHEREAS
 * recital. The signature block is at the end, so the last match wins.
 */
export function signedDateFromText(plain: string): string | undefined {
  return lastLabeled(plain, [
    new RegExp(`\\bthis\\s+(?:the\\s+)?(?<day>\\d{1,2})(?:st|nd|rd|th)?\\s+day\\s+of\\s+(?<month>${MONTH.slice(1, -1)}),?\\s+(?<year>\\d{4})`, "gi"),
    new RegExp(`\\b(?:signed|issued|given|dated)\\b[^\\n\\d]{0,20}?(?<month>${MONTH.slice(1, -1)})\\s+(?<day>\\d{1,2}),\\s+(?<year>\\d{4})`, "gi"),
  ]);
}

/**
 * A date printed on the same line as a heading, e.g. "Appointments — January 10, 2025".
 * `labelPattern` is a trusted regex source supplied by adapter code, not by config.
 */
export function headingDateFromText(plain: string, labelPattern: string): string | undefined {
  return lastLabeled(plain, [
    new RegExp(`\\b(?:${labelPattern})\\b[^\\n\\d]{0,30}?(?<month>${MONTH.slice(1, -1)})\\s+(?<day>\\d{1,2}),\\s+(?<year>\\d{4})`, "gi"),
  ]);
}

/** First printed date. Only for documents whose first date is the document date (e.g. AG opinion letters). */
export function parsePrintedDate(plain: string): string | undefined {
  const named = plain.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*,\s*(\d{4})\b/i,
  );
  if (named) {
    const months: Record<string, string> = {
      january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
      july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
    };
    const month = months[named[1].toLowerCase()];
    if (!month) return undefined;
    return isoDate(`${named[3]}-${month}-${named[2].padStart(2, "0")}`);
  }
  const iso = plain.match(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return isoDate(iso[0]);
  return undefined;
}

/**
 * Letter-header date from OCR'd opinion scans, which print "May 27,2014", "February lo,2003", "March 13.2003",
 * "March 282003" or "March 3 1,2003". Day digits misread as l/I/o/O are repaired, the result must be a real
 * calendar date, and when `expectedYear` is given (the publication folder) it must be within a year of it so a
 * misread header can never silently adopt a date from the body.
 */
export function parseHeaderDate(header: string, expectedYear?: number): string | undefined {
  const match = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+([0-9lIOo]{1,2}(?:\s[0-9lIOo])?)\s*[,.]?\s*((?:19|20)\d{2})\b/i.exec(header);
  if (!match) return undefined;
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const day = Number(match[2].replace(/\s/g, "").replace(/[lI]/g, "1").replace(/[Oo]/g, "0"));
  const month = months.indexOf(match[1].toLowerCase()) + 1;
  if (!Number.isInteger(day) || day < 1 || day > 31) return undefined;
  try {
    const date = isoDate(`${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    if (expectedYear !== undefined && Math.abs(Number(date.slice(0, 4)) - expectedYear) > 1) return undefined;
    return date;
  } catch { return undefined; }
}

export function hostAllowed(url: string, suffixes: string[]): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
