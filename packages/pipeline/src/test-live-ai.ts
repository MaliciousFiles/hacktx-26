// test-live-ai.ts — Live integration test runner for @ftb/pipeline
// Runs real raw candidate text through JEV / Gemini with full validation.
//
// Usage:
//   export GEMINI_API_KEY="your-api-key"
//   npx tsx src/test-live-ai.ts

import { normalizeSource } from "./normalize.js";
import { classifyOne } from "./classify.js";
import { generateHighlights, generatePlans } from "./generate.js";
import { validateQuote } from "./validate.js";
import type { Source } from "@ftb/types";
import type { IssuePoleLabel } from "./classify.js";

async function main() {
  console.log("🧚 [Fairy Tale Ballot] Running Live AI Pipeline Test...\n");

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const jevApiKey = process.env.JEV_API_KEY || "dummy-jev-key";

  if (!geminiApiKey) {
    console.warn("⚠️  WARNING: GEMINI_API_KEY is not set in your environment or .env!");
    console.warn("   To run with live Gemini API calls, run:");
    console.warn("     export GEMINI_API_KEY=\"AIzaSy...\"");
    console.warn("     npx tsx src/test-live-ai.ts\n");
    return;
  }

  // 1. Raw candidate speech (e.g., from a real questionnaire on housing in Austin)
  const candidateRawText =
    "Representative Gina Hinojosa stated: We must reform municipal zoning to allow multifamily housing " +
    "near major transit corridors by right. High housing costs are pushing working families out of central Austin. " +
    "I sponsored HB 1234 to cut red tape and incentivize private builders without public subsidies.";

  const source: Source = {
    id: "src-live-test-1",
    contestId: "contest-tx-house-49",
    candidateId: "cand-hinojosa",
    type: "questionnaire",
    url: "https://apps.texastribune.org/features/2026/texas-voter-guide/",
    outlet: "texas_tribune",
    fetchedAt: new Date().toISOString().slice(0, 10),
    eventDate: { date: "2026-10-01", basis: "published", precision: "day" },
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
    candidateNames: ["Gina Hinojosa", "Hinojosa"],
  });
  console.log("   Masked text preview:", normalized.text.slice(0, 100), "...\n");

  console.log("2. Calling Classifier (JEV / Gemini fallback)...");
  const config = {
    jevApiKey,
    geminiApiKey,
    jevModelVersion: "jev-1.14",
    geminiModelVersion: "gemini-2.0-flash",
    rubricVersion: "rubric-v1",
    outDir: "dist",
    lowConfidenceThreshold: 0.6,
  };

  const classification = await classifyOne(
    normalized,
    source,
    "cand-hinojosa",
    "contest-tx-house-49",
    issue,
    undefined,
    config,
  );

  if (!classification) {
    console.error("❌ Statement was classified as irrelevant.");
    return;
  }

  console.log(`   Stance position: ${classification.position.toFixed(2)} (-1.0 negative pole to +1.0 positive pole)`);
  console.log(`   Relevance: ${classification.relevance.toFixed(2)}`);
  console.log(`   Claim type: ${classification.claimType}`);
  console.log(`   Within legal authority: ${classification.withinAuthority}\n`);

  // Build temporary evidence object
  const evidence = {
    ...classification,
    id: "ev-live-1",
    eventDate: source.eventDate,
    quoteSpan: { start: 37, end: 135 },
    quote: candidateRawText.slice(37, 135),
  };

  console.log("3. Validating Quote against raw source text...");
  const quoteCheck = validateQuote(evidence, [source]);
  if (quoteCheck.valid) {
    console.log("   ✅ Quote matches originalText slice character-for-character!\n");
  } else {
    console.error("   ❌ Quote mismatch:", quoteCheck.error);
  }

  console.log("4. Generating Platform Highlights with Gemini...");
  const genConfig = {
    geminiApiKey,
    geminiModelVersion: "gemini-2.0-flash",
    rubricVersion: "rubric-v1",
  };

  const highlights = await generateHighlights("cand-hinojosa", [evidence], genConfig);
  console.log("   Generated highlights:");
  for (const h of highlights) {
    console.log(`   • "${h.text}" [Citations: ${h.citations.map((c) => c.id).join(", ")}]`);
  }
  console.log();

  console.log("5. Generating Structured 6-Slot Plan with Gemini...");
  const plans = await generatePlans("cand-hinojosa", [evidence], genConfig);
  for (const p of plans) {
    console.log(`   Plan for ${p.issueId}:`);
    console.log(`   - Goal:`, p.goal.state === "documented" ? p.goal.sentences[0]?.text : "Not stated");
    console.log(`   - Mechanism:`, p.mechanism.state === "documented" ? p.mechanism.sentences[0]?.text : "Not stated");
    console.log(`   - Cost:`, p.cost.state);
    console.log(`   - Funding:`, p.funding.state);
    console.log(`   - Specificity Score:`, (p.specificity * 100).toFixed(0) + "%");
  }

  console.log("\n🎉 Live AI Pipeline Test Completed Successfully!");
}

main().catch(console.error);
