// @ftb/types — integration contract between all workstreams (PLAN.md §9).
// Changing anything here requires sign-off from every owner.

// ---------- Primitives ----------
export type ID = string;
export type ISODate = string; // "2026-10-20"
export type Prob = number; // 0..1
export type Position = number; // -1 (defined negative pole) .. +1 (defined positive pole)
export type IssueId = string; // hierarchical: "housing", "housing.zoning"
export type Level = "federal" | "state" | "local";

// ---------- Release / provenance ----------
export interface Release {
  id: string; // "data-v3"
  asOfDate: ISODate; // fixed reference date for recency decay (never wall-clock)
  // This election's campaign period, identical for every candidate. Evidence dated inside it is
  // labeled "this campaign"; older evidence stays visible, labeled with its own date.
  campaignWindow: { since: ISODate; until: ISODate };
  manifestHash: string;
  configVersions: Record<string, string>; // issues, rubrics, thresholds, authority, sources
  modelVersions: Record<string, string>; // { jev: "jev-1.14", llm: "..." } — never "latest"
}

// ---------- Taxonomy & authority ----------
export interface Issue {
  id: IssueId;
  parentId?: IssueId;
  label: string;
  levels: Level[];
  negativePole: string; // coordinate labels only; neither pole is disfavored
  positivePole: string;
}

export type OfficeKind =
  "legislative" | "executive" | "regulatory" | "judicial" | "board" | "measure";
export type Power = "direct" | "influence" | "none";

export interface OfficeAuthority {
  office: string; // "tx_railroad_commissioner"
  issueId: IssueId;
  power: Power;
}

export type JudicialDim =
  "text_vs_purpose" | "restraint_vs_review" | "precedent" | "procedural_strictness";
export type JudicialVector = Partial<Record<JudicialDim, UserIssueStance>>;

// ---------- Model outputs ----------
/** Full Jev output. Never collapse to argmax only. */
export interface Distribution {
  probs: Record<string, Prob>;
  confidence: Prob;
}

export interface StanceAgg {
  position: Position;
  evidenceStrength: Prob; // breadth, quality, agreement; not model probability
  bySourceType: Partial<Record<SourceType, Position>>;
}

export interface PoleMapping {
  a: Position; // reviewed coordinates for displayed option A on this issue
  b: Position; // reviewed coordinates for displayed option B on this issue
  weight: number; // nonnegative, ≤1
}

// ---------- User side (on-device only) ----------
interface CardBase {
  id: ID;
  anchor: boolean;
  deck: "policy" | "judicial";
}

/** A symmetric choice between two poles on one axis, displayed in randomized order. */
export interface PoleCard extends CardBase {
  kind: "pole";
  deck: "policy";
  issueId: IssueId;
  poleA: string;
  poleB: string;
  vector: Record<IssueId, PoleMapping>; // same issue axes as candidates; positions frozen + reviewed
}

/** A cross-issue decision: X at the cost of Y; declining does NOT imply anti-X. */
export interface TradeoffCard extends CardBase {
  kind: "tradeoff";
  deck: "policy";
  policy: string;
  cost: string;
  policyIssues: IssueId[];
  costIssues: IssueId[];
  // No signed stance vector: this teaches/elicits priorities, not direct alignment.
}

export interface JudicialCard extends CardBase {
  kind: "judicial_pole";
  deck: "judicial";
  dimension: JudicialDim;
  poleA: string;
  poleB: string;
  coordinates: { a: Position; b: Position };
}

export type PolicyCard = PoleCard | TradeoffCard | JudicialCard;

export type Swipe = {
  cardId: ID;
  starred: boolean; // explicit importance, not direction; valid for either card
} & (
  | { kind: "pole"; chosen: "a" | "b" | "skip" }
  | { kind: "tradeoff"; chosen: "accept" | "decline" | "skip" }
  | { kind: "judicial_pole"; chosen: "a" | "b" | "skip" }
);

export interface UserIssueStance {
  position: Position;
  userCertainty: Prob; // agreement + number of non-skipped cards
  salience: number;
}
export type UserVector = Record<IssueId, UserIssueStance | null>;

// ---------- Sources & evidence ----------
export type SourceType =
  | "official_action"
  | "official_doc"
  | "questionnaire"
  | "debate_speech"
  | "campaign_site"
  | "archived_campaign_site"
  | "social_post"
  | "social_snippet"
  | "news";

