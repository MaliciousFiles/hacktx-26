import { normalizeName } from "../model";

/**
 * Verified statewide-officeholder tenures (public record). A tenure bound is how
 * governor actions are attributed to a person (`attribution.method: "office_tenure"`),
 * so each entry carries an official source and exact civil dates; add an entry only
 * with both. Dates are inclusive.
 */
export interface OfficeTenure {
  /** Normalized full-name keys that select this officeholder. */
  names: string[];
  start: string;
  end?: string;
  sourceUrl: string;
  /** LRL governor documents search "Governor" option value, when the office is Governor. */
  lrlAuthorId?: number;
  /** Name as printed in the LRL catalog. */
  lrlAuthorName?: string;
}

/** Texas State Library and Archives Commission, "Governors of Texas". */
export const TSL_GOVERNORS_URL = "https://www.tsl.texas.gov/ref/abouttx/governors.html";

export const TX_GOVERNOR_TENURES: OfficeTenure[] = [
  // "Gregory Wayne Abbott — January 20, 2015 to present"
  { names: ["greg abbott", "gregory wayne abbott", "gregory abbott"], start: "2015-01-20", sourceUrl: TSL_GOVERNORS_URL, lrlAuthorId: 45, lrlAuthorName: "Greg Abbott" },
  // "James Richard Perry — December 21, 2000-January 20, 2015" (last day in office: 2015-01-19)
  { names: ["rick perry", "james richard perry"], start: "2000-12-21", end: "2015-01-19", sourceUrl: TSL_GOVERNORS_URL, lrlAuthorId: 44, lrlAuthorName: "Rick Perry" },
];

export function matchTxGovernorTenure(names: Iterable<string>): OfficeTenure | undefined {
  const want = new Set([...names].map(normalizeName));
  return TX_GOVERNOR_TENURES.find((tenure) => tenure.names.some((name) => want.has(name)));
}
