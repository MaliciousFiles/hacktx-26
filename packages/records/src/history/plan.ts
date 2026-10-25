import type { CandidateResearchRequest } from "@ftb/types";
import type { RecordsPlan } from "../collector";
import { OAG_OPINIONS_INDEX, matchTxAgOpinionSeries } from "../executive/tx-ag";
import { candidateNames } from "../model";

export interface HistoryPlanResult {
  plan: RecordsPlan;
  /** Human-readable explanation of why each source family was included. */
  rationale: string[];
  /** Explicit gaps — not claims that the candidate has no record there. */
  gaps: string[];
}

function yearsInWindow(request: CandidateResearchRequest, since: string): number[] {
  const start = Number(since.slice(0, 4));
  const end = request.year;
  const years: number[] = [];
  for (let year = start; year <= end; year++) years.push(year);
  return years;
}

function congressesForYears(years: number[]): number[] {
  // Rough civil-year → Congress mapping (odd year starts a Congress).
  const set = new Set<number>();
  for (const year of years) set.add(Math.floor((year - 1789) / 2) + 1);
  return [...set].sort((a, b) => a - b);
}

function isTx(jurisdiction: string): boolean {
  return /(^|[/:])tx($|[/:])/i.test(jurisdiction) || /texas/i.test(jurisdiction);
}

/**
 * Name + race sought → full prior-office history plan.
 *
 * Race sought only defines the election cutoff (and ballot context). It does
 * **not** select which office families to search. Every supported family is
 * probed; adapters no-op or soft-skip when identity/tenure does not match.
 * Missing auto-discovery stays an explicit gap.
 */
