// validate.ts — Stage 6: Deterministic validators (PLAN.md §7 "Validators for generated text").
// Invariants 2 (every sentence cites evidence), 3 (quotes are exact), 7 (identity leak gate).
// Pure code — no model calls, no fuzzy matching.
import type {
  Evidence,
  Source,
  Release,
  CandidateProfile,
  Contest,
  SourceCitation,
  CitedSentence,
  EvidenceRef,
} from "@ftb/types";

export interface QuoteValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Pure quote checker: verifies immutable Source.originalText with exact UTF-16 spans.
 * Exact string equality — NO whitespace, unicode, or case normalization (PLAN.md §7).
 */
export function validateQuote(evidence: Evidence, sources: Source[]): QuoteValidationResult {
  const source = sources.find((s) => s.id === evidence.sourceId);
  if (!source) {
    return { valid: false, error: `Source not found: ${evidence.sourceId}` };
  }

  // Check contest ownership
  if (source.contestId !== evidence.contestId) {
    return {
      valid: false,
      error: `Contest ID mismatch: evidence contest ${evidence.contestId} != source contest ${source.contestId}`,
    };
  }

  // Check candidate attribution if source specifies candidateId
  if (source.candidateId && source.candidateId !== evidence.candidateId) {
    return {
      valid: false,
      error: `Candidate ID mismatch: evidence candidate ${evidence.candidateId} != source candidate ${source.candidateId}`,
    };
  }

  // Span bounds check
  const { start, end } = evidence.quoteSpan;
  if (start < 0 || end > source.originalText.length || start > end) {
    return {
      valid: false,
      error: `Invalid span [${start}, ${end}] for text length ${source.originalText.length}`,
    };
  }

  // Exact substring slice check (UTF-16 code units)
  const slice = source.originalText.slice(start, end);
  if (slice !== evidence.quote) {
    return {
      valid: false,
      error: `Quote does not match originalText slice exactly. Expected "${slice.slice(0, 50)}...", got "${evidence.quote.slice(0, 50)}..."`,
    };
  }

  // Multi-speaker check: if source has attributions, verify span falls inside candidate's attribution
  if (source.attributions && source.attributions.length > 0) {
    const candidateSpans = source.attributions.filter(
      (a) => a.candidateId === evidence.candidateId,
    );
    const inSpan = candidateSpans.some((a) => start >= a.start && end <= a.end);
    if (!inSpan) {
      return {
        valid: false,
        error: `Span [${start}, ${end}] does not fall within candidate attribution span for ${evidence.candidateId}`,
      };
    }
  }

  return { valid: true };
}

export interface PublicationValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates that all CitedSentence entries have citations, and every EvidenceRef resolves
 * within the same candidate and contest (or to a valid SourceCitation).
 */
