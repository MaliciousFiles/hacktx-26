// aggregate.ts — Stage 4: aggregate Evidence[] into CandidateProfile stances (PLAN.md §6).
// Light weighting for the optional alignment aid only (Invariant 12): actions modestly over voice,
// contested votes over unanimous. Dates are shown to the user rather than weighted away.
// No model calls — pure T1 over T2 data.
import type {
  Evidence,
  EventDate,
  OfficialAction,
  CandidateProfile,
  StanceAgg,
  IssueId,
  EvidenceState,
  EvidenceRef,
  PresentedEvidence,
  SaysVsDoes,
  Bipartisanship,
  FundingMap,
  MoneyFlow,
  Entity,
  Prob,
  Position,
  SourceType,
} from "@ftb/types";
import { computeSpecificityTier, computeDarkShareInterval } from "@ftb/types/scoring";

export interface AggregateInput {
  candidateId: string;
  contestId: string;
  incumbent: boolean;
  recordInOffice: "federal" | "state" | "local" | "none";
  evidence: Evidence[];
  actions: OfficialAction[];
  moneyFlows: MoneyFlow[];
  entities: Map<string, Entity>;
  /** ISO date string — the release's fixed reference date for recency decay. */
  asOfDate: string;
  /** Reviewed event grouping supplied by the batch runner (not mention counts). */
  eventIds?: Record<string, string>;
}

const SUFFICIENT_ISSUES = 3;
const SUFFICIENT_EVENTS_PER_ISSUE = 2;

// ── Recency decay ──────────────────────────────────────────────────────────────

// Undated evidence is shown as "date unknown" and counts less here; it is never treated as new.
// Draft value; freeze in prereg.yaml.
const UNDATED_WEIGHT = 0.5;

function recencyDecay(eventDate: EventDate, asOfDate: string): Prob {
  const date = eventDate.date;
  if (!date) return UNDATED_WEIGHT;
  const msPerYear = 1000 * 60 * 60 * 24 * 365.25;
  const ageYears = Math.max(0, new Date(asOfDate).getTime() - new Date(date).getTime()) / msPerYear;
  // Half-life of 4 years
  return Math.pow(0.5, ageYears / 4);
}

// ── Evidence weight ────────────────────────────────────────────────────────────

const NEAR_ZERO = 0.02; // draft; freeze in prereg.yaml
const VOTE_TYPES = new Set<OfficialAction["type"]>([
  "floor_vote",
  "committee_vote",
  "board_vote",
  "rule_vote",
  "permit_vote",
  "budget_vote",
]);

/**
 * Action evidence outweighs voice (Invariant 12).
 * Contested votes (margin recorded, minority ≥10%) outweigh unanimous.
 */
function actionFactor(ev: Evidence, actions: OfficialAction[]): number {
  // Invariant 12: contested recorded votes outweigh unanimous, voice and consent
  // votes, which weigh about 0. A vote without a recorded margin can't be shown
  // to be contested, so it doesn't get contested weight either.
  if (!ev.actionId) return 1;
  const action = actions.find((a) => a.id === ev.actionId);
  const isVote = !!action && VOTE_TYPES.has(action.type);
  if (action?.consent || action?.vote?.method === "voice") return NEAR_ZERO;
  if (action?.margin) {
    const total = action.margin.yes + action.margin.no;
    const minority = Math.min(action.margin.yes, action.margin.no);
    return total > 0 && minority / total >= 0.1 ? 1.5 : NEAR_ZERO;
  }
  return isVote ? NEAR_ZERO : 1;
}

/** A near-zero-weight act (e.g. unanimous vote) isn't an independent stance event. */
function countsAsEvent(ev: Evidence, actions: OfficialAction[]): boolean {
  return actionFactor(ev, actions) > NEAR_ZERO;
}

function evidenceWeight(ev: Evidence, actions: OfficialAction[], asOfDate: string): number {
  const base = ev.kind === "action" ? 2.0 : 1.0;
  return base * actionFactor(ev, actions) * ev.relevance * recencyDecay(ev.eventDate, asOfDate);
}

// ── Stance aggregation ─────────────────────────────────────────────────────────

