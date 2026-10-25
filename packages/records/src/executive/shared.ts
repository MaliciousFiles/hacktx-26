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
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i,
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

export function hostAllowed(url: string, suffixes: string[]): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}
