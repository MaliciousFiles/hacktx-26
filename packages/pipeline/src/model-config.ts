import type { ClassifyConfig } from "./classify.js";
import { assertPinnedVersion } from "./ollama.js";

export function modelConfigFromEnv(outDir: string): ClassifyConfig {
  const model = process.env.OLLAMA_MODEL;
  const revision = process.env.OLLAMA_MODEL_VERSION;
  const jevVersion = process.env.JEV_MODEL_VERSION;
  if (!model || !revision || !jevVersion) {
    throw new Error(
      "Set OLLAMA_MODEL, OLLAMA_MODEL_VERSION and JEV_MODEL_VERSION in the root .env",
    );
  }
  assertPinnedVersion(revision);
  assertPinnedVersion(jevVersion);
  return {
    ollamaApiKey: process.env.OLLAMA_API_KEY,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "https://ollama.com",
    ollamaModel: model,
    ollamaModelVersion: revision,
    jevApiKey: process.env.JEV_API_KEY ?? "",
    jevModelVersion: jevVersion,
    rubricVersion: "rubric-v2-ollama",
    outDir,
    lowConfidenceThreshold: 0.6,
  };
}
