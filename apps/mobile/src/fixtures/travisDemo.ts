// Hand-authored sample for the mobile walkthrough.
// Quotes, people, and dollars are fictional. This is not a frozen data release.
// Issue labels live here because GET /ballot does not ship the issue catalog yet.
import type {
  Api,
  CandidateIdentity,
  CandidateProfile,
  CitedSentence,
  Contest,
  Issue,
  PolicyCard,
  PresentedEvidence,
  Slot,
  SourceCitation,
} from "@ftb/types";

export const demoIssues: Issue[] = [
  {
    id: "housing.zoning",
    parentId: "housing",
    label: "Housing",
    levels: ["local"],
    negativePole: "Keep restrictive lot limits",
    positivePole: "Allow more homes by right",
  },
  {
    id: "mobility.transit",
    parentId: "mobility",
    label: "Transit",
    levels: ["local"],
    negativePole: "Keep today's routes and frequency",
    positivePole: "Run frequent all-day service",
  },
  {
    id: "fiscal.property_tax",
    parentId: "fiscal",
    label: "Property taxes",
    levels: ["local"],
    negativePole: "Leave the rate to the county",
    positivePole: "Cap the rate from this office",
  },
];

export const demoIdentities: CandidateIdentity[] = [
  { id: "cand-north", name: "Rowan Hale" },
  { id: "cand-south", name: "Jules Okonkwo" },
  { id: "cand-bench-1", name: "Avery Quinn" },
  { id: "cand-bench-2", name: "Samir Patel" },
];

function cited(text: string, citationId: string): CitedSentence {
  return { text, citations: [{ kind: "source", id: citationId }] };
}

function documented(text: string, citationId: string): Slot {
  return { state: "documented", sentences: [cited(text, citationId)] };
}

const notStated: Slot = { state: "not_stated" };

function citation(input: {
  id: string;
  contestId: string;
  excerpt: string;
  outlet: string;
  publishedAt: string;
  candidateId?: string;
  scope?: "contest" | "measure";
}): SourceCitation {
  return {
    id: input.id,
    sourceId: `src-${input.id}`,
    scope: { kind: input.scope ?? "contest", id: input.contestId },
    candidateId: input.candidateId,
    excerpt: input.excerpt,
    excerptSpan: { start: 0, end: input.excerpt.length },
    redacted: false,
    publishedAt: input.publishedAt,
    outlet: input.outlet,
  };
}

function evidence(input: {
  id: string;
  contestId: string;
  candidateId: string;
  issueId: string;
  kind: PresentedEvidence["kind"];
  sourceType: PresentedEvidence["sourceType"];
  date: string;
  excerpt: string;
  position: number;
  withinAuthority: PresentedEvidence["withinAuthority"];
  claimType?: PresentedEvidence["claimType"];
  proposesSpending?: number;
  fundingStated?: number;
}): PresentedEvidence {
  return {
    id: input.id,
    contestId: input.contestId,
    sourceId: `src-${input.id}`,
    candidateId: input.candidateId,
    issueId: input.issueId,
    kind: input.kind,
    sourceType: input.sourceType,
    eventDate: {
      date: input.date,
      basis: input.kind === "action" ? "official_record" : "published",
      precision: "day",
    },
    excerpt: input.excerpt,
    redacted: false,
    quoteSpan: { start: 0, end: input.excerpt.length },
    position: input.position,
    distribution: { probs: { recorded: 0.8, other: 0.2 }, confidence: 0.74 },
    relevance: 0.9,
    isOwnSpeech: input.kind === "action" ? 1 : 0.96,
    claimType: input.claimType ?? "advocacy",
    claimTypeDist: { probs: { advocacy: 0.7, promise: 0.3 }, confidence: 0.7 },
    specificity: 0.6,
    proposesSpending: input.proposesSpending,
    fundingStated: input.fundingStated,
    withinAuthority: input.withinAuthority,
  };
}

const council = "contest-council";
const court = "contest-court";
const prop = "contest-prop";