/** How we know when something was said or done. Shown next to every date in the app. */
export type DateBasis =
  | "published" // timestamp on the item itself (post, article, video)
  | "official_record" // date of the vote, filing, order or opinion
  | "event" // date of the debate, forum or town hall
  | "page_observed" // undated page (e.g. live campaign site): "says this as of" fetchedAt
  | "archive_capture" // Wayback capture: "said this no later than"
  | "unknown"; // never filled in with fetchedAt

export interface EventDate {
  date?: ISODate; // present unless basis === "unknown"
  basis: DateBasis;
  // "week"/"month" for relative or coarse dates such as "3 weeks ago" or "May 2025".
  precision: "day" | "week" | "month" | "year";
}

export interface Source {
  id: ID;
  contestId: ID;
  candidateId?: ID;
  // Verified speaker/actor spans in originalText when a source covers multiple people.
  attributions?: { candidateId: ID; start: number; end: number }[];
  type: SourceType;
  url: string;
  outlet?: string;
  fetchedAt: ISODate; // when we fetched it; NOT when it was said
  publishedAt?: ISODate;
  eventDate: EventDate; // when it was said, and how we know
  contentHash: string;
  originalText: string; // immutable fetched text; pipeline-only, never send pre-reveal
  text: string; // normalized, NOT a classifier input; use versioned projection first
}

export interface ClassificationInput {
  sourceId: ID;
  text: string;
  mode: "names_only" | "names_and_party" | "unmasked_eval_only";
  projectionVersion: string;
}

/** Source-level citation, also works for proposition and contest context facts. */
export interface SourceCitation {
  id: ID;
  sourceId: ID;
  scope: { kind: "contest" | "measure"; id: ID };
  candidateId?: ID; // if attributed to a candidate, may not support a different candidate's claims
  excerptSpan: { start: number; end: number }; // originalText UTF-16 span
  excerpt: string; // verified verbatim or explicitly redacted after verification
  redacted: boolean;
  publishedAt?: ISODate;
  outlet?: string;
  // No direct source URL in pre-reveal API payload.
}

/** Pipeline-only proof for a source-level citation; never serialized to /ballot. */
export interface RawSourceCitation extends SourceCitation {
  originalExcerpt: string;
}

export type EvidenceRef =
  | { kind: "candidate"; id: ID } // Evidence.id
  | { kind: "source"; id: ID }; // SourceCitation.id

/** Exactly one sentence; citations resolve to this release's evidence or source citations. */
export interface CitedSentence {
  text: string;
  citations: EvidenceRef[]; // nonempty; checked at publication
}

export type ClaimType = "promise" | "advocacy" | "value";

export interface Evidence {
  id: ID;
  contestId: ID;
  sourceId: ID;
  actionId?: ID; // link to official action if this is a record-derived claim
  candidateId: ID;
  issueId: IssueId;
  kind: "action" | "voice";
  sourceType: SourceType;
  eventDate: EventDate; // shown with the evidence; unknown dates stay unknown
  quote: string; // verbatim substring of Source.originalText (checked in code)
  quoteSpan: { start: number; end: number }; // UTF-16 code-unit offsets into originalText; slice must equal quote
  position: Position;
  distribution: Distribution; // modelConfidence; never substitute for evidenceStrength
  relevance: Prob;
  isOwnSpeech: Prob;
  claimType: ClaimType;
  claimTypeDist: Distribution;
  specificity: number; // 0..1
  proposesSpending?: Prob;
  fundingStated?: Prob;
  withinAuthority: Power;
}

/** Masked response may redact an original quote; redacted excerpts aren't called verbatim. */
export type PresentedEvidence = Omit<Evidence, "quote"> & {
  excerpt: string;
  redacted: boolean;
};

// ---------- Official records ----------
export type ActionType =
  | "floor_vote"
  | "committee_vote"
  | "authored"
  | "cosponsored"
  | "signed"
  | "vetoed"
  | "executive_order"
  | "lawsuit"
  | "legal_opinion"
  | "rule_vote"
  | "permit_vote"
  | "budget_vote"
  | "board_vote"
  | "appointment"
  | "judicial_opinion";

