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

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export async function runPipeline(): Promise<void> {
  const { runCli } = await import("./run-cli.js");
  await runCli();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPipeline().catch(() => {
    console.error(
      "Pipeline failed; inspect local stage artifacts and configuration. No release should be assumed published.",
    );
    process.exitCode = 1;
  });
}
