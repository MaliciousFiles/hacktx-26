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
