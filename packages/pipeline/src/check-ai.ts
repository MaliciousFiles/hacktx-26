// Explicit paid/network smoke test, never imported by the serving apps or CI.
import { parseArgs } from "node:util";
import { join } from "node:path";
import { hash } from "@ftb/scraping";
import { cachedCall, withModelCache } from "./cached_call.js";
import { requestJev, requestOllama } from "./providers.js";

const { values } = parseArgs({ options: { offline: { type: "boolean", default: false } } });
const input = {
  text: "I support allowing more housing to be built by right near reliable public transit. I will propose removing restrictive zoning rules.",
  issueId: "housing.zoning",
  negativePoleLabel: "Retain restrictive zoning",
  positivePoleLabel: "Allow more housing by right",
  projectionVersion: "provider-smoke-synthetic-v1",
  mode: "names_and_party",
};
await withModelCache(
  { directory: join(process.cwd(), ".cache/provider-smoke"), offline: values.offline! },
  async () => {
    const providers = [
      {
        name: "jev",
        version: process.env.JEV_MODEL_VERSION ?? "jev-1.14.0",
        call: () =>
          requestJev(
            input,
            process.env.JEV_API_KEY ?? "",
            process.env.JEV_MODEL_VERSION ?? "jev-1.14.0",
          ),
      },
      {
        name: "ollama",
        version: `${process.env.OLLAMA_MODEL}@${process.env.OLLAMA_MODEL_DIGEST}`,
        call: () =>
          requestOllama(input, {
            apiKey: process.env.OLLAMA_API_KEY ?? "",
            model: process.env.OLLAMA_MODEL ?? "",
            digest: process.env.OLLAMA_MODEL_DIGEST ?? "",
          }),
      },
    ];
    for (const provider of providers) {
      try {
        const result = await cachedCall(
          {
            model: provider.name,
            modelVersion: provider.version,
            rubricVersion: "provider-smoke-v1",
            questions: input,
            inputHash: hash(input.text),
          },
          provider.call,
        );
        console.log(
          JSON.stringify({
            provider: provider.name,
            model: provider.version,
            status: "ok",
            stance: result.stance,
            relevance: result.relevance,
            evaluationOnly: true,
          }),
        );
      } catch (error) {
        console.error(
          JSON.stringify({
            provider: provider.name,
            status: "failed",
            reason: error instanceof Error ? error.message : "Provider failed",
          }),
        );
        process.exitCode = 1;
      }
    }
  },
);