const citations: SourceCitation[] = [
  citation({
    id: "cit-council-office",
    contestId: council,
    outlet: "City charter excerpt",
    publishedAt: "2024-01-01",
    excerpt: "The council adopts ordinances and the city budget.",
  }),
  citation({
    id: "cit-north-vote",
    contestId: council,
    candidateId: "cand-north",
    outlet: "Council journal",
    publishedAt: "2025-06-12",
    excerpt: "Voted yes to allow up to four homes on lots now limited to one.",
  }),
  citation({
    id: "cit-north-followup",
    contestId: council,
    candidateId: "cand-north",
    outlet: "Candidate questionnaire",
    publishedAt: "2026-08-02",
    excerpt: "I will bring a follow-up ordinance for homes near frequent bus lines.",
  }),
  citation({
    id: "cit-north-transit",
    contestId: council,
    candidateId: "cand-north",
    outlet: "Candidate questionnaire",
    publishedAt: "2026-08-02",
    excerpt: "I support fifteen-minute bus service on the two busiest corridors in this district.",
  }),
  citation({
    id: "cit-north-fund",
    contestId: council,
    candidateId: "cand-north",
    outlet: "Candidate questionnaire",
    publishedAt: "2026-08-02",
    excerpt: "The extra review work stays inside the planning department's current budget.",
  }),
  citation({
    id: "cit-south-zoning",
    contestId: council,
    candidateId: "cand-south",
    outlet: "Candidate questionnaire",
    publishedAt: "2026-08-02",
    excerpt: "I will keep single-home zoning unless the neighbors agree to a change.",
  }),
  citation({
    id: "cit-south-vote",
    contestId: council,
    candidateId: "cand-south",
    outlet: "Council journal",
    publishedAt: "2025-11-03",
    excerpt: "Voted yes on a corner-lot amendment that allowed one additional home.",
  }),
  citation({
    id: "cit-south-transit",
    contestId: council,
    candidateId: "cand-south",
    outlet: "Candidate questionnaire",
    publishedAt: "2026-08-02",
    excerpt: "Keep the current routes. Extra frequency can wait until ridership returns.",
  }),
  citation({
    id: "cit-south-tax",
    contestId: council,
    candidateId: "cand-south",
    outlet: "Candidate questionnaire",
    publishedAt: "2026-07-20",
    excerpt: "I will cap the county property-tax rate.",
  }),
  citation({
    id: "cit-south-hire",
    contestId: council,
    candidateId: "cand-south",
    outlet: "Candidate questionnaire",
    publishedAt: "2026-08-02",
    excerpt: "I will hire two more plan reviewers in the first budget.",
  }),
  citation({
    id: "cit-council-support",
    contestId: council,
    outlet: "District forum notes",
    publishedAt: "2026-09-04",
    excerpt: "Supporters say the district needs more homes near the bus lines.",
  }),
  citation({
    id: "cit-council-oppose",
    contestId: council,
    outlet: "Block association letter",
    publishedAt: "2026-09-08",
    excerpt: "Opponents say lot splits will crowd streets that already lack parking.",
  }),
  citation({
    id: "cit-court-office",
    contestId: court,
    outlet: "Court description",
    publishedAt: "2024-01-01",
    excerpt: "A county court at law hears the civil and criminal cases assigned to it.",
  }),
  citation({
    id: "cit-court-support",
    contestId: court,
    outlet: "Forum recap",
    publishedAt: "2026-09-12",
    excerpt:
      "Supporters of a longer résumé say the court needs someone who already knows the docket.",
  }),
  citation({
    id: "cit-court-oppose",
    contestId: court,
    outlet: "Voter guide excerpt",
    publishedAt: "2026-09-12",
    excerpt: "Others say years in practice are not the same as a record on the bench.",
  }),
  citation({
    id: "cit-bench-1",
    contestId: court,
    candidateId: "cand-bench-1",
    outlet: "Candidate questionnaire",
    publishedAt: "2026-08-15",
    excerpt: "I have practiced law for fourteen years.",
  }),
  citation({
    id: "cit-bench-2",
    contestId: court,
    candidateId: "cand-bench-2",
    outlet: "Candidate questionnaire",
    publishedAt: "2026-08-15",
    excerpt: "I have practiced law for six years.",
  }),
  citation({
    id: "cit-prop-ballot",
    contestId: prop,
    scope: "measure",
    outlet: "Official ballot",
    publishedAt: "2026-09-01",
    excerpt:
      "Shall the city issue $20 million in general obligation bonds for sidewalks, to be repaid from property taxes?",
  }),
  citation({
    id: "cit-prop-yes",
    contestId: prop,
    scope: "measure",
    outlet: "Bond ordinance",
    publishedAt: "2026-08-20",
    excerpt: "A yes vote authorizes the city to issue up to $20 million in bonds for sidewalks.",
  }),
  citation({
    id: "cit-prop-no",
    contestId: prop,
    scope: "measure",
    outlet: "Bond ordinance",
    publishedAt: "2026-08-20",
    excerpt: "A no vote means the city does not issue these bonds.",
  }),
  citation({
    id: "cit-prop-support",
    contestId: prop,
    scope: "measure",
    outlet: "Yes campaign flyer",
    publishedAt: "2026-09-18",
    excerpt: "Supporters say missing sidewalks are the reason to borrow.",
  }),
  citation({
    id: "cit-prop-oppose",
    contestId: prop,
    scope: "measure",
    outlet: "No campaign flyer",
    publishedAt: "2026-09-18",
    excerpt: "Opponents say the city should repair sidewalks from the existing budget.",
  }),
];