export function buildHistoryPlan(
  request: CandidateResearchRequest,
  options: {
    since?: string;
    houseRollCap?: number;
    /** Soft cap for GovInfo / OAG discovery (default 12). */
    documentCap?: number;
    /** Opt into TLO FTP discovery (slow; off by default for interactive use). */
    includeTloFtp?: boolean;
  } = {},
): HistoryPlanResult {
  const since = options.since ?? "2015-01-01";
  const houseRollCap = options.houseRollCap ?? 120;
  const documentCap = options.documentCap ?? 12;
  const years = yearsInWindow(request, since);
  const congresses = congressesForYears(years);
  const rationale: string[] = [
    `Full-history scan for ${request.candidate.name} (race sought: ${request.position.office}) — every supported office family is probed; the ballot race is not a prior-office filter.`,
  ];
  const gaps: string[] = [];
  const sources: RecordsPlan["sources"] = [];
  const tx = isTx(request.position.jurisdiction);

  const add = (source: RecordsPlan["sources"][number], why: string) => {
    sources.push(source);
    rationale.push(why);
  };

  // ——— U.S. House (always; soft-skipped without bioguide) ———
  for (const year of years.filter((y) => y >= 2023)) {
    add({
      id: `house-clerk-${year}`,
      adapter: "house-clerk",
      discovery: {
        kind: "house-clerk-rolls",
        year,
        fromRoll: 1,
        toRoll: year === 2025 ? 362 : year === 2024 ? 520 : 300,
        maxDocuments: houseRollCap,
      },
      config: {
        urls: [`https://clerk.house.gov/evs/${year}/roll001.xml`],
        role: "U.S. House of Representatives",
      },
    }, `U.S. House Clerk EVS rolls for ${year} (bioguide-bound; cap ${houseRollCap}).`);
  }
  add({
    id: "govinfo-billstatus-house",
    adapter: "govinfo-billstatus",
    discovery: {
      kind: "govinfo-billstatus",
      congresses: congresses.filter((c) => c >= 118),
      billTypes: ["hr", "hres"],
      maxDocuments: documentCap,
    },
    config: {
      urls: ["https://www.govinfo.gov/bulkdata/BILLSTATUS/119/hr/BILLSTATUS-119hr1.xml"],
      role: "U.S. House of Representatives",
    },
  }, `U.S. House BILLSTATUS sponsorship (bioguide-bound; cap ${documentCap}).`);

  // ——— U.S. Senate (always; soft-skipped without bioguide) ———
  for (const year of years.filter((y) => y >= 2023)) {
    add({
      id: `govinfo-crec-${year}`,
      adapter: "govinfo-crec",
      discovery: { kind: "govinfo-record", years: [year], maxDocuments: documentCap },
      config: {
        urls: [`https://www.govinfo.gov/metadata/pkg/CREC-${year}-01-03/mods.xml`],
        role: "U.S. Senate",
      },
    }, `U.S. Senate CREC MODS votes for ${year} (bioguide-bound; cap ${documentCap}).`);
  }
  add({
    id: "govinfo-billstatus-senate",
    adapter: "govinfo-billstatus",
    discovery: {
      kind: "govinfo-billstatus",
      congresses: congresses.filter((c) => c >= 118),
      billTypes: ["s", "sres"],
      maxDocuments: documentCap,
    },
    config: {
      urls: ["https://www.govinfo.gov/bulkdata/BILLSTATUS/119/s/BILLSTATUS-119s1.xml"],
      role: "U.S. Senate",
    },
  }, `U.S. Senate BILLSTATUS sponsorship (bioguide-bound; cap ${documentCap}).`);

  // ——— Texas legislature ———
  if (tx) {
    if (options.includeTloFtp) {
      add({
        id: "tlo-billhistory-recent",
        adapter: "tlo-billhistory",
        discovery: {
          kind: "tlo-billhistory",
          sessions: ["89R"],
          billTypes: ["HB", "SB"],
          maxDocuments: Math.min(documentCap, 10),
        },
        config: {
          urls: ["ftp://ftp.legis.state.tx.us/bills/89R/billhistory/house_bills/HB00001_HB00099/HB%202.xml"],
          role: "Texas Legislature",
        },
      }, "TLO bill-history XML via FTP (authorship/actions; name/member-code match).");
    } else {
      gaps.push("TX Legislature TLO bill-history FTP auto-discovery skipped (often multi-minute); pass includeTloFtp or a manual URL plan.");
    }
    gaps.push("TX House/Senate journal floor votes need session journal URL inventories per candidate term (adapter exists; auto URL discovery not wired yet).");
  } else {
    gaps.push("TX Legislature sources skipped — jurisdiction is not Texas; set jurisdiction to us/tx (or similar) to probe TLO/journals.");
  }

  // ——— Local (Austin Council) — name match; empty result ≠ never held office elsewhere ———
  if (tx || /austin/i.test(request.position.jurisdiction)) {
    add({
      id: "austin-socrata-votes",
      adapter: "socrata-votes",
      config: {
        endpoint: "https://datahub.austintexas.gov/resource/3c89-i35a.json",
        role: "Austin City Council",
      },
    }, "Austin Council Socrata votes (exact full-name match; 0 hits means no match in this dataset, not proof of no local service).");
  } else {
    gaps.push("Austin Council Socrata not planned outside TX/Austin jurisdictions.");
  }

  // ——— Texas AG opinions (exact OAG series name match) ———
  const agSeries = matchTxAgOpinionSeries(candidateNames(request));
  if (agSeries) {
    add({
      id: `oag-opinions-${agSeries.path}`,
      adapter: "ag-opinions",
      discovery: {
        kind: "oag-opinion-index",
        agPath: agSeries.path,
        maxDocuments: documentCap,
      },
      config: {
        urls: [`${OAG_OPINIONS_INDEX}/${agSeries.path}`],
        role: "Texas Attorney General",
        tenure: {
          candidateId: request.candidate.id,
          start: agSeries.tenureStart,
          ...(agSeries.tenureEnd ? { end: agSeries.tenureEnd } : {}),
          sourceUrl: OAG_OPINIONS_INDEX,
        },
      },
    }, `Texas AG opinions for OAG series ${agSeries.path} (exact name match on ${OAG_OPINIONS_INDEX}).`);
  } else if (tx) {
    gaps.push("Texas AG opinions: no exact full-name match to a published OAG opinion series on the official index (not proof the person never served as AG).");
  }

  // ——— Governor / Register / Judicial / minutes — adapters exist; auto indexes not wired ———
  gaps.push("Governor orders / Texas Register: adapters exist; need configured official document URLs + verified tenure (auto index crawl not wired yet).");
  gaps.push("TX judicial (SCOTX/TAMES/SCJC): adapters exist; need configured opinion/order URLs or index pages per candidate.");
  gaps.push("Official minutes / CivicClerk / Legistar: adapters exist; need per-body endpoint or minutes URL configuration.");

  // Always attempt House/Congress.gov identity so bioguide-bound sources can run when
  // the person has congressional service — including when the race sought is not federal.
  const identity = { provider: "house" as const, config: tx ? { state: "TX" } : {} };
  rationale.unshift(
    "Congressional bioguide identity (Clerk roster + Congress.gov) attempted for every candidate; unresolved identity soft-skips only bioguide-bound adapters.",
  );

  return {
    plan: {
      since,
      identity,
      sources,
    },
    rationale,
    gaps,
  };
}
