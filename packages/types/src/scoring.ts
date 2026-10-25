// Pure T1 scoring shared by the mobile app (on-device matching) and the pipeline.
// No I/O, no randomness, no model calls (PLAN.md §6, §7).
import type {
  UserVector,
  IssueId,
  Swipe,
  PolicyCard,
  PoleCard,
  CandidateProfile,
  StanceAgg,
  EvidenceState,
  Contest,
  MatchResult,
  ContestMatch,
  Bucket,
  Prob,
  JudicialComparison,
  JudicialDim,
  MeasureConnection,
  EvidenceRef,
  FundingMap,
  MoneyRange,
  Position,
  UserIssueStance,
} from "./index";

/** Per-issue proximity: 1 when identical, 0 at opposite poles (PLAN.md §6.5). */
export function issueAlignment(user: Position, candidate: Position): Prob {
  return 1 - Math.abs(user - candidate) / 2;
}

// ── §6.3 User vector ──────────────────────────────────────────────────────────

/**
 * Compute the user's stance vector from pole-card swipes only.
 * TradeoffCard has no signed stance vector by contract — those swipes are ignored here.
 * JudicialCard swipes are included but only update the judicial-dimension keys (IssueId prefixed
 * with the dimension string), keeping them separate from policy vectors.
 * skip → null (missing, not neutral).
 */
/** Draft constants; freeze in prereg.yaml (PLAN.md §6). */
export const SCORING_DRAFT = {
  /** ⭐ multiplies an issue's salience. It never changes direction. */
  starMultiplier: 2,
  /** Cards needed for full count-based certainty. */
  cardsForFullCertainty: 3,
  /** User certainty required for an issue to enter the alignment score. */
  minUserCertainty: 0.3,
  /** Comparable sufficient issues required for a bucket (§6.6). */
  minIssues: 3,
  /** Distance to a bucket cutoff treated as near-threshold uncertainty. */
  cloudedMargin: 0.03,
  /** Below this clarity, a near-threshold score is Clouded rather than a bucket. */
  cloudedClarity: 0.7,
} as const;

function cardIssues(card: PolicyCard): IssueId[] {
  if (card.kind === "pole") return Object.keys(card.vector);
  if (card.kind === "tradeoff") return [...card.policyIssues, ...card.costIssues];
  return [`judicial.${card.dimension}`];
}

export function computeUserVector(
  swipes: Swipe[],
  cards: PolicyCard[],
  salience: Record<IssueId, number>,
): UserVector {
  const cardMap = new Map<string, PolicyCard>(cards.map((c) => [c.id, c]));

  // Pole/judicial choices per issue: [position, weight]
  const picks: Record<IssueId, [Position, number][]> = {};
  // ⭐ on any card kind (including a tradeoff or a skip) marks its issues as important.
  const starred = new Set<IssueId>();

  for (const swipe of swipes) {
    const card = cardMap.get(swipe.cardId);
    if (!card) continue;
    if (swipe.starred) for (const issueId of cardIssues(card)) starred.add(issueId);

    if (swipe.kind === "tradeoff") continue; // no signed vector, by contract
    if (swipe.chosen === "skip") continue; // missing, not neutral

    if (swipe.kind === "pole" && card.kind === "pole") {
      for (const [issueId, mapping] of Object.entries((card as PoleCard).vector)) {
        if (!(mapping.weight > 0)) continue; // a zero-weight mapping is not a stance
        (picks[issueId] ??= []).push([
          swipe.chosen === "a" ? mapping.a : mapping.b,
          mapping.weight,
        ]);
      }
    }

    if (swipe.kind === "judicial_pole" && card.kind === "judicial_pole") {
      const issueId: IssueId = `judicial.${card.dimension}`;
      (picks[issueId] ??= []).push([
        swipe.chosen === "a" ? card.coordinates.a : card.coordinates.b,
        1,
      ]);
    }
  }

  const vector: UserVector = {};
  for (const [issueId, list] of Object.entries(picks)) {
    const totalWeight = list.reduce((sum, [, w]) => sum + w, 0);
    if (!(totalWeight > 0)) continue;
    const position: Position = list.reduce((sum, [p, w]) => sum + p * w, 0) / totalWeight;
    // Certainty needs both several independent cards AND consistent answers:
    // contradictory picks (+1, −1, +1) must not look certain.
    const variance = list.reduce((sum, [p, w]) => sum + w * (p - position) ** 2, 0) / totalWeight;
    const consistency = 1 - Math.min(1, Math.sqrt(variance));
    const userCertainty: Prob =
      Math.min(1, list.length / SCORING_DRAFT.cardsForFullCertainty) * consistency;
    const sal =
      Math.max(0, salience[issueId] ?? 1) *
      (starred.has(issueId) ? SCORING_DRAFT.starMultiplier : 1);
    vector[issueId] = { position, userCertainty, salience: sal };
  }

  // Issues with no swipes remain absent (not null) — null means explicitly skipped
  return vector;
}