const northEvidence: PresentedEvidence[] = [
  evidence({
    id: "ev-north-vote",
    contestId: council,
    candidateId: "cand-north",
    issueId: "housing.zoning",
    kind: "action",
    sourceType: "official_action",
    date: "2025-06-12",
    excerpt: "Voted yes to allow up to four homes on lots now limited to one.",
    position: 0.8,
    withinAuthority: "direct",
  }),
  evidence({
    id: "ev-north-followup",
    contestId: council,
    candidateId: "cand-north",
    issueId: "housing.zoning",
    kind: "voice",
    sourceType: "questionnaire",
    date: "2026-08-02",
    excerpt: "I will bring a follow-up ordinance for homes near frequent bus lines.",
    position: 0.9,
    withinAuthority: "direct",
    claimType: "promise",
  }),
  evidence({
    id: "ev-north-transit",
    contestId: council,
    candidateId: "cand-north",
    issueId: "mobility.transit",
    kind: "voice",
    sourceType: "questionnaire",
    date: "2026-08-02",
    excerpt: "I support fifteen-minute bus service on the two busiest corridors in this district.",
    position: 0.6,
    withinAuthority: "influence",
  }),
];

const southEvidence: PresentedEvidence[] = [
  evidence({
    id: "ev-south-zoning",
    contestId: council,
    candidateId: "cand-south",
    issueId: "housing.zoning",
    kind: "voice",
    sourceType: "questionnaire",
    date: "2026-08-02",
    excerpt: "I will keep single-home zoning unless the neighbors agree to a change.",
    position: -0.7,
    withinAuthority: "direct",
    claimType: "promise",
  }),
  evidence({
    id: "ev-south-vote",
    contestId: council,
    candidateId: "cand-south",
    issueId: "housing.zoning",
    kind: "action",
    sourceType: "official_action",
    date: "2025-11-03",
    excerpt: "Voted yes on a corner-lot amendment that allowed one additional home.",
    position: 0.2,
    withinAuthority: "direct",
  }),
  evidence({
    id: "ev-south-transit",
    contestId: council,
    candidateId: "cand-south",
    issueId: "mobility.transit",
    kind: "voice",
    sourceType: "questionnaire",
    date: "2026-08-02",
    excerpt: "Keep the current routes. Extra frequency can wait until ridership returns.",
    position: -0.3,
    withinAuthority: "influence",
  }),
  evidence({
    id: "ev-south-tax",
    contestId: council,
    candidateId: "cand-south",
    issueId: "fiscal.property_tax",
    kind: "voice",
    sourceType: "questionnaire",
    date: "2026-07-20",
    excerpt: "I will cap the county property-tax rate.",
    position: 1,
    withinAuthority: "none",
    claimType: "promise",
  }),
  evidence({
    id: "ev-south-hire",
    contestId: council,
    candidateId: "cand-south",
    issueId: "housing.zoning",
    kind: "voice",
    sourceType: "questionnaire",
    date: "2026-08-02",
    excerpt: "I will hire two more plan reviewers in the first budget.",
    position: 0.2,
    withinAuthority: "direct",
    claimType: "promise",
    proposesSpending: 0.95,
    fundingStated: 0.05,
  }),
];

