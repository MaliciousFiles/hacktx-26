import { rulesExtractVotes } from "./rules";
import { assertGroundedSpan } from "./spans";
import type { ExtractRequest, ExtractResult, ExtractionBatch, SemanticExtractor } from "./types";

function validate(text: string, batch: ExtractionBatch): ExtractionBatch {
  return {
    votes: batch.votes.map((vote, index) => ({
      member: assertGroundedSpan(text, vote.member, `votes[${index}].member`),
      vote: assertGroundedSpan(text, vote.vote, `votes[${index}].vote`),
      motion: assertGroundedSpan(text, vote.motion, `votes[${index}].motion`),
      date: vote.date ? assertGroundedSpan(text, vote.date, `votes[${index}].date`) : undefined,
      consent: vote.consent,
    })),
  };
}

/**
 * Rules first. LLM only when rules return no votes for the requested labels
 * (or no votes at all if no labels) and a SemanticExtractor is configured.
 */
export async function extractVotes(
  request: ExtractRequest,
  llm?: SemanticExtractor,
): Promise<ExtractResult> {
  const rules = validate(request.sourceText, rulesExtractVotes(request));
  if (rules.votes.length > 0 || !llm) {
    return { method: "rules", batch: rules };
  }
  const batch = validate(request.sourceText, await llm.extract(request));
  return { method: "llm", modelId: llm.id, batch };
}
