import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { parse as yaml } from "yaml";
import { z } from "zod";
import { hash } from "@ftb/scraping";
import { ballotRunSchema, runBallotPipeline } from "./run.js";
import { publishRelease, type PublishPayload } from "./publish.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));

async function implementationHash(): Promise<string> {
  const entries: [string, string][] = [];
  for (const name of ["pipeline", "scraping", "records", "types"]) {
    const dir = join(root, "packages", name, "src");
    for (const file of (await readdir(dir, { recursive: true }))
      .filter((file) => file.endsWith(".ts"))
      .sort()) {
      entries.push([`${name}/${file}`, hash(await readFile(join(dir, file)))]);
    }
  }
  return hash(JSON.stringify(entries));
}

export async function runCli(): Promise<void> {
  const { values } = parseArgs({
    options: {
      config: { type: "string" },
      out: { type: "string", default: "dist" },
      offline: { type: "boolean", default: false },
      fixture: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help || (!values.config && !values.fixture)) {
    console.log(
      "Usage: pnpm -F @ftb/pipeline start --config <verified-ballot-run.json> [--out dist] [--offline]\nExplicit synthetic fixture mode: pnpm -F @ftb/pipeline start --fixture",
    );
    process.exitCode = values.help ? 0 : 1;
    return;
  }
  if (values.fixture) {
    if (values.config) throw new Error("Fixture and live config modes are mutually exclusive");
    const payload = JSON.parse(
      await readFile(join(root, "fixtures/release-fixture.json"), "utf8"),
    ) as PublishPayload;
    const result = publishRelease(payload, {
      outDir: resolve(values.out, "fixture-demo"),
      blocklist: {
        candidateNames: ["John Doe", "Jane Smith"],
        partyLabels: ["Democrat", "Republican", "Libertarian", "Green"],
      },
    });
    console.log("SYNTHETIC FIXTURE ONLY", JSON.stringify(result));
    if (!result.success) process.exitCode = 1;
    return;
  }
  const raw = JSON.parse(await readFile(resolve(values.config!), "utf8"));
  if (raw.analysis) {
    raw.analysis = {
      ...raw.analysis,
      jevModelVersion: raw.analysis.jevModelVersion ?? process.env.JEV_MODEL_VERSION,
      ollamaModelVersion: raw.analysis.ollamaModelVersion ?? process.env.OLLAMA_MODEL,
      ollamaModelDigest: raw.analysis.ollamaModelDigest ?? process.env.OLLAMA_MODEL_DIGEST,
    };
  }
  const spec = ballotRunSchema.parse(raw);
  const sourceText = await readFile(join(root, "config/sources.yaml"), "utf8");
  const issueText = await readFile(join(root, "config/issues.yaml"), "utf8");
  const sourcePolicy = z
    .object({
      version: z.string(),
      news: z.array(z.object({ domain: z.string() })),
      questionnaires: z.array(z.object({ url: z.string().url() })),
    })
    .parse(yaml(sourceText));
  const issuePolicy = z
    .object({
      version: z.string(),
      issues: z.array(
        z.object({
          id: z.string(),
          negativePole: z.string(),
          positivePole: z.string(),
          levels: z.array(z.string()),
        }),
      ),
    })
    .parse(yaml(issueText));
  let gitSha = "unknown";
  try {
    gitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    /* source hash below still binds the implementation */
  }
  const result = await runBallotPipeline(spec, {
    directory: resolve(values.out),
    offline: values.offline,
    gitSha,
    env: process.env,
    policy: {
      version: sourcePolicy.version,
      newsDomains: sourcePolicy.news.map((entry) => entry.domain),
      questionnaireDomains: sourcePolicy.questionnaires.map((entry) => new URL(entry.url).hostname),
      issues: issuePolicy.issues,
      versions: {
        sources: sourcePolicy.version,
        issues: issuePolicy.version,
        sourcePolicyHash: hash(sourceText),
        issuePolicyHash: hash(issueText),
        implementationHash: await implementationHash(),
      },
    },
  });
  console.log(
    JSON.stringify(
      {
        releaseId: result.releaseId,
        manifestHash: result.manifestHash,
        demo: result.demo,
        contests: result.contests,
        candidates: result.candidates,
        full: result.full,
        objectiveOnly: result.objectiveOnly,
        cardsAvailable: result.cardsAvailable,
        coverageFile: resolve(values.out, spec.releaseId, "coverage.json"),
        publication: result.publication,
      },
      null,
      2,
    ),
  );
  if (result.demo || result.coverage.some((entry) => entry.gaps.length > 0)) process.exitCode = 2;
}
