// Offline pipeline (Person 2, PLAN.md §4, §7):
// snapshot → normalize → mask → classify → aggregate → generate → validate → publish release.
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

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Release, Ballot, Contest, CandidateProfile, PolicyCard, SourceCitation } from "@ftb/types";
import { publishRelease, type PublishPayload } from "./publish.js";

/**
 * Top-level runner for the pipeline.
 * In production or CLI, runs the full batch across all contests.
 * In development or testing with fixtures, validates and publishes the fixture release.
 */
export async function runPipeline(): Promise<void> {
  console.log("🧚 [Fairy Tale Ballot] Running offline data pipeline...");

  const fixturePath = join(process.cwd(), "..", "..", "fixtures", "release-fixture.json");
  const localFixturePath = join(process.cwd(), "fixtures", "release-fixture.json");
  const targetFixture = existsSync(fixturePath) ? fixturePath : localFixturePath;

  if (existsSync(targetFixture)) {
    console.log(`Loading fixture data from: ${targetFixture}`);
    const fixtureData = JSON.parse(readFileSync(targetFixture, "utf-8")) as PublishPayload;

    const result = publishRelease(fixtureData, {
      outDir: join(process.cwd(), "dist"),
      blocklist: {
        candidateNames: ["John Doe", "Jane Smith"],
        partyLabels: ["Democrat", "Republican", "Libertarian", "Green"],
      },
    });

    if (result.success) {
      console.log(`✅ Pipeline published release successfully!`);
      console.log(`   Release path: ${result.releaseFilePath}`);
      console.log(`   Manifest hash: ${result.manifestHash}`);
    } else {
      console.error(`❌ Pipeline publication failed:`);
      for (const err of result.errors) console.error(`   - ${err}`);
      for (const leak of result.leaks) console.error(`   - [LEAK] ${leak}`);
      process.exitCode = 1;
    }
  } else {
    console.log("No initial fixture found. Pipeline ready for live scraping data.");
  }
}

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  runPipeline().catch((err) => {
    console.error("Fatal pipeline error:", err);
    process.exit(1);
  });
}