export interface OfficialAction {
  id: ID;
  actorId: ID;
  issueIds: IssueId[]; // may be empty until classification is reviewed
  role: string; // "TX House D49", "Austin CM D9" — prior offices included
  body?: string;
  type: ActionType;
  stance: "yes" | "no" | "abstain" | "author" | "n/a";
  margin?: { yes: number; no: number }; // contested votes weigh more
  date: ISODate;
  title: string;
  officialText: string; // e.g. HRO/SRC analysis, CRS summary, order text
  sourceUrl: string;
}

// ---------- Candidate ----------
export type EvidenceState = "sufficient" | "thin" | "none";

export type Slot =
  | { state: "documented"; sentences: CitedSentence[] }
  | { state: "not_stated" }
  | { state: "not_applicable"; reason: CitedSentence };

export interface Plan {
  id: ID;
  issueId: IssueId;
  goal: Slot;
  mechanism: Slot;
  cost: Slot;
  funding: Slot;
  timeline: Slot;
  whoActs: Slot;
  specificity: number;
}

export type CredibilityFlagType = "beyond_power" | "needs_others" | "no_funding" | "funded";
export interface CredibilityFlag {
  type: CredibilityFlagType;
  issueId: IssueId;
  evidenceIds: ID[];
}

export type PromiseStatus = "kept" | "fought_for" | "broken" | "no_action" | "outside_power";
export interface PromiseRecord {
  promise: CitedSentence[];
  madeAt: ISODate;
  sourceId: ID; // usually archived_campaign_site
  status: PromiseStatus;
  actionIds: ID[];
}

/** Historical association about the usefulness of a metric, not a candidate prediction. */
export interface ResearchFinding {
  id: ID;
  releaseId: string;
  datasetHash: string;
  metric: "plan_specificity"; // expand only after evaluation
  threshold: number; // set before looking at historical outcomes
  outcome: "documented_effort" | "achieved_outcome";
  windowMonths: number; // same opportunity window in both groups
  population: string; // e.g. "elected TX legislators, 2018–2022"
  unit: "promise"; // rates below are promise-level; account for clustering by politician
  high: { politicians: number; eligiblePromises: number; outcomes: number; rate: Prob };
  low: { politicians: number; eligiblePromises: number; outcomes: number; rate: Prob };
  riskRatio?: { value: number; lower95: number; upper95: number }; // omit if unstable/unsupported
  excluded: { unresolved: number; notYetDue: number; unverifiable: number };
  methodDocId: ID; // methodology + review log, accessible in How it works
  caveat: string; // association ≠ causation; applies only to sampled offices/years
}

export interface FactCheck {
  claim: CitedSentence[];
  outlet: string; // IFCN signatory only
  rating: string; // outlet's own label
  normalized?: number; // internal analysis only; no candidate-level score without audit
  sourceId: ID; // full link is reveal-only
  date: ISODate;
}

export interface RecordVerifiedClaim {
  evidenceId: ID;
  verdict: "matches_record" | "contradicts_record" | "not_found";
  actionIds: ID[];
}

export interface SaysVsDoes {
  issueId: IssueId;
  says?: Position;
  social?: Position;
  does?: Position;
  gap: number; // |does - says|; emitted only with sufficient evidence for both
}

export interface Bipartisanship {
  label: "bipartisanship" | "coalition_breadth";
  composite?: number; // design (a)
  bridgeBuilder?: number; // design (b)
  maverick?: number; // design (b)
  components: { cosponsorship?: number; partyBreaks?: number; rhetoric?: number };
}

export interface JudicialProfile {
  philosophy: Partial<Record<JudicialDim, StanceAgg>>;
  experienceYears?: number;
  boardCertified?: boolean;
  barPoll?: { sourceId: ID; summary: Record<string, number> };
  courtStats?: { clearanceRate?: number; backlog?: number; sourceId: ID };
}

/** Everything shown before reveal. Contains NO name, party, photo, or identifying donors. */
export interface CandidateProfile {
  id: ID;
  contestId: ID;
  coverage: "full" | "objective_only"; // never silently imply analysis of all contests
  incumbent: boolean;
  recordInOffice: Level | "none";
  evidenceState: EvidenceState;
  issueEvidenceState: Record<IssueId, EvidenceState>;
  stances: Record<IssueId, StanceAgg>; // empty for judges (policy never scored)
  evidence: PresentedEvidence[]; // presentation projection; no raw quote text
  // No raw OfficialAction: titles, role strings and URLs can identify a candidate.
  // Before reveal, use non-identifying descriptions with citations held for reveal.
  platformHighlights: CitedSentence[];
  plans: Plan[];
  specificity: { score: number; tier: number };
  credibility: { score: number; flags: CredibilityFlag[] };
  saysVsDoes: SaysVsDoes[];
  promiseKept: PromiseRecord[];
  truthfulness: { factChecks: FactCheck[]; recordVerified: RecordVerifiedClaim[] };
  bipartisanship?: Bipartisanship;
  funding?: FundingMap; // aggregate-only pre-reveal; no entity or flow identifiers
  judicialProfile?: JudicialProfile;
}

