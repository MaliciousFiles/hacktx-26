import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { assertGroundedSpan } from "./spans";
import type { ExtractRequest, ExtractionBatch, SemanticExtractor } from "./types";
import { extractionBatchSchema } from "./types";

export interface LlmExtractorOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  cacheDirectory?: string;
  fetch?: typeof fetch;
  temperature?: number;
}

const chatResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string() }),
  })).min(1),
}).passthrough();

function validateBatch(text: string, batch: ExtractionBatch): ExtractionBatch {
  const votes = batch.votes.map((vote, index) => {
    const label = `votes[${index}]`;
    return {
      member: assertGroundedSpan(text, vote.member, `${label}.member`),
      vote: assertGroundedSpan(text, vote.vote, `${label}.vote`),
      motion: assertGroundedSpan(text, vote.motion, `${label}.motion`),
      date: vote.date ? assertGroundedSpan(text, vote.date, `${label}.date`) : undefined,
      consent: vote.consent,
    };
  });
  return { votes };
}

/**
 * Cheap OpenAI-compatible chat completions client (Ollama / Gemini OpenAI mode /
 * etc.). Temperature defaults to 0. Every returned span is checked for exact
 * equality against the source — invented offsets are rejected.
 */
export class LlmSpanExtractor implements SemanticExtractor {
  readonly id: string;
  private readonly options: Required<Pick<LlmExtractorOptions, "baseUrl" | "model" | "temperature">> &
    Pick<LlmExtractorOptions, "apiKey" | "cacheDirectory"> & { fetch: typeof fetch };

  constructor(options: LlmExtractorOptions) {
    this.options = {
      temperature: 0,
      fetch: options.fetch ?? fetch,
      ...options,
    };
    this.id = `llm:${options.model}`;
  }

  async extract(request: ExtractRequest): Promise<ExtractionBatch> {
    const cacheKey = createHash("sha256").update(JSON.stringify({
      schemaId: request.schemaId,
      model: this.options.model,
      temperature: this.options.temperature,
      textHash: createHash("sha256").update(request.sourceText).digest("hex"),
      instruction: request.instruction,
      memberLabels: request.memberLabels ?? [],
    })).digest("hex");

    if (this.options.cacheDirectory) {
      try {
        const raw = await readFile(join(this.options.cacheDirectory, "llm", `${cacheKey}.json`), "utf8");
        return validateBatch(request.sourceText, extractionBatchSchema.parse(JSON.parse(raw)));
      } catch (error) {
        // Missing cache is fine; corrupt/ungrounded cache must not publish.
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          // fall through to a fresh model call after rejecting bad cache
        }
      }
    }

    const body = {
      model: this.options.model,
      temperature: this.options.temperature,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You extract roll-call votes from official meeting minutes.",
            "Return JSON {\"votes\":[{\"member\":{\"value\",\"start\",\"end\"},\"vote\":{\"value\",\"start\",\"end\"},\"motion\":{\"value\",\"start\",\"end\"},\"date\":{\"value\",\"start\",\"end\"}? ,\"consent\":boolean?}]}",
            "start/end are UTF-16 code unit offsets into the SOURCE text.",
            "value MUST be an exact substring copy of SOURCE[start:end].",
            "Do not invent members, votes, motions, or dates. Omit uncertain rows.",
            "Only include the requested member labels when provided.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            memberLabels: request.memberLabels ?? [],
            instruction: request.instruction,
            SOURCE: request.sourceText,
          }),
        },
      ],
    };

    const url = new URL("/v1/chat/completions", this.options.baseUrl);
    const response = await this.options.fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`LLM extractor HTTP ${response.status}`);
    }
    const payload = chatResponseSchema.parse(await response.json());
    const content = payload.choices[0].message.content;
    const parsed = extractionBatchSchema.parse(JSON.parse(content));
    const validated = validateBatch(request.sourceText, parsed);

    if (this.options.cacheDirectory) {
      const dir = join(this.options.cacheDirectory, "llm");
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${cacheKey}.json`), JSON.stringify(validated, null, 2));
    }
    return validated;
  }
}

export function createLlmExtractorFromEnv(env: NodeJS.ProcessEnv = process.env): LlmSpanExtractor | undefined {
  const baseUrl = env.EXTRACT_LLM_BASE_URL?.trim();
  if (!baseUrl) return undefined;
  return new LlmSpanExtractor({
    baseUrl,
    apiKey: env.EXTRACT_LLM_API_KEY,
    model: env.EXTRACT_LLM_MODEL?.trim() || "extraction",
    cacheDirectory: env.EXTRACT_LLM_CACHE_DIR,
  });
}
