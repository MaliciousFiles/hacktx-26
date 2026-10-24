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
export function computeUserVector(
  swipes: Swipe[],
  cards: PolicyCard[],
  salience: Record<IssueId, number>,
): UserVector {
  const cardMap = new Map<string, PolicyCard>(cards.map((c) => [c.id, c]));

  // accumulate weighted sums per issue
  const sums: Record<IssueId, { weightedPos: number; totalWeight: number; count: number }> = {};

  for (const swipe of swipes) {
    if (swipe.kind === "tradeoff") continue; // no signed vector
    if (swipe.chosen === "skip") continue;

    const card = cardMap.get(swipe.cardId);
    if (!card) continue;

    if (swipe.kind === "pole" && card.kind === "pole") {
      const poleCard = card as PoleCard;
      for (const [issueId, mapping] of Object.entries(poleCard.vector)) {
        const pos: Position = swipe.chosen === "a" ? mapping.a : mapping.b;
        const w = mapping.weight;
        if (!sums[issueId]) sums[issueId] = { weightedPos: 0, totalWeight: 0, count: 0 };
        sums[issueId].weightedPos += pos * w;
        sums[issueId].totalWeight += w;
        sums[issueId].count += 1;
      }
    }

    if (swipe.kind === "judicial_pole" && card.kind === "judicial_pole") {
      const issueId: IssueId = `judicial.${card.dimension}`;
      const pos: Position = swipe.chosen === "a" ? card.coordinates.a : card.coordinates.b;
      if (!sums[issueId]) sums[issueId] = { weightedPos: 0, totalWeight: 0, count: 0 };
      sums[issueId].weightedPos += pos;
      sums[issueId].totalWeight += 1;
      sums[issueId].count += 1;
    }
  }

  const vector: UserVector = {};
  for (const [issueId, { weightedPos, totalWeight, count }] of Object.entries(sums)) {
    const position: Position = totalWeight > 0 ? weightedPos / totalWeight : 0;
    // userCertainty: scales with number of independent cards (low at 1, higher with more)
    const userCertainty: Prob = Math.min(1, count / 3);
    const sal = salience[issueId] ?? 1;
    vector[issueId] = { position, userCertainty, salience: sal };
  }

  // Issues with no swipes remain absent (not null) — null means explicitly skipped
  return vector;
}

// ── §6.5 Matching ─────────────────────────────────────────────────────────────

/**
 * Per-issue proximity averaged, weighted by salience × candidate evidenceStrength.
 * Missing issues must NOT improve alignment.
 * Only issues where BOTH user and candidate have evidence are compared.
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
  let issuesCompared = 0;

  for (const [issueId, userStance] of Object.entries(userVector)) {
    if (!userStance) continue; // skip — not neutral
    const candidateStance = stances[issueId];
    if (!candidateStance) continue; // missing → does not improve score
    const evState = issueEvidenceState[issueId];
    if (evState === "none") continue; // no defensible comparison

    const proximity = issueAlignment(userStance.position, candidateStance.position);
    const weight = userStance.salience * candidateStance.evidenceStrength;
    weightedSum += proximity * weight;
    totalWeight += weight;
    issuesCompared += 1;
  }

  const avgProximity: Prob = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const bucket = proximityToBucket(avgProximity);

  // matchClarity = coverage × average evidenceStrength
  const matchClarity: Prob = issuesCompared >= 3 ? Math.min(1, totalWeight / issuesCompared) : 0;

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

  const noStrongMatch =
    results.length > 0 &&
    results.every((r) => r.bucket !== "happily_ever_after" || r.matchClarity === 0);

  return { contestId: contest.id, results, noStrongMatch };
}

function proximityToBucket(avg: Prob): Bucket {
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