export function validatePublication(
  release: Release,
  candidates: CandidateProfile[],
  contests: Contest[],
  citations: SourceCitation[],
): PublicationValidationResult {
  const errors: string[] = [];

  const citationMap = new Map<string, SourceCitation>(citations.map((c) => [c.id, c]));
  const contestMap = new Map<string, Contest>(contests.map((c) => [c.id, c]));

  // Check each contest
  for (const contest of contests) {
    for (const sentence of contest.officeDescription) {
      checkCitedSentence(
        sentence,
        `contest ${contest.id} officeDescription`,
        citationMap,
        undefined,
        errors,
      );
    }
    for (const claim of contest.context.confirmed) {
      for (const sentence of claim.sentences) {
        checkCitedSentence(
          sentence,
          `contest ${contest.id} context.confirmed`,
          citationMap,
          undefined,
          errors,
        );
      }
    }
    for (const claim of contest.context.supporters) {
      for (const sentence of claim.sentences) {
        checkCitedSentence(
          sentence,
          `contest ${contest.id} context.supporters`,
          citationMap,
          undefined,
          errors,
        );
      }
    }
    for (const claim of contest.context.opponents) {
      for (const sentence of claim.sentences) {
        checkCitedSentence(
          sentence,
          `contest ${contest.id} context.opponents`,
          citationMap,
          undefined,
          errors,
        );
      }
    }
    for (const claim of contest.context.disputed) {
      for (const sentence of claim.sentences) {
        checkCitedSentence(
          sentence,
          `contest ${contest.id} context.disputed`,
          citationMap,
          undefined,
          errors,
        );
      }
    }

    if (contest.measure) {
      if (contest.measure.yesMeans.state === "documented") {
        for (const s of contest.measure.yesMeans.sentences) {
          checkCitedSentence(s, `measure ${contest.id} yesMeans`, citationMap, undefined, errors);
        }
      }
      if (contest.measure.noMeans.state === "documented") {
        for (const s of contest.measure.noMeans.sentences) {
          checkCitedSentence(s, `measure ${contest.id} noMeans`, citationMap, undefined, errors);
        }
      }
    }
  }

  // Check each candidate
  for (const cand of candidates) {
    const evidenceMap = new Map<string, EvidenceRef>(
      cand.evidence.map((e) => [e.id, { kind: "candidate", id: e.id }]),
    );

    // Platform highlights
    for (const sentence of cand.platformHighlights) {
      checkCitedSentence(
        sentence,
        `candidate ${cand.id} highlight`,
        citationMap,
        evidenceMap,
        errors,
      );
    }

    // Plans
    for (const plan of cand.plans) {
      const slots = [
        plan.goal,
        plan.mechanism,
        plan.cost,
        plan.funding,
        plan.timeline,
        plan.whoActs,
      ];
      for (const slot of slots) {
        if (slot.state === "documented") {
          for (const s of slot.sentences) {
            checkCitedSentence(
              s,
              `candidate ${cand.id} plan ${plan.id}`,
              citationMap,
              evidenceMap,
              errors,
            );
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function checkCitedSentence(
  sentence: CitedSentence,
  context: string,
  citations: Map<string, SourceCitation>,
  candidateEvidence: Map<string, EvidenceRef> | undefined,
  errors: string[],
): void {
  if (!sentence.citations || sentence.citations.length === 0) {
    errors.push(`Missing citation in ${context}: "${sentence.text.slice(0, 40)}..."`);
    return;
  }

  for (const ref of sentence.citations) {
    if (ref.kind === "source") {
      if (!citations.has(ref.id)) {
        errors.push(`Unresolved source citation "${ref.id}" in ${context}`);
      }
    } else if (ref.kind === "candidate") {
      if (!candidateEvidence || !candidateEvidence.has(ref.id)) {
        errors.push(`Unresolved candidate evidence "${ref.id}" in ${context}`);
      }
    }
  }
}

export interface LeakGateBlocklist {
  candidateNames: string[];
  aliases?: string[];
  partyLabels: string[];
  donorNames?: string[];
  photoUrls?: string[];
  sourceUrls?: string[];
}

export interface LeakGateResult {
  clean: boolean;
  leaks: string[];
}

/**
 * Deterministic identity-leak gate over the entire serialized /ballot response payload.
 * Rejects or flags candidate names, aliases, party labels, donor names, direct source URLs.
 * Office and district labels essential for knowing the real contest remain visible.
 */
export function identityLeakGate(
  serializedBallotResponse: string,
  blocklist: LeakGateBlocklist,
): LeakGateResult {
  const leaks: string[] = [];

  const targets: { category: string; value: string }[] = [];

  for (const name of blocklist.candidateNames) {
    if (name.trim().length >= 3) targets.push({ category: "candidate_name", value: name });
  }
  if (blocklist.aliases) {
    for (const alias of blocklist.aliases) {
      if (alias.trim().length >= 3) targets.push({ category: "candidate_alias", value: alias });
    }
  }
  for (const party of blocklist.partyLabels) {
    if (party.trim().length >= 3) targets.push({ category: "party_label", value: party });
  }
  if (blocklist.donorNames) {
    for (const donor of blocklist.donorNames) {
      if (donor.trim().length >= 3) targets.push({ category: "donor_name", value: donor });
    }
  }
  if (blocklist.photoUrls) {
    for (const url of blocklist.photoUrls) {
      if (url.trim().length >= 5) targets.push({ category: "photo_url", value: url });
    }
  }
  if (blocklist.sourceUrls) {
    for (const url of blocklist.sourceUrls) {
      if (url.trim().length >= 10) targets.push({ category: "source_url", value: url });
    }
  }

  // Case-insensitive; names/labels match whole words (any whitespace between
  // parts) so "Ana" doesn't flag "banana". URLs match as plain substrings.
  const lowerPayload = serializedBallotResponse.toLowerCase();

  for (const target of targets) {
    const val = target.value.toLowerCase();
    const isUrl = target.category === "source_url" || target.category === "photo_url";
    const found = isUrl
      ? lowerPayload.includes(val) || lowerPayload.includes(JSON.stringify(val).slice(1, -1))
      : new RegExp(
          `(?<![\\p{L}\\p{N}])${val
            .trim()
            .split(/\s+/)
            .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join("\\s+")}(?![\\p{L}\\p{N}])`,
          "iu",
        ).test(serializedBallotResponse);
    if (found) {
      leaks.push(`Found leaked ${target.category}: "${target.value}"`);
    }
  }

  return {
    clean: leaks.length === 0,
    leaks,
  };
}