// ── §6.5 Matching ─────────────────────────────────────────────────────────────

/**
 * Per-issue proximity averaged, weighted by salience × user certainty × candidate
 * evidenceStrength (§6.5). Missing issues must NOT improve alignment.
 * Only issues where the candidate's stance is `sufficient` and the user's
 * certainty clears the threshold are compared. Without enough comparable issues,
 * the result is Clouded: no comparison, never a negative verdict.
 */
export function computeMatchResult(
  userVector: UserVector,
  candidateId: string,
  contestId: string,
  stances: Record<IssueId, StanceAgg>,
  issueEvidenceState: Record<IssueId, EvidenceState>,
  evidenceIds: { agreements: string[]; disagreements: string[] },
): MatchResult {
  let weightedSum = 0;
  let totalWeight = 0;
  let qualitySum = 0;
  let issuesCompared = 0;

  for (const [issueId, userStance] of Object.entries(userVector)) {
    if (!userStance) continue; // skip — not neutral
    const candidateStance = stances[issueId];
    if (!candidateStance) continue; // missing → does not improve score
    if (issueEvidenceState[issueId] !== "sufficient") continue; // thin/none: no defensible comparison
    if (userStance.userCertainty < SCORING_DRAFT.minUserCertainty) continue;

    const quality = userStance.userCertainty * candidateStance.evidenceStrength;
    const weight = userStance.salience * quality;
    if (!(weight > 0)) continue;
    const proximity = issueAlignment(userStance.position, candidateStance.position);
    weightedSum += proximity * weight;
    totalWeight += weight;
    qualitySum += quality;
    issuesCompared += 1;
  }

  const sufficient = issuesCompared >= SCORING_DRAFT.minIssues;
  // matchClarity reflects coverage and evidence quality, not model confidence.
  const matchClarity: Prob = sufficient ? clampProb(qualitySum / issuesCompared) : 0;
  const avgProximity: Prob = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const bucket: Bucket = sufficient ? proximityToBucket(avgProximity, matchClarity) : "clouded";

  return {
    candidateId,
    bucket,
    matchClarity,
    issuesCompared,
    agreements: evidenceIds.agreements,
    disagreements: evidenceIds.disagreements,
  };
}

/**
 * §6.5 absolute bucket thresholds (not curved per race).
 * noStrongMatch only when none reaches ≥0.80 WITH sufficient coverage (matchClarity > 0).
 */
export function computeContestMatch(
  userVector: UserVector,
  contest: Pick<Contest, "id" | "candidateIds" | "officeKind">,
  profiles: CandidateProfile[],
): ContestMatch {
  // Judges go through computeJudicialComparison, not here.
  if (contest.officeKind === "judicial") {
    return {
      contestId: contest.id,
      results: [],
      noStrongMatch: false,
    };
  }

  const results: MatchResult[] = [];

  for (const profile of profiles) {
    if (!contest.candidateIds.includes(profile.id)) continue;

    // Build evidenceIds from profile.evidence
    const agreements: string[] = [];
    const disagreements: string[] = [];
    for (const ev of profile.evidence) {
      const userStance = userVector[ev.issueId];
      if (!userStance) continue;
      const proximity = issueAlignment(userStance.position, ev.position);
      if (proximity >= 0.6) agreements.push(ev.id);
      else if (proximity < 0.4) disagreements.push(ev.id);
    }

    const result = computeMatchResult(
      userVector,
      profile.id,
      contest.id,
      profile.stances,
      profile.issueEvidenceState,
      { agreements, disagreements },
    );
    results.push(result);
  }

  // Only claim "no strong match" when every candidate was actually compared with
  // sufficient coverage and none is (or might be, near a threshold) ≥ 0.80.
  const noStrongMatch =
    results.length > 0 &&
    results.every(
      (r) => r.matchClarity > 0 && r.bucket !== "happily_ever_after" && r.bucket !== "clouded",
    );

  return { contestId: contest.id, results, noStrongMatch };
}

const CUTOFFS = [0.8, 0.6, 0.4] as const;

function proximityToBucket(avg: Prob, clarity: Prob): Bucket {
  // Near-threshold with modest clarity: don't pretend to know which side it falls on.
  if (
    clarity < SCORING_DRAFT.cloudedClarity &&
    CUTOFFS.some((cutoff) => Math.abs(avg - cutoff) < SCORING_DRAFT.cloudedMargin)
  )
    return "clouded";
  if (avg >= 0.8) return "happily_ever_after";
  if (avg >= 0.6) return "good_company";
  if (avg >= 0.4) return "different_paths";
  return "worlds_apart";
}