function aggregateStances(
  evidence: Evidence[],
  actions: OfficialAction[],
  asOfDate: string,
  eventIds: Record<string, string> = {},
): Record<IssueId, StanceAgg> {
  const issueGroups = new Map<IssueId, Evidence[]>();
  for (const ev of evidence) {
    const group = issueGroups.get(ev.issueId) ?? [];
    group.push(ev);
    issueGroups.set(ev.issueId, group);
  }

  const stances: Record<IssueId, StanceAgg> = {};

  for (const [issueId, evs] of issueGroups) {
    let weightedPos = 0;
    let totalWeight = 0;
    const bySourceType: Partial<Record<SourceType, number[]>> = {};

    for (const ev of evs) {
      const w = evidenceWeight(ev, actions, asOfDate);
      weightedPos += ev.position * w;
      totalWeight += w;

      const existing = bySourceType[ev.sourceType] ?? [];
      existing.push(ev.position);
      bySourceType[ev.sourceType] = existing;
    }

    const position: Position = totalWeight > 0 ? weightedPos / totalWeight : 0;

    // evidenceStrength = distinct source breadth + recency + agreement (not model confidence)
    const distinctEvents = new Set(
      evs.filter((e) => countsAsEvent(e, actions)).map((e) => eventIds[e.id] ?? e.sourceId),
    ).size;
    const meanPosition = evs.reduce((sum, ev) => sum + ev.position, 0) / evs.length;
    const spread = Math.sqrt(
      evs.reduce((sum, ev) => sum + (ev.position - meanPosition) ** 2, 0) / evs.length,
    );
    const agreement = 1 - Math.min(1, spread);
    const freshness =
      evs.reduce((sum, ev) => sum + recencyDecay(ev.eventDate, asOfDate), 0) / evs.length;
    const evidenceStrength =
      Math.min(1, distinctEvents / 3) * (0.5 + 0.25 * freshness + 0.25 * agreement);

    const bySourceTypeMean: Partial<Record<SourceType, Position>> = {};
    for (const [type, positions] of Object.entries(bySourceType)) {
      bySourceTypeMean[type as SourceType] =
        positions.reduce((a, b) => a + b, 0) / positions.length;
    }

    stances[issueId] = { position, evidenceStrength, bySourceType: bySourceTypeMean };
  }

  return stances;
}

// ── Evidence state ─────────────────────────────────────────────────────────────

function computeEvidenceState(
  evidence: Evidence[],
  actions: OfficialAction[],
  eventIds: Record<string, string> = {},
): { overall: EvidenceState; byIssue: Record<IssueId, EvidenceState> } {
  const issueGroups = new Map<IssueId, Evidence[]>();
  for (const ev of evidence) {
    const group = issueGroups.get(ev.issueId) ?? [];
    group.push(ev);
    issueGroups.set(ev.issueId, group);
  }

  const byIssue: Record<IssueId, EvidenceState> = {};
  for (const [issueId, evs] of issueGroups) {
    const distinctSources = new Set(
      evs.filter((e) => countsAsEvent(e, actions)).map((e) => eventIds[e.id] ?? e.sourceId),
    ).size;
    if (distinctSources >= SUFFICIENT_EVENTS_PER_ISSUE) byIssue[issueId] = "sufficient";
    else if (evs.length > 0) byIssue[issueId] = "thin";
    else byIssue[issueId] = "none";
  }

  const sufficientCount = Object.values(byIssue).filter((s) => s === "sufficient").length;
  const overall: EvidenceState =
    sufficientCount >= SUFFICIENT_ISSUES
      ? "sufficient"
      : Object.keys(byIssue).length > 0
        ? "thin"
        : "none";

  return { overall, byIssue };
}

// ── Says vs. Does ──────────────────────────────────────────────────────────────

/** Independent events required on EACH side before a Says vs. Does gap is shown (draft). */
const SAYS_DOES_MIN_EVENTS = 2;

