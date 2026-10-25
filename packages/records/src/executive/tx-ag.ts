import { normalizeName } from "../model";

/**
 * Attorney General opinion series listed on the official OAG opinions index
 * (https://www.texasattorneygeneral.gov/opinions). Path segments come from that
 * page; tenureStart is the civil date the officeholder's AG term began (public
 * record), used only as an office_tenure lower bound.
 */
export const OAG_OPINIONS_INDEX = "https://www.texasattorneygeneral.gov/opinions";

export interface TxAgOpinionSeries {
  /** Normalized full-name keys that select this series. */
  names: string[];
  /** Path segment under /opinions/{path}/… */
  path: string;
  tenureStart: string;
  tenureEnd?: string;
}

/** Series with verified path + tenure bounds suitable for auto-planning. */
export const TX_AG_OPINION_SERIES: TxAgOpinionSeries[] = [
  // OAG index: "Ken Paxton 2015 - Present"; path /opinions/ken-paxton/
  { names: ["ken paxton"], path: "ken-paxton", tenureStart: "2015-01-05" },
  // OAG index: /opinions/greg-abbott (GA-0001 – GA-1096). AG from 2002-12-02 until
  // Paxton took office on 2015-01-05 (Abbott became Governor on 2015-01-20).
  { names: ["greg abbott", "gregory wayne abbott", "gregory abbott"], path: "greg-abbott", tenureStart: "2002-12-02", tenureEnd: "2015-01-04" },
  // OAG index: /opinions/john-cornyn (JC-0001 – JC-0585). AG 1999-01-01 to 2002-12-01.
  { names: ["john cornyn"], path: "john-cornyn", tenureStart: "1999-01-01", tenureEnd: "2002-12-01" },
];

/** Exact full-name match against the published OAG series list (aliases allowed). */
export function matchTxAgOpinionSeries(names: Iterable<string>): TxAgOpinionSeries | undefined {
  const want = new Set([...names].map(normalizeName));
  return TX_AG_OPINION_SERIES.find((series) => series.names.some((name) => want.has(name)));
}