const emptyLists = {
  saysVsDoes: [],
  promiseKept: [],
  truthfulness: { factChecks: [], recordVerified: [] },
  plans: [],
  evidence: [],
  stances: {},
  issueEvidenceState: {},
  platformHighlights: [] as CitedSentence[],
  specificity: { score: 0, tier: 0 },
  credibility: { score: 0, flags: [] },
};

const candidates: CandidateProfile[] = [
  {
    id: "cand-north",
    contestId: council,
    coverage: "full",
    incumbent: false,
    recordInOffice: "local",
    evidenceState: "thin",
    issueEvidenceState: { "housing.zoning": "sufficient", "mobility.transit": "thin" },
    stances: {
      "housing.zoning": {
        position: 0.85,
        evidenceStrength: 0.8,
        bySourceType: { official_action: 0.8, questionnaire: 0.9 },
      },
      "mobility.transit": {
        position: 0.6,
        evidenceStrength: 0.45,
        bySourceType: { questionnaire: 0.6 },
      },
    },
    evidence: northEvidence,
    platformHighlights: [
      cited("Wants more homes allowed on lots that now allow one.", "cit-north-vote"),
      cited("Wants more frequent buses on two corridors in the district.", "cit-north-transit"),
    ],
    plans: [
      {
        id: "plan-north-homes",
        issueId: "housing.zoning",
        goal: documented("Allow up to four homes on lots now limited to one.", "cit-north-vote"),
        mechanism: documented(
          "Change the residential zoning table by ordinance.",
          "cit-north-followup",
        ),
        cost: documented(
          "Extra permit review, kept inside the current department.",
          "cit-north-fund",
        ),
        funding: documented(
          "No new tax. Staff time stays in the existing planning budget.",
          "cit-north-fund",
        ),
        timeline: documented(
          "The follow-up ordinance is promised for the next council year.",
          "cit-north-followup",
        ),
        whoActs: documented(
          "City council would pass the ordinance. Staff would apply it.",
          "cit-north-vote",
        ),
        specificity: 1,
      },
    ],
    specificity: { score: 1, tier: 2 },
    credibility: {
      score: 0,
      flags: [{ type: "funded", issueId: "housing.zoning", evidenceIds: ["ev-north-followup"] }],
    },
    saysVsDoes: [],
    promiseKept: [],
    truthfulness: { factChecks: [], recordVerified: [] },
    funding: {
      period: { start: "2026-01-01", end: "2026-10-01" },
      direct: { min: 18400, max: 18400 },
      outside: { min: 0, max: 0 },
      ads: {
        fcc: { min: 0, max: 0 },
        meta: { min: 200, max: 299 },
        google: { min: 0, max: 0 },
      },
      traced: {
        receipts: {
          itemized: { min: 14000, max: 14000 },
          unitemizedSmall: { min: 4400, max: 4400 },
          pacPassThrough: { min: 0, max: 0 },
        },
        outside: {
          disclosed: { min: 0, max: 0 },
          dark: { min: 0, max: 0 },
          unresolved: { min: 0, max: 0 },
        },
      },
      topIndustries: [
        {
          industry: "Construction",
          amount: { min: 5000, max: 5000 },
          basis: "direct_receipts",
        },
      ],
    },
  },
  {
    id: "cand-south",
    contestId: council,
    coverage: "full",
    incumbent: false,
    recordInOffice: "none",
    evidenceState: "thin",
    issueEvidenceState: {
      "housing.zoning": "sufficient",
      "mobility.transit": "thin",
      "fiscal.property_tax": "thin",
    },
    stances: {
      "housing.zoning": {
        position: 0.05,
        evidenceStrength: 0.55,
        bySourceType: { questionnaire: -0.7, official_action: 0.2 },
      },
      "mobility.transit": {
        position: -0.3,
        evidenceStrength: 0.4,
        bySourceType: { questionnaire: -0.3 },
      },
    },
    evidence: southEvidence,
    platformHighlights: [
      cited("Says single-home zoning should stay unless neighbors agree.", "cit-south-zoning"),
      cited("Says extra bus frequency should wait.", "cit-south-transit"),
      cited("Says they will cap the county property-tax rate.", "cit-south-tax"),
    ],
    plans: [
      {
        id: "plan-south-review",
        issueId: "housing.zoning",
        goal: documented("Shorten the wait for a zoning exception.", "cit-south-hire"),
        mechanism: documented("Hire two more plan reviewers.", "cit-south-hire"),
        cost: notStated,
        funding: notStated,
        timeline: documented("During the first budget year.", "cit-south-hire"),
        whoActs: documented("City council would have to approve the hires.", "cit-south-hire"),
        specificity: 2 / 3,
      },
    ],
    specificity: { score: 2 / 3, tier: 1 },
    credibility: {
      score: 0,
      flags: [
        { type: "beyond_power", issueId: "fiscal.property_tax", evidenceIds: ["ev-south-tax"] },
        { type: "no_funding", issueId: "housing.zoning", evidenceIds: ["ev-south-hire"] },
      ],
    },
    saysVsDoes: [{ issueId: "housing.zoning", says: -0.7, does: 0.2, gap: 0.9 }],
    promiseKept: [],
    truthfulness: { factChecks: [], recordVerified: [] },
  },
  {
    ...emptyLists,
    id: "cand-bench-1",
    contestId: court,
    coverage: "objective_only",
    incumbent: false,
    recordInOffice: "none",
    evidenceState: "thin",
    platformHighlights: [cited("States fourteen years in law practice.", "cit-bench-1")],
    judicialProfile: { philosophy: {}, experienceYears: 14, boardCertified: true },
  },
  {
    ...emptyLists,
    id: "cand-bench-2",
    contestId: court,
    coverage: "objective_only",
    incumbent: false,
    recordInOffice: "none",
    evidenceState: "thin",
    platformHighlights: [cited("States six years in law practice.", "cit-bench-2")],
    judicialProfile: { philosophy: {}, experienceYears: 6, boardCertified: false },
  },
];

