import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { researchCandidateHistory } from "./history";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    office: { type: "string" },
    jurisdiction: { type: "string", default: "us/tx" },
    district: { type: "string" },
    month: { type: "string", default: "11" },
    year: { type: "string", default: "2026" },
    bioguide: { type: "string" },
    since: { type: "string" },
    "house-roll-cap": { type: "string", default: "60" },
    output: { type: "string" },
    cache: { type: "string", default: ".cache" },
    offline: { type: "boolean", default: false },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help || !values.name || !values.office) {
  console.log(`Usage: pnpm -F @ftb/records history --name "Greg Casar" --office us_house
  [--jurisdiction us/tx] [--district 37] [--month 11] [--year 2026]
  [--bioguide C001131] [--since 2015-01-01] [--house-roll-cap 60]
  [--output output/history.json] [--cache .cache] [--offline]

Takes the candidate name and the race they are running in, auto-plans prior-office
official sources, and writes OfficialAction[] for @ftb/pipeline.`);
  process.exitCode = values.help ? 0 : 1;
} else {
  try {
    const result = await researchCandidateHistory({
      name: values.name,
      office: values.office,
      jurisdiction: values.jurisdiction,
      district: values.district,
      month: Number(values.month),
      year: Number(values.year),
      bioguide: values.bioguide,
      since: values.since,
      houseRollCap: Number(values["house-roll-cap"]),
      cacheDirectory: resolve(values.cache),
      cacheMode: values.offline ? "offline" : "reuse",
      congressApiKey: process.env.CONGRESS_GOV_API_KEY,
    });
    const payload = {
      request: result.request,
      actions: result.actions,
      identityNotes: result.identityNotes,
      rationale: result.rationale,
      gaps: result.gaps,
      coverage: result.coverage,
    };
    const json = JSON.stringify(payload, null, 2) + "\n";
    if (values.output) {
      const file = resolve(values.output);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, json);
      console.log(`Wrote ${result.actions.length} actions to ${file}`);
    } else console.log(json);
    for (const note of result.identityNotes) console.error(`identity: ${note}`);
    for (const gap of result.gaps) console.error(`gap: ${gap}`);
    for (const source of result.coverage) {
      console.error(`${source.source}: ${source.status} (${source.actionCount}) — ${source.reason}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "History research failed");
    process.exitCode = 1;
  }
}
