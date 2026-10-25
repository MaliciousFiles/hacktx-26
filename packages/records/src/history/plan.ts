import type { CandidateResearchRequest } from "@ftb/types";
import type { RecordsPlan } from "../collector";
import { OAG_OPINIONS_INDEX, matchTxAgOpinionSeries } from "../executive/tx-ag";
import { candidateNames } from "../model";
import { matchTxGovernorTenure } from "./officeholders";
import { texasSessionCodes } from "../texas/sessions";

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
 * Name + race sought → bounded prior-office discovery plan (not a full corpus).
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
    exhaustive?: boolean;
    /**
     * How many of the most recent calendar years get a House roll-call inventory.
     * Roll calls are the only source that scales into the thousands of documents per
     * member, so the default is an explicit 2-year operator scope (not a claim of
     * complete roll-call history). Raise it deliberately for a longer run.
     */
    houseRollYears?: number;
  } = {},
): HistoryPlanResult {
  const since = options.since ?? "2015-01-01";
  const houseRollCap = options.houseRollCap ?? 120;
  const documentCap = options.documentCap ?? 12;
  // A Congress publishes ~10-20k bills; fetching all of them per candidate is a crawl, not research.
  const billStatusBudget = Math.max(documentCap, 200);
  const years = yearsInWindow(request, since);
  const houseRollYears = options.houseRollYears ?? 2;
  const houseRollWindow = years.filter((year) => year > request.year - houseRollYears);
  const congresses = congressesForYears(years);
  const rationale: string[] = [
    `Bounded history scan for ${request.candidate.name} (race sought: ${request.position.office}) — every supported office family is probed; the ballot race is not a prior-office filter. This is not a complete career inventory.`,
  ];
  const gaps: string[] = [
    `Bounded discovery since ${since}: per-source document cap ${documentCap}, House roll cap ${houseRollCap}. Increasing caps alone does not establish complete career coverage.`,
    "Federal automatic inventories cover 2023 onward only, House roll upper bounds are configured rather than discovered to exhaustion, and Texas FTP discovery covers only 89R. Earlier terms and other sessions require additional inventories.",
    `House and Senate roll-call votes are scoped to the ${houseRollYears} most recent calendar year(s) (${houseRollWindow.join(", ") || "none"}). Earlier roll calls are not fetched in this run; this is an operator scope, not evidence of absence. BILLSTATUS fetches are bounded to ${billStatusBudget} bills (identical inventory order for every candidate). Travis County Commissioners Court is bounded to the 60 newest meetings.`,
  ];
  const sources: RecordsPlan["sources"] = [];
  const tx = isTx(request.position.jurisdiction);

  const add = (source: RecordsPlan["sources"][number], why: string) => {
    sources.push(source);
    rationale.push(why);
  };

  // ——— U.S. House roll calls (last N calendar years only; bioguide-bound) ———
  for (const year of houseRollWindow.filter((y) => y >= (options.exhaustive ? 1990 : 2023))) {
    add(
      {
        id: `house-clerk-${year}`,
        adapter: "house-clerk",
        discovery: options.exhaustive ? { kind: "house-clerk-index", year } : {
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
      },
      `U.S. House Clerk EVS rolls for ${year} (bioguide-bound; cap ${houseRollCap}).`,
    );
  }
  add(
    {
      id: "govinfo-billstatus-house",
      adapter: "govinfo-billstatus",
      discovery: {
        kind: "govinfo-billstatus",
        congresses: congresses.filter((c) => c >= (options.exhaustive ? 113 : 118)),
        billTypes: options.exhaustive ? ["hr", "hres", "hjres", "hconres"] : ["hr", "hres"],
        maxDocuments: billStatusBudget,
      },
      config: {
        urls: ["https://www.govinfo.gov/bulkdata/BILLSTATUS/119/hr/BILLSTATUS-119hr1.xml"],
        role: "U.S. House of Representatives",
      },
    },
    `U.S. House BILLSTATUS sponsorship (bioguide-bound; cap ${documentCap}).`,
  );

  // ——— U.S. Senate roll calls (same explicit roll-call scope as the House) ———
  for (const year of houseRollWindow.filter((y) => y >= (options.exhaustive ? 1994 : 2023))) {
    add(
      {
        id: `govinfo-crec-${year}`,
        adapter: "govinfo-crec",
        discovery: { kind: "govinfo-record", years: [year], maxDocuments: documentCap },
        config: {
          urls: [`https://www.govinfo.gov/metadata/pkg/CREC-${year}-01-03/mods.xml`],
          role: "U.S. Senate",
        },
      },
      `U.S. Senate CREC MODS votes for ${year} (bioguide-bound; cap ${documentCap}).`,
    );
  }
  add(
    {
      id: "govinfo-billstatus-senate",
      adapter: "govinfo-billstatus",
      discovery: {
        kind: "govinfo-billstatus",
        congresses: congresses.filter((c) => c >= (options.exhaustive ? 113 : 118)),
        billTypes: options.exhaustive ? ["s", "sres", "sjres", "sconres"] : ["s", "sres"],
        maxDocuments: billStatusBudget,
      },
      config: {
        urls: ["https://www.govinfo.gov/bulkdata/BILLSTATUS/119/s/BILLSTATUS-119s1.xml"],
        role: "U.S. Senate",
      },
    },
    `U.S. Senate BILLSTATUS sponsorship (bioguide-bound; cap ${documentCap}).`,
  );

  // ——— Texas legislature ———
  if (tx) {
    // Bulk FTP crawling every bill is NOT part of exhaustive mode: tx-legislator enumerates each
    // member's authored bills from TLO's per-member reports, which is the bounded exact inventory.
    if (options.includeTloFtp) {
      add(
        {
          id: "tlo-billhistory-recent",
          adapter: "tlo-billhistory",
          discovery: {
            kind: "tlo-billhistory",
            sessions: options.exhaustive ? texasSessionCodes(Number(since.slice(0, 4)), request.year) : ["89R"],
            billTypes: options.exhaustive ? ["HB", "SB", "HJR", "SJR", "HCR", "SCR", "HR", "SR"] : ["HB", "SB"],
            maxDocuments: Math.min(documentCap, 10),
          },
          config: {
            urls: [
              "ftp://ftp.legis.state.tx.us/bills/89R/billhistory/house_bills/HB00001_HB00099/HB%202.xml",
            ],
            role: "Texas Legislature",
          },
        },
        "TLO bill-history XML via FTP (authorship/actions; name/member-code match).",
      );
    } else {
      gaps.push(
        "TX Legislature TLO bill-history FTP auto-discovery skipped (often multi-minute); pass includeTloFtp or a manual URL plan.",
      );
    }
    // Identity (current TLO roster, exact full name) → sessions served → authored bills (dated via
    // TLO bill-history XML) → House Journal record votes. Unresolved identity is an explicit gap.
    add(
      { id: "tx-legislator", adapter: "tx-legislator", config: {} },
      "Texas legislator history: TLO/LRL identity and service, per-session authored bills (current members), House and Senate Journal record votes.",
    );
    gaps.push(
      "TX legislator history: former members (no current TLO code) get floor votes but not authored bills; called-session journals are not scanned; Senate votes are inferred only where the journal's absences reconcile with the totals.",
    );
  } else {
    gaps.push(
      "TX Legislature sources skipped — jurisdiction is not Texas; set jurisdiction to us/tx (or similar) to probe TLO/journals.",
    );
  }

  // ——— Local (Austin Council) ———
  // A name alone can match a different person who served on the council, so
  // only plan this source with an upstream-verified prior council district.
  const austinDistrict = request.candidate.identifiers?.["austin_council_district"];
  if (austinDistrict) {
    add(
      {
        id: "austin-socrata-votes",
        adapter: "socrata-votes",
        config: {
          endpoint: "https://datahub.austintexas.gov/resource/3c89-i35a.json",
          role: `Austin City Council District ${austinDistrict}`,
          candidateDistrict: austinDistrict,
        },
      },
      "Austin Council Socrata votes (verified prior district + exact full-name match).",
    );
  } else if (tx || /austin/i.test(request.position.jurisdiction)) {
    // No upstream-verified district: the adapter resolves it from the official dataset itself
    // (exact name beside voter_district) and fails closed on ambiguity.
    add(
      { id: "austin-council-votes", adapter: "austin-council-votes", config: {} },
      "Austin Council votes (2023 onward): district resolved from the official dataset by exact name.",
    );
    gaps.push(
      "Austin Council votes cover 2023 onward only (the official dataset's range); earlier council service needs archive minutes.",
    );
  }

  // ——— Texas AG opinions (exact OAG series name match) ———
  const agSeries = matchTxAgOpinionSeries(candidateNames(request));
  if (agSeries) {
    add(
      {
        id: `oag-opinions-${agSeries.path}`,
        adapter: "ag-opinions",
        discovery: {
          kind: "oag-opinion-index",
          agPath: agSeries.path,
          ...(options.exhaustive ? {} : { maxDocuments: documentCap }),
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
      },
      `Texas AG opinions for OAG series ${agSeries.path} (exact name match on ${OAG_OPINIONS_INDEX}).`,
    );
  } else if (tx) {
    gaps.push(
      "Texas AG opinions: no exact full-name match to a published OAG opinion series on the official index (not proof the person never served as AG).",
    );
  }

  // ——— Governor: vetoes + priority-bill signings from official TLO governor reports ———
  const governor = tx ? matchTxGovernorTenure(candidateNames(request)) : undefined;
  if (governor) {
    add(
      {
        id: "tlo-governor-report",
        adapter: "tlo-governor-report",
        config: {
          role: "Governor of Texas",
          tenure: {
            candidateId: request.candidate.id,
            start: governor.start,
            ...(governor.end ? { end: governor.end } : {}),
            sourceUrl: governor.sourceUrl,
          },
        },
      },
      "Governor vetoes and priority-bill signings from official TLO governor reports (verified tenure, TSL).",
    );
  }

  if (governor?.lrlAuthorId && governor.lrlAuthorName) {
    add(
      {
        id: "lrl-governor-orders",
        adapter: "lrl-governor-orders",
        config: {
          authorId: governor.lrlAuthorId,
          authorName: governor.lrlAuthorName,
          role: "Governor of Texas",
          tenure: {
            candidateId: request.candidate.id,
            start: governor.start,
            ...(governor.end ? { end: governor.end } : {}),
            sourceUrl: governor.sourceUrl,
          },
        },
      },
      "Governor executive orders from the LRL governor documents catalog (number, caption, date, scanned PDF).",
    );
  }

  if (tx) {
    for (const [id, adapter, why] of [
      ["acc-board-minutes", "acc-board-minutes", "ACC current trustee identity, official minutes indexes, raw PDFs and separate unreviewed OCR; native named votes only."],
      ["aisd-board-minutes", "aisd-board-minutes", "AISD current trustee identity, public Diligent meeting/minutes discovery and legacy BoardDocs availability check; agendas are not votes."],
      ["travis-office-records", "travis-office-records", "Travis County non-voting offices and trial courts: official profiles, reports and court-rule archives as private research context, never fabricated actions."],
    ]) add({ id, adapter, config: { maxDocuments: documentCap } }, why);
    add(
      {
        id: "travis-commissioners-court",
        adapter: "civicclerk",
        config: {
          baseUrl: "https://traviscotx.api.civicclerk.com/v1",
          role: "Travis County Commissioners Court member",
          maxMeetings: 60,
        },
      },
      "Travis County Commissioners Court: government-linked CivicClerk events and explicitly named structured minutes votes; no participation inferred from attendance or item sponsorship.",
    );
    add(
      { id: "tx-court-opinions", adapter: "tx-court-opinions", config: {} },
      "Texas appellate opinions: exact full-name identity from official current court rosters; attributed written opinions only, not panel membership.",
    );
  }
  // ——— Remaining sources without automatic discovery ———
  gaps.push(
    "Texas Register (agency rule filings): adapter exists but has no wired discovery. Governor executive orders come from the LRL catalog, which lists orders only for governors it covers.",
  );
  gaps.push(
    "TX judicial: appellate discovery covers current roster members only with bounded release-day/action budgets. Former courts, trial judges, sanctions, and full opinion text still require additional official sources; docket labels are not policy evidence.",
  );
  gaps.push(
    "Travis County office/trial-court context and ACC/AISD minutes discovery are wired, but current-roster identity, archive availability, unreadable PDFs, OCR review, unpublished/non-public minutes, legacy BoardDocs access and document budgets limit coverage. Office reports and shared rules are not personal actions; historical tenures remain unverified.",
  );

  // Always attempt House/Congress.gov identity so bioguide-bound sources can run when
  // the person has congressional service — including when the race sought is not federal.
  const identity = { provider: "house" as const, config: tx ? { state: "TX" } : {} };
  rationale.unshift(
    "Congressional bioguide identity (Clerk roster + Congress.gov) attempted for every candidate; unresolved identity soft-skips only bioguide-bound adapters.",
  );

  return {
    plan: {
      since,
      exhaustive: options.exhaustive,
      identity,
      sources,
    },
    rationale,
    gaps,
  };
}
