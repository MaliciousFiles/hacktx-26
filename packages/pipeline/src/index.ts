// Offline pipeline library. Importing it never loads fixtures or starts a job.
export * from "./cached_call.js";
export * from "./snapshot.js";
export * from "./normalize.js";
export * from "./classify.js";
export * from "./aggregate.js";
export * from "./generate.js";
export * from "./validate.js";
export * from "./cards.js";
export * from "./publish.js";
export * from "./records.js";
export * from "./run.js";
export * from "./providers.js";
export * from "./batch.js";
export * from "./ollama.js";
export * from "./model-config.js";

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export async function runPipeline(): Promise<void> {
  const { runCli } = await import("./run-cli.js");
  await runCli();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPipeline().catch((error: unknown) => {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const stack = error instanceof Error && error.stack ? `\n${error.stack.split("\n").slice(0, 6).join("\n")}` : "";
    console.error(`Pipeline failed: ${redactCredentials(message)}${redactCredentials(stack)}`);
    console.error(
      "Inspect local stage artifacts and configuration. No release should be assumed published.",
    );
    process.exitCode = 1;
  });
}

/** Never echo a credential-bearing query string to a terminal or log file. */
function redactCredentials(text: string): string {
  return text.replace(/([?&](?:api_key|apikey|key|token|access_token|Authorization)=)[^&\s"']+/gi, "$1[redacted]");
}
