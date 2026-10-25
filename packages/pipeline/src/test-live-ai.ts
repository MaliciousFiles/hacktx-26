// test-live-ai.ts — Live integration test runner for @ftb/pipeline
// Runs explicitly synthetic candidate text through JEV / Ollama with full validation.
//
// Usage:
//   export OLLAMA_API_KEY="your-api-key"
//   npx tsx src/test-live-ai.ts

import { normalizeSource } from "./normalize.js";
import { classifyOne } from "./classify.js";
import { generateHighlights, generatePlans } from "./generate.js";
import { modelConfigFromEnv } from "./model-config.js";
import { validateQuote } from "./validate.js";
import type { Source } from "@ftb/types";
import type { IssuePoleLabel } from "./classify.js";

async function main() {
  console.log("🧚 [Fairy Tale Ballot] Running Live AI Pipeline Test...\n");

  const config = modelConfigFromEnv("dist");

  // 1. Synthetic speech for transport and citation validation; never election evidence.
  const candidateRawText =
    "Synthetic Candidate stated: We must reform municipal zoning to allow multifamily housing " +
    "near major transit corridors by right. High housing costs are pushing working families out of central Austin. " +
    "I sponsored HB 1234 to cut red tape and incentivize private builders without public subsidies.";

  const source: Source = {
    id: "src-live-test-1",
    contestId: "contest-tx-house-49",
    candidateId: "cand-synthetic",
    type: "questionnaire",
    url: "https://example.invalid/synthetic-pipeline-test",
    outlet: "synthetic_test",
    fetchedAt: new Date().toISOString().slice(0, 10),
    contentHash: "hash-live-test",
    originalText: candidateRawText,
    text: candidateRawText,
  };

  const issue: IssuePoleLabel = {
    id: "housing.zoning",
    negativePole: "Retain restrictive zoning and neighborhood development controls",
    positivePole: "Allow more housing by right and reduce zoning restrictions",
  };

  console.log("1. Normalizing & Masking candidate names...");
  const normalized = normalizeSource(source, {
    mode: "names_only",
    projectionVersion: "proj-v1",
    candidateNames: ["Synthetic Candidate", "Candidate"],
  });
  console.log("   Masked text preview:", normalized.text.slice(0, 100), "...\n");

  console.log("2. Calling Classifier (JEV / Ollama fallback)...");

  const classification = await classifyOne(
    normalized,
    source,
    "cand-synthetic",
    "contest-tx-house-49",
    issue,
    undefined,
    config,
  );

  if (!classification) {
    throw new Error(
      "Classification withheld: irrelevant, low confidence, or fallback pending review. See dist/logs/review-queue.jsonl",
    );
  }

  console.log(
    `   Stance position: ${classification.position.toFixed(2)} (-1.0 negative pole to +1.0 positive pole)`,
  );
  console.log(`   Relevance: ${classification.relevance.toFixed(2)}`);
  console.log(`   Claim type: ${classification.claimType}`);
  console.log(`   Within legal authority: ${classification.withinAuthority}\n`);

  // Build temporary evidence object
  const evidence = {
    ...classification,
    id: "ev-live-1",
    date: source.fetchedAt,
    quoteSpan: { start: 0, end: classification.quote.length },
  };

  console.log("3. Validating Quote against raw source text...");
  const quoteCheck = validateQuote(evidence, [source]);
  if (quoteCheck.valid) {
    console.log("   ✅ Quote matches originalText slice character-for-character!\n");
  } else {
    throw new Error(quoteCheck.error ?? "Quote validation failed");
  }

  console.log("4. Generating Platform Highlights with Ollama...");
  const genConfig = config;

  const highlights = await generateHighlights("cand-synthetic", [evidence], genConfig);
  console.log("   Generated highlights:");
  for (const h of highlights) {
    console.log(`   • "${h.text}" [Citations: ${h.citations.map((c) => c.id).join(", ")}]`);
  }
  console.log();

  console.log("5. Generating Structured 6-Slot Plan with Ollama...");
  const plans = await generatePlans("cand-synthetic", [evidence], genConfig);
  for (const p of plans) {
    console.log(`   Plan for ${p.issueId}:`);
    console.log(
      `   - Goal:`,
      p.goal.state === "documented" ? p.goal.sentences[0]?.text : "Not stated",
    );
    console.log(
      `   - Mechanism:`,
      p.mechanism.state === "documented" ? p.mechanism.sentences[0]?.text : "Not stated",
    );
    console.log(`   - Cost:`, p.cost.state);
    console.log(`   - Funding:`, p.funding.state);
    console.log(`   - Specificity Score:`, (p.specificity * 100).toFixed(0) + "%");
  }

  console.log("\n🎉 Live AI Pipeline Test Completed Successfully!");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Live pipeline test failed");
  process.exitCode = 1;
});