/** Only returned by /reveal. */
export interface CandidateIdentity {
  id: ID;
  name: string;
  party?: string;
  photoUrl?: string;
  website?: string;
}

// ---------- Money ----------
/** Exact amounts have min === max. Meta spend is always a range. */
export interface MoneyRange {
  min: number;
  max: number;
}

export type EntityKind =
  | "individual"
  | "pac"
  | "party_committee"
  | "business"
  | "nonprofit_c4"
  | "nonprofit_c6"
  | "org_527"
  | "unknown";

export interface Entity {
  id: ID;
  name: string;
  kind: EntityKind;
  industry?: string;
  inState?: boolean;
}

export interface MoneyFlow {
  id: ID;
  from: ID; // Entity.id
  to: ID; // committee / candidate / measure-side id
  kind: "contribution" | "transfer" | "independent_expenditure" | "electioneering" | "ad_buy";
  amount: MoneyRange;
  date: ISODate;
  supports?: ID; // candidateId or `${measureId}:yes|no`
  opposes?: ID;
  sourceUrl: string; // FEC / TEC / City Clerk / FCC / Meta / Google
}

export interface FundingMap {
  period: { start: ISODate; end: ISODate };
  // Direct receipts and independent spending are different bases; never add them as one "total".
  direct: MoneyRange;
  outside: MoneyRange;
  ads: { fcc: MoneyRange; meta: MoneyRange; google: MoneyRange };
  traced: {
    receipts: {
      itemized: MoneyRange;
      unitemizedSmall: MoneyRange; // NOT dark money
      pacPassThrough: MoneyRange;
    };
    outside: {
      disclosed: MoneyRange;
      dark: MoneyRange; // trail ends at a non-disclosing entity
      unresolved: MoneyRange; // unknown is NOT automatically dark
    };
  };
  darkShare?: { min: Prob; max?: Prob; denominator: MoneyRange; basis: "outside_spending" }; // numerator = traced.outside.dark
  topIndustries: {
    industry: string;
    amount: MoneyRange;
    basis: "direct_receipts" | "outside_spending";
  }[];
  inStateShare?: Prob;
  // Entity names, MoneyFlow identifiers and source URLs are reveal-only.
}

// ---------- Contests ----------
export interface ContextClaim {
  sentences: CitedSentence[];
  attributedTo?: string; // reviewed/anonymous before reveal when this is a candidate identity
}

export interface ContextBrief {
  confirmed: ContextClaim[]; // official doc OR ≥2 independent allowlisted outlets
  supporters: ContextClaim[];
  opponents: ContextClaim[]; // same cap as supporters
  disputed: ContextClaim[];
  notes: (
    | { kind: "verified"; sentence: CitedSentence }
    | { kind: "system"; code: "no_organized_opposition_found" | "data_unavailable" }
  )[];
}

export interface MeasureProfile {
  ballotText: { text: string; citation: EvidenceRef }; // verbatim official ballot text
  yesMeans: Slot;
  noMeans: Slot;
  fiscal?: {
    principal?: number;
    interest?: number;
    taxImpact?: CitedSentence[];
    citations: EvidenceRef[];
  };
  funding?: { yes?: FundingMap; no?: FundingMap }; // absent filings ≠ zero dollars
  issueVector: Record<IssueId, StanceAgg>;
}

export interface Contest {
  id: ID;
  title: string;
  office: string; // key into OfficeAuthority
  officeKind: OfficeKind;
  districtType: string; // "us_house", "aisd_trustee"
  districtId: string;
  partisan: boolean;
  candidateIds: ID[];
  officeDescription: CitedSentence[]; // verified objective summary, available even without stance data
  seats: number;
  unopposed: boolean;
  writeInsAllowed?: boolean;
  measure?: MeasureProfile;
  context: ContextBrief;
}

