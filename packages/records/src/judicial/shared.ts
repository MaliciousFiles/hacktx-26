import { textSpanLocator } from "../document";
import { isoDate, normalizeName } from "../model";

export function findJusticeAttribution(plain: string, labels: string[]): {
  kind: "authored" | "joined" | "dissented" | "concurred";
  label: string;
  span: string;
  locator: string;
} | undefined {
  const normalizedLabels = labels.map((label) => ({ label, key: normalizeName(label) }));
  const patterns: Array<{ kind: "authored" | "joined" | "dissented" | "concurred"; re: RegExp }> = [
    { kind: "authored", re: /Justice\s+([A-Za-z.'-]+)\s+delivered the (?:opinion|judgment)/gi },
    { kind: "authored", re: /([A-Za-z.'-]+),\s*J\.,\s*delivered the opinion/gi },
    { kind: "dissented", re: /([A-Za-z.'-]+),\s*J\.,\s*dissenting/gi },
    { kind: "concurred", re: /([A-Za-z.'-]+),\s*J\.,\s*concurring/gi },
    { kind: "joined", re: /([A-Za-z.'-]+),\s*J\.,\s*joining/gi },
  ];
  for (const { kind, re } of patterns) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(plain))) {
      const printed = match[1];
      const hit = normalizedLabels.find((label) => label.key === normalizeName(printed));
      if (!hit) continue;
      return {
        kind,
        label: hit.label,
        span: match[0],
        locator: textSpanLocator(match.index, match.index + match[0].length),
      };
    }
  }
  return undefined;
}

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

/**
 * Date the opinion was delivered/issued/filed. Only a date labeled that way
 * counts: "Argued January 10" or a cited decision's date is not the opinion
 * date. No label → undefined (the adapter reports needs_review).
 */
export function opinionDateFromText(plain: string): string | undefined {
  const label = String.raw`\b(?:opinion\s+)?(?:delivered|issued|filed|decided)(?:\s+and\s+filed)?\b\s*:?\s*(?:on\s+)?`;
  const named = new RegExp(
    `${label}(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(\\d{1,2}),\\s+(\\d{4})\\b`,
    "i",
  ).exec(plain);
  try {
    if (named) {
      const month = MONTHS[named[1]!.toLowerCase()];
      return month ? isoDate(`${named[3]}-${month}-${named[2]!.padStart(2, "0")}`) : undefined;
    }
    const numeric = new RegExp(`${label}(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})\\b`, "i").exec(plain);
    if (!numeric) return undefined;
    return isoDate(`${numeric[3]}-${numeric[1]!.padStart(2, "0")}-${numeric[2]!.padStart(2, "0")}`);
  } catch {
    return undefined;
  }
}