function computeSaysVsDoes(
  stances: Record<IssueId, StanceAgg>,
  evidence: Evidence[],
  actions: OfficialAction[],
  asOfDate: string,
  eventIds: Record<string, string> = {},
): SaysVsDoes[] {
  const result: SaysVsDoes[] = [];
  const weightedMean = (evs: Evidence[]): Position | undefined => {
    let sum = 0;
    let total = 0;
    for (const ev of evs) {
      const w = evidenceWeight(ev, actions, asOfDate);
      sum += ev.position * w;
      total += w;
    }
    return total > 0 ? sum / total : undefined;
  };
  const events = (evs: Evidence[]) =>
    new Set(evs.filter((e) => countsAsEvent(e, actions)).map((e) => eventIds[e.id] ?? e.sourceId))
      .size;

  for (const issueId of Object.keys(stances) as IssueId[]) {
    const onIssue = evidence.filter((e) => e.issueId === issueId);
    // Truncated search snippets are leads, not a full statement.
    const voiceEvs = onIssue.filter((e) => e.kind === "voice" && e.sourceType !== "social_snippet");
    const actionEvs = onIssue.filter((e) => e.kind === "action");
    const socialEvs = voiceEvs.filter((e) => e.sourceType === "social_post");

    // Only with adequate independent evidence on BOTH sides (PLAN §6.9). One
    // speech vs. one unanimous vote is not a measurable gap.
    if (events(voiceEvs) < SAYS_DOES_MIN_EVENTS || events(actionEvs) < SAYS_DOES_MIN_EVENTS)
      continue;
    const says = weightedMean(voiceEvs);
    const does = weightedMean(actionEvs);
    if (says === undefined || does === undefined) continue;
    const social = socialEvs.length ? weightedMean(socialEvs) : undefined;

    result.push({
      issueId,
      says,
      ...(social !== undefined ? { social } : {}),
      does,
      gap: Math.abs(does - says),
    });
  }

  return result;
}

// ── Specificity ────────────────────────────────────────────────────────────────

function computeSpecificity(evidence: Evidence[]): { score: number; tier: 0 | 1 | 2 } {
  if (evidence.length === 0) return { score: 0, tier: 0 };
  const avg = evidence.reduce((s, e) => s + e.specificity, 0) / evidence.length;
  return { score: avg, tier: computeSpecificityTier(avg) };
}

// ── Funding ────────────────────────────────────────────────────────────────────

function aggregateFunding(
  flows: MoneyFlow[],
  entities: Map<string, Entity>,
  candidateId: string,
  asOfDate: string,
): FundingMap | undefined {
  if (flows.length === 0) return undefined;

  const direct = flows
    .filter((f) => f.kind === "contribution" || f.kind === "transfer")
    .reduce((acc, f) => ({ min: acc.min + f.amount.min, max: acc.max + f.amount.max }), {
      min: 0,
      max: 0,
    });

  const outside = flows
    .filter((f) => f.kind === "independent_expenditure" || f.kind === "electioneering")
    .reduce((acc, f) => ({ min: acc.min + f.amount.min, max: acc.max + f.amount.max }), {
      min: 0,
      max: 0,
    });

  const fcc = flows
    .filter((f) => f.kind === "ad_buy" && f.sourceUrl.includes("publicfiles.fcc.gov"))
    .reduce((acc, f) => ({ min: acc.min + f.amount.min, max: acc.max + f.amount.max }), {
      min: 0,
      max: 0,
    });

  const meta = flows
    .filter((f) => f.kind === "ad_buy" && f.sourceUrl.includes("facebook.com"))
    .reduce((acc, f) => ({ min: acc.min + f.amount.min, max: acc.max + f.amount.max }), {
      min: 0,
      max: 0,
    });

  const google = flows
    .filter((f) => f.kind === "ad_buy" && f.sourceUrl.includes("transparencyreport.google.com"))
    .reduce((acc, f) => ({ min: acc.min + f.amount.min, max: acc.max + f.amount.max }), {
      min: 0,
      max: 0,
    });

  // Traced — mark PAC pass-throughs; "dark" = trail ends at non-disclosing entity
  const pacPassThrough = flows
    .filter((f) => {
      const entity = entities.get(f.from);
      return entity?.kind === "pac" || entity?.kind === "org_527";
    })
    .reduce((acc, f) => ({ min: acc.min + f.amount.min, max: acc.max + f.amount.max }), {
      min: 0,
      max: 0,
    });

  const darkFlows = flows.filter((f) => {
    const entity = entities.get(f.from);
    return (
      entity?.kind === "nonprofit_c4" ||
      entity?.kind === "nonprofit_c6" ||
      entity?.kind === "unknown"
    );
  });
  const dark = darkFlows.reduce(
    (acc, f) => ({ min: acc.min + f.amount.min, max: acc.max + f.amount.max }),
    { min: 0, max: 0 },
  );

  const itemized = flows
    .filter((f) => f.kind === "contribution" && f.amount.min >= 200)
    .reduce((acc, f) => ({ min: acc.min + f.amount.min, max: acc.max + f.amount.max }), {
      min: 0,
      max: 0,
    });
  const unitemizedSmall = flows
    .filter((f) => f.kind === "contribution" && f.amount.max < 200)
    .reduce((acc, f) => ({ min: acc.min + f.amount.min, max: acc.max + f.amount.max }), {
      min: 0,
      max: 0,
    });

  // Date range from flows
  const dates = flows.map((f) => f.date).sort();
  const period = {
    start: dates[0] ?? asOfDate,
    end: dates[dates.length - 1] ?? asOfDate,
  };

  const fundingMap: FundingMap = {
    period,
    direct,
    outside,
    ads: { fcc, meta, google },
    traced: {
      receipts: { itemized, unitemizedSmall, pacPassThrough },
      outside: {
        disclosed: { min: outside.min - dark.min, max: outside.max - dark.max },
        dark,
        unresolved: { min: 0, max: 0 },
      },
    },
    topIndustries: [], // populated separately when entity industry data is available
  };

  // Attach darkShare if computable
  const darkShare = computeDarkShareInterval(fundingMap);
  if (darkShare) fundingMap.darkShare = darkShare;

  return fundingMap;
}