export interface Ballot {
  id: ID;
  releaseId: string;
  ballotStyleId: string; // election-specific official style; address is never stored
  precinctId?: string; // context only; not sufficient as the API lookup key
  contestIds: ID[];
  requiresJudicialDeck: boolean;
}

// ---------- Matching (computed on-device) ----------
export type Bucket =
  "happily_ever_after" | "good_company" | "different_paths" | "worlds_apart" | "clouded";

export interface MatchResult {
  candidateId: ID;
  bucket: Bucket;
  matchClarity: Prob; // coverage + evidence quality, not model confidence
  issuesCompared: number;
  agreements: ID[]; // evidence ids
  disagreements: ID[];
}

export interface ContestMatch {
  contestId: ID;
  results: MatchResult[];
  noStrongMatch: boolean;
}

/** Distinct philosophy-only comparison; never fed into policy MatchResult. */
export interface JudicialComparison {
  contestId: ID;
  results: {
    candidateId: ID;
    evidenceState: EvidenceState;
    dimensions: Partial<Record<JudicialDim, { proximity: Prob; evidenceStrength: Prob }>>;
  }[];
}

/** Max 2 per measure; only emitted when all gates pass. Never a recommendation. */
export interface MeasureConnection {
  measureId: ID;
  issueId: IssueId;
  cardId: ID;
  userPosition: Position;
  measureEffect: Position;
  citations: EvidenceRef[];
}

// ---------- Masking (device-only, crypto-random) ----------
export interface Mask {
  character: string;
  title: string;
  imageUrl: string;
}

export interface MaskSession {
  id: ID;
  scope: "ballot" | "game";
  createdAt: string;
  expiresAt: string; // reveal or 24 hours; persist locally in encrypted storage
  map: Record<ID, Mask>; // candidateId -> Mask; destroyed on reveal, never synced
}

// ---------- Daily challenge ----------
export interface DailyChallenge {
  id: ID;
  date: ISODate;
  game: "quote_match" | "follow_the_gold"; // TBD after prototyping
  payload: unknown;
}

// ---------- API ----------
export interface Api {
  "GET /ballot": {
    query: { ballotStyleId: string; releaseId: string }; // resolve official style offline/manual
    res: {
      release: Release;
      ballot: Ballot;
      contests: Contest[];
      candidates: CandidateProfile[];
      cards: PolicyCard[];
      citations: SourceCitation[];
    };
  };
  "GET /reveal/:contestId": {
    query: { releaseId: string }; // immutable: must match Ballot.releaseId
    res: { releaseId: string; contestId: ID; identities: CandidateIdentity[] };
  };
  "GET /daily": { query: { date: ISODate }; res: DailyChallenge };
  "GET /research": { query: { releaseId: string }; res: ResearchFinding[] };
  // Share image is rendered locally and sent via the OS share sheet; no POST /share.
}

// ---------- Pipeline adapters ----------
export interface BallotProvider {
  jurisdiction: string; // "tx-travis"
  allContests(): Promise<Contest[]>;
  lookup(
    lat: number,
    lng: number,
  ): Promise<
    | { status: "resolved"; ballotStyleId: string; precinctId?: string; contestIds: ID[] }
    | { status: "needs_manual_ballot_style" }
  >; // device-only implementation; coordinates never sent to API
}

export interface RecordProvider {
  covers: string[]; // ["tx_house", "tx_senate"]
  actionsFor(personKey: string): Promise<OfficialAction[]>;
}

export interface SourceFinder {
  type: SourceType;
  queryTemplates: string[]; // identical for every candidate in a contest
  find(target: {
    contestId: ID;
    candidateId?: ID;
    vars: Record<string, string>;
    window: { since: ISODate; until: ISODate }; // identical for every candidate in a contest
  }): Promise<Source[]>;
}

export interface FinanceProvider {
  name: "fec" | "tec" | "austin_clerk" | "fcc" | "meta" | "google" | "irs_8872" | "irs_eo";
  flowsFor(target: { candidateId?: ID; measureSide?: string }): Promise<MoneyFlow[]>;
  entities(ids: ID[]): Promise<Entity[]>;
}

/** Every model call goes through this. Key = sha256(canonical JSON of spec). */
export interface CachedCallSpec {
  model: string;
  modelVersion: string;
  rubricVersion: string;
  questions: unknown;
  inputHash: string;
}