const contests: Contest[] = [
  {
    id: council,
    title: "City Council, Place 4",
    office: "city_council",
    officeKind: "legislative",
    districtType: "city_council",
    districtId: "place-4",
    partisan: false,
    candidateIds: ["cand-north", "cand-south"],
    officeDescription: [
      cited(
        "This office votes on city ordinances and the city budget. It does not set the county property-tax rate.",
        "cit-council-office",
      ),
    ],
    seats: 1,
    unopposed: false,
    context: {
      confirmed: [
        {
          sentences: [
            cited("Voters in this district elect one council member.", "cit-council-office"),
          ],
        },
      ],
      supporters: [
        {
          sentences: [
            cited(
              "Supporters say the district needs more homes near the bus lines.",
              "cit-council-support",
            ),
          ],
        },
      ],
      opponents: [
        {
          sentences: [
            cited(
              "Opponents say lot splits will crowd streets that already lack parking.",
              "cit-council-oppose",
            ),
          ],
        },
      ],
      disputed: [],
      notes: [],
    },
  },
  {
    id: court,
    title: "County Court at Law No. 2",
    office: "county_court_at_law",
    officeKind: "judicial",
    districtType: "county",
    districtId: "court-2",
    partisan: false,
    candidateIds: ["cand-bench-1", "cand-bench-2"],
    officeDescription: [
      cited(
        "This court hears civil and criminal cases assigned to it. The judge applies the law to those cases.",
        "cit-court-office",
      ),
    ],
    seats: 1,
    unopposed: false,
    context: {
      confirmed: [
        {
          sentences: [
            cited(
              "The seat is on a county court at law, not a policy-making board.",
              "cit-court-office",
            ),
          ],
        },
      ],
      supporters: [
        {
          sentences: [
            cited(
              "Some voters in the forum wanted a candidate who already knows this docket.",
              "cit-court-support",
            ),
          ],
        },
      ],
      opponents: [
        {
          sentences: [
            cited(
              "Others said years in practice are not a record on the bench.",
              "cit-court-oppose",
            ),
          ],
        },
      ],
      disputed: [],
      notes: [{ kind: "system", code: "data_unavailable" }],
    },
  },
  {
    id: prop,
    title: "Proposition B",
    office: "city_bond",
    officeKind: "measure",
    districtType: "city",
    districtId: "sample-city",
    partisan: false,
    candidateIds: [],
    officeDescription: [
      cited(
        "This measure asks whether the city may borrow for sidewalks. It does not choose a contractor.",
        "cit-prop-ballot",
      ),
    ],
    seats: 1,
    unopposed: false,
    measure: {
      ballotText: {
        text: "Shall the city issue $20 million in general obligation bonds for sidewalks, to be repaid from property taxes?",
        citation: { kind: "source", id: "cit-prop-ballot" },
      },
      yesMeans: documented(
        "A yes vote authorizes the city to issue up to $20 million in bonds for sidewalks.",
        "cit-prop-yes",
      ),
      noMeans: documented("A no vote means the city does not issue these bonds.", "cit-prop-no"),
      fiscal: {
        principal: 20_000_000,
        citations: [{ kind: "source", id: "cit-prop-yes" }],
      },
      issueVector: {},
    },
    context: {
      confirmed: [
        { sentences: [cited("The ballot language authorizes up to $20 million.", "cit-prop-yes")] },
      ],
      supporters: [
        {
          sentences: [
            cited("Supporters say missing sidewalks are the reason to borrow.", "cit-prop-support"),
          ],
        },
      ],
      opponents: [
        {
          sentences: [
            cited(
              "Opponents say the city should repair sidewalks from the existing budget.",
              "cit-prop-oppose",
            ),
          ],
        },
      ],
      disputed: [],
      notes: [{ kind: "system", code: "data_unavailable" }],
    },
  },
];

