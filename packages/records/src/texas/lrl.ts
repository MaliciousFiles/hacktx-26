import { htmlToPlainText } from "../document";

/**
 * Texas Legislative Reference Library (lrl.texas.gov) member records.
 *
 * The TLO member roster only covers the sitting legislature. LRL keeps every legislator
 * since 1846 with the chamber, district and legislature(s) of each term, so it is the
 * official evidence that a former member served in a chamber during a session.
 */
const LRL = "https://lrl.texas.gov/legeLeaders/members";

export function lrlSearchUrl(last: string, first: string): string {
  return `${LRL}/membersearch.cfm?last=${encodeURIComponent(last)}&first=${encodeURIComponent(first)}`;
}

export function lrlProfileUrl(memberId: number): string {
  return `${LRL}/memberDisplay.cfm?memberID=${memberId}`;
}

export interface LrlSearchHit { memberId: number; name: string }

export function parseLrlSearch(html: string): LrlSearchHit[] {
  const hits = new Map<number, string>();
  for (const match of html.matchAll(/<a href="memberDisplay\.cfm\?memberID=(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const id = Number(match[1]);
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    if (text && !hits.has(id)) hits.set(id, text);
  }
  return [...hits].map(([memberId, name]) => ({ memberId, name }));
}

export interface LrlTerm {
  chamber: "H" | "S";
  district: string;
  start: string;
  /** `Present` terms have no end date. */
  end?: string;
  /** Legislature numbers this term row covers (a 4-year Senate term lists two). */
  legislatures: number[];
}

export interface LrlProfile {
  /** `Warren Kenneth "Ken" Paxton, Jr.` */
  fullName: string;
  nickname?: string;
  terms: LrlTerm[];
}

const months: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function lrlDate(value: string): string {
  const match = /^([A-Z][a-z]{2})\w*\s+(\d{1,2}),\s+(\d{4})$/.exec(value.trim());
  if (!match || !months[match[1]]) throw new Error(`Unrecognized LRL date: ${value}`);
  return `${match[3]}-${months[match[1]]}-${match[2].padStart(2, "0")}`;
}

export function parseLrlProfile(html: string): LrlProfile | undefined {
  const text = htmlToPlainText(html).replace(/&quot;/g, '"').replace(/\s+/g, " ");
  const name = /Full Name:\s*(.+?)\s+Terms of Service/i.exec(text);
  if (!name) return undefined;
  const fullName = name[1].replace(/\s*Other surnames:.*$/i, "").trim();
  const nickname = /"([^"]+)"/.exec(fullName)?.[1];
  const section = text.slice(text.search(/Chamber District Dates of Service/i));
  const terms: LrlTerm[] = [];
  const row = /\b(H|S)\s+(\d{1,3})\s+([A-Z][a-z]{2}\w*\s+\d{1,2},\s+\d{4})\s*-\s*([A-Z][a-z]{2}\w*\s+\d{1,2},\s+\d{4}|Present)\s+((?:\d{1,2}(?:st|nd|rd|th)(?:\s*\(\d+\))?\s*)+)/g;
  for (const match of section.matchAll(row)) {
    terms.push({
      chamber: match[1] as "H" | "S",
      district: match[2],
      start: lrlDate(match[3]),
      ...(match[4] === "Present" ? {} : { end: lrlDate(match[4]) }),
      legislatures: [...match[5].matchAll(/(\d{1,2})(?:st|nd|rd|th)/g)].map((m) => Number(m[1])),
    });
  }
  return { fullName, ...(nickname ? { nickname } : {}), terms };
}

/** Chamber served in a legislature, per the LRL terms (undefined when not a member). */
export function chamberInLegislature(profile: LrlProfile, legislature: number): "H" | "S" | undefined {
  const terms = profile.terms.filter((t) => t.legislatures.includes(legislature));
  const chambers = new Set(terms.map((t) => t.chamber));
  // Serving in both chambers within one legislature is ambiguous; leave it unattributed.
  return chambers.size === 1 ? terms[0].chamber : undefined;
}