// ── Judicial comparison ───────────────────────────────────────────────────────

/**
 * Judges only — produces JudicialComparison per dimension.
 * NEVER produces a ContestMatch / MatchResult.
 * Policy stances must be empty for judges (Invariant 13).
 */
export function computeJudicialComparison(
  userVector: UserVector,
  contestId: string,
  profiles: CandidateProfile[],
): JudicialComparison {
  const DIMENSIONS: JudicialDim[] = [
    "text_vs_purpose",
    "restraint_vs_review",
    "precedent",
    "procedural_strictness",
  ];

  const results = profiles.map((profile) => {
    const philosophy = profile.judicialProfile?.philosophy ?? {};
    const dimensions: Partial<Record<JudicialDim, { proximity: Prob; evidenceStrength: Prob }>> =
      {};

    for (const dim of DIMENSIONS) {
      const issueId: IssueId = `judicial.${dim}`;
      const userStance = userVector[issueId];
      const candidateStance = philosophy[dim];
      if (!userStance || !candidateStance) continue;

      dimensions[dim] = {
        proximity: issueAlignment(userStance.position, candidateStance.position),
        evidenceStrength: candidateStance.evidenceStrength,
      };
    }

    return {
      candidateId: profile.id,
      evidenceState: profile.evidenceState,
      dimensions,
    };
  });

  return { contestId, results };
}

// ── Measure connections ───────────────────────────────────────────────────────

/**
 * Max 2 per measure; only called when all gates pass. Never a recommendation.
 * MeasureConnection.citations must resolve within the same release.
 */
export function computeMeasureConnections(
  userVector: UserVector,
  measureId: string,
  issueVector: Record<IssueId, StanceAgg>,
  cards: PolicyCard[],
  citations: EvidenceRef[],
): MeasureConnection[] {
  const connections: MeasureConnection[] = [];

  for (const card of cards) {
    if (card.kind !== "pole") continue;
    if (connections.length >= 2) break;

    const issueId = (card as PoleCard).issueId;
    const userStance = userVector[issueId];
    const measureStance = issueVector[issueId];
    if (!userStance || !measureStance) continue;

    connections.push({
      measureId,
      issueId,
      cardId: card.id,
      userPosition: userStance.position,
      measureEffect: measureStance.position,
      citations,
    });
  }

  return connections;
}

// ── Money ─────────────────────────────────────────────────────────────────────

/**
 * §6 dark-share interval.
 * numerator = traced.outside.dark; denominator = outside spending.
 * If outside.min === 0, max is omitted per §6 rule.
 * Returns undefined if outside spending denominator is not meaningful.
 */
export function computeDarkShareInterval(
  funding: FundingMap,
): { min: Prob; max?: Prob; denominator: MoneyRange; basis: "outside_spending" } | undefined {
  const dark = funding.traced.outside.dark;
  const outside = funding.outside;

  if (outside.max === 0) return undefined;

  const min: Prob = clampProb(dark.min / outside.max);
  const maxVal: Prob | undefined =
    outside.min === 0 ? undefined : clampProb(dark.max / outside.min);

  return {
    min,
    ...(maxVal !== undefined ? { max: Math.min(1, maxVal) } : {}),
    denominator: outside,
    basis: "outside_spending",
  };
}

// ── Specificity tier ──────────────────────────────────────────────────────────

/**
 * §6.8 tier cutoffs: ≥2/3 → tier 2 (detailed); ≥1/3 → tier 1 (some detail); else tier 0.
 */
export function computeSpecificityTier(score: number): 0 | 1 | 2 {
  if (score >= 2 / 3) return 2;
  if (score >= 1 / 3) return 1;
  return 0;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampProb(n: number): Prob {
  return Math.max(0, Math.min(1, n));
}

export interface WeightedPoleChoice {
  position: Position;
  /** Nonnegative card weight. Zero-weight choices do not move the mean. */
  weight: number;
}

/**
 * Weighted mean of pole choices on one issue (PLAN.md §6.3).
 * An empty list is "skipped", which is missing — not a neutral zero.
 * Negative weights are ignored so a bad card cannot flip the sign.
 */
export function userIssuePosition(choices: readonly WeightedPoleChoice[]): Position | null {
  let weighted = 0;
  let weightSum = 0;
  for (const choice of choices) {
    if (!(choice.weight > 0)) continue;
    weighted += choice.position * choice.weight;
    weightSum += choice.weight;
  }
  if (weightSum === 0) return null;
  return weighted / weightSum;
}
