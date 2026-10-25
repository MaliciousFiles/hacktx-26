// Collect official-record history for the candidates in a targets file (no model calls).
//   pnpm --filter @ftb/pipeline records -- targets.json
// targets.json: { "election": { "month": 11, "year": 2026 }, "since"?: "2015-01-01",
//                 "documentCap"?: 12, "targets": [RecordsTarget, ...] }
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runRecordsStage, type ElectionDate, type RecordsTarget } from "./records.js";

interface TargetsFile {
  election: ElectionDate;
  since?: string;
  houseRollCap?: number;
  documentCap?: number;
  targets: RecordsTarget[];
}

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error("usage: records-cli <targets.json>");
  const spec = JSON.parse(readFileSync(resolve(file), "utf-8")) as TargetsFile;
  const outDir = join(process.cwd(), "dist");

  const result = await runRecordsStage(spec.targets, spec.election, {
    outDir,
    gitSha: gitSha(),
    configVersions: { records: "history-v1" },
    options: {
      since: spec.since,
      houseRollCap: spec.houseRollCap,
      documentCap: spec.documentCap,
      onProgress: (m) => console.log(`  ${m}`),
    },
  });

  mkdirSync(join(outDir, "records"), { recursive: true });
  const out = join(outDir, "records", "actions.json");
  writeFileSync(
    out,
    JSON.stringify({ actions: result.snapshot.actions, sources: result.snapshot.sources }, null, 2),
    "utf-8",
  );
  for (const c of result.manifest.candidates) {
    console.log(
      `${c.candidateId} (${c.office}): ${c.actions} action(s), ${c.scorable} scorable` +
        (c.incomplete ? " — INCOMPLETE (not proof of inaction)" : "") +
        (c.error ? ` — error: ${c.error}` : ""),
    );
  }
  console.log(`Wrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