const cards: PolicyCard[] = [
  {
    id: "card-housing",
    anchor: true,
    deck: "policy",
    kind: "pole",
    issueId: "housing.zoning",
    poleA: "Allow more homes by right on residential lots.",
    poleB: "Keep today's lot limits, and review changes one by one.",
    vector: { "housing.zoning": { a: 1, b: -1, weight: 1 } },
  },
  {
    id: "card-transit",
    anchor: false,
    deck: "policy",
    kind: "pole",
    issueId: "mobility.transit",
    poleA: "Run buses often, all day, on the main corridors.",
    poleB: "Keep the routes and frequency the city runs now.",
    vector: { "mobility.transit": { a: 1, b: -1, weight: 1 } },
  },
  {
    id: "card-tradeoff",
    anchor: false,
    deck: "policy",
    kind: "tradeoff",
    policy: "Allowing more homes on each residential lot",
    cost: "removing minimum parking requirements near frequent transit",
    policyIssues: ["housing.zoning"],
    costIssues: ["mobility.transit"],
  },
  {
    id: "card-judicial-text",
    anchor: true,
    deck: "judicial",
    kind: "judicial_pole",
    dimension: "text_vs_purpose",
    poleA: "Read the law's exact words, even when the outcome feels narrow.",
    poleB: "Read the law for the purpose behind it, even when the words are tight.",
    coordinates: { a: -1, b: 1 },
  },
  {
    id: "card-judicial-precedent",
    anchor: false,
    deck: "judicial",
    kind: "judicial_pole",
    dimension: "precedent",
    poleA: "Stick with past rulings unless there is a very strong reason to leave them.",
    poleB: "Be willing to overturn a past ruling when today's reading of the law differs.",
    coordinates: { a: -1, b: 1 },
  },
];

export const demoBallot = {
  release: {
    id: "data-demo-1",
    asOfDate: "2026-10-24",
    campaignWindow: { since: "2025-11-04", until: "2026-11-03" },
    manifestHash: "demo-manifest-not-published",
    configVersions: {
      issues: "demo",
      rubrics: "demo",
      thresholds: "demo",
      authority: "demo",
      sources: "demo",
    },
    modelVersions: { fixture: "hand-authored-sample" },
  },
  ballot: {
    id: "ballot-demo",
    releaseId: "data-demo-1",
    ballotStyleId: "travis-demo-a",
    precinctId: "sample-precinct",
    contestIds: [council, court, prop],
    requiresJudicialDeck: true,
  },
  contests,
  candidates,
  cards,
  citations,
} satisfies Api["GET /ballot"]["res"];

export function issueById(id: string): Issue | undefined {
  return demoIssues.find((issue) => issue.id === id);
}

export function contestById(id: string): Contest | undefined {
  return demoBallot.contests.find((contest) => contest.id === id);
}

export function identityFor(id: string): CandidateIdentity | undefined {
  return demoIdentities.find((identity) => identity.id === id);
}

export function orderedProfiles(
  contest: Contest,
  order: readonly string[] | undefined,
): CandidateProfile[] {
  const ids = order && order.length > 0 ? order : contest.candidateIds;
  return ids.flatMap((id) => {
    const profile = demoBallot.candidates.find((candidate) => candidate.id === id);
    return profile ? [profile] : [];
  });
}
