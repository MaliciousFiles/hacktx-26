import { z } from "zod";

/** One grounded field: value must equal source.slice(start, end) exactly after UTF-16 indexing. */
export const groundedSpanSchema = z.object({
  value: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
}).strict().superRefine((span, ctx) => {
  if (span.end < span.start) ctx.addIssue({ code: "custom", message: "end precedes start" });
});

export type GroundedSpan = z.infer<typeof groundedSpanSchema>;

export const extractedVoteSchema = z.object({
  member: groundedSpanSchema,
  vote: groundedSpanSchema,
  motion: groundedSpanSchema,
  date: groundedSpanSchema.optional(),
  consent: z.boolean().optional(),
}).strict();

export type ExtractedVote = z.infer<typeof extractedVoteSchema>;

export const extractionBatchSchema = z.object({
  votes: z.array(extractedVoteSchema),
}).strict();

export type ExtractionBatch = z.infer<typeof extractionBatchSchema>;

export interface ExtractRequest {
  schemaId: string;
  sourceText: string;
  instruction: string;
  /** Optional name hints — never sufficient alone for attribution. */
  memberLabels?: string[];
}

export interface ExtractResult {
  method: "rules" | "llm";
  modelId?: string;
  batch: ExtractionBatch;
}

export interface SemanticExtractor {
  readonly id: string;
  extract(request: ExtractRequest): Promise<ExtractionBatch>;
}