// ── Main ───────────────────────────────────────────────────────────────────────

/**
 * Aggregate Evidence[] into a partial CandidateProfile (stances, evidenceState, specificity,
 * saysVsDoes, funding). Caller fills in generated fields (platformHighlights, plans, etc.)
 * from generate.ts.
 */
export function aggregateCandidate(
  input: AggregateInput,
): Omit<
  CandidateProfile,
  | "platformHighlights"
  | "plans"
  | "credibility"
  | "promiseKept"
  | "truthfulness"
  | "bipartisanship"
  | "judicialProfile"
> {
  const stances = aggregateStances(input.evidence, input.actions, input.asOfDate, input.eventIds);
  const { overall: evidenceState, byIssue: issueEvidenceState } = computeEvidenceState(
    input.evidence,
    input.actions,
    input.eventIds,
  );
  // Invariant 1: thin evidence abstains to Objective Info Mode rather than comparing.
  const coverage = evidenceState === "sufficient" ? "full" : "objective_only";

  // Verbatim excerpt; callers must run the identity redactor/leak gate before
  // serializing, and then mark the excerpt redacted.
  const presentedEvidence: PresentedEvidence[] = input.evidence.map((ev) => {
    const { quote, ...rest } = ev;
    return { ...rest, excerpt: quote, redacted: false };
  });

  const specificity = computeSpecificity(input.evidence);
  const saysVsDoes = computeSaysVsDoes(
    stances,
    input.evidence,
    input.actions,
    input.asOfDate,
    input.eventIds,
  );
  const funding = aggregateFunding(
    input.moneyFlows,
    input.entities,
    input.candidateId,
    input.asOfDate,
  );

  return {
    id: input.candidateId,
    contestId: input.contestId,
    coverage,
    incumbent: input.incumbent,
    recordInOffice: input.recordInOffice,
    evidenceState,
    issueEvidenceState,
    stances,
    evidence: presentedEvidence,
    specificity,
    credibility: { score: 1.0, flags: [] }, // flags added by classify stage review
    saysVsDoes,
    ...(funding ? { funding } : {}),
  } as Omit<
    CandidateProfile,
    | "platformHighlights"
    | "plans"
    | "credibility"
    | "promiseKept"
    | "truthfulness"
    | "bipartisanship"
    | "judicialProfile"
  >;
}
