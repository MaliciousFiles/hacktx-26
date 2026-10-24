import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createRecordsCollector } from "./index";
import { planSchema } from "./collector";
import { requestSchema } from "./model";

const { values } = parseArgs({
  options: {
    request: { type: "string" }, plan: { type: "string" }, output: { type: "string" },
    cache: { type: "string", default: ".cache" },
    offline: { type: "boolean", default: false }, refresh: { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help || !values.request || !values.plan) {
  console.log(`Usage: pnpm -F @ftb/records collect --request <request.json> --plan <plan.json>
  [--output output/result.json] [--cache .cache] [--offline | --refresh]

Paths are relative to packages/records when invoked with pnpm -F.
The plan declares sources, not a ballot. Every request represents one candidate.
Cache reuse is default; --offline forbids downloads; --refresh checks for updates.`);
  process.exitCode = values.help ? 0 : 1;
} else {
  try {
    if (values.offline && values.refresh) throw new Error("--offline and --refresh are mutually exclusive");
    const request = requestSchema.parse(JSON.parse(await readFile(resolve(values.request), "utf8")));
    const plan = planSchema.parse(JSON.parse(await readFile(resolve(values.plan), "utf8")));
    const collector = createRecordsCollector({
      cacheDirectory: resolve(values.cache),
      cacheMode: values.offline ? "offline" : values.refresh ? "refresh" : "reuse",
      congressApiKey: process.env.CONGRESS_GOV_API_KEY,
    });
    const result = await collector.collect(request, plan);
    const json = JSON.stringify(result, null, 2) + "\n";
    if (values.output) {
      const file = resolve(values.output);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, json);
      console.log(`Wrote ${result.actions.length} actions to ${file}`);
    } else console.log(json);
    for (const source of result.coverage) {
      console.error(`${source.source}: ${source.status} (${source.actionCount} actions) — ${source.reason}`);
    }
    if (result.coverage.some((source) => source.status !== "complete")) process.exitCode = 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Records collection failed");
    process.exitCode = 1;
  }
}
