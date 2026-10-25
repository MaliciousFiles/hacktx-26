// CLI: run the social scrapers and write the results to disk for inspection.
//
//   pnpm -F @ftb/scraping scrape:social -- --accounts ../../config/social_accounts.json
//
// Options: --accounts <json>  --since <ISO>  --until <ISO>  --fetched-at <ISO>  --max <n>  --out <dir>
// Writes <out>/sources.json (Source[]) and <out>/coverage.json (SocialCoverageRow[]).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { scrapeSocial, socialFinders, type CandidateAccounts } from "./social.js";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"), // pnpm forwards a literal "--"
  options: {
    accounts: { type: "string", default: "../../config/social_accounts.json" },
    // Draft campaign window (PLAN.md §5); keep in sync with the release.
    since: { type: "string", default: "2025-11-08" },
    until: { type: "string", default: "2026-11-03" },
    // The snapshot date for this run. Recorded on every Source; anchors "3 days ago".
    "fetched-at": { type: "string", default: new Date().toISOString().slice(0, 10) },
    max: { type: "string", default: "30" },
    out: { type: "string" },
  },
});

const fetchedAt = values["fetched-at"]!;
const window = { since: values.since!, until: values.until! };
const outDir = resolve(values.out ?? join("dist", "social", fetchedAt));

const parsed = JSON.parse(readFileSync(resolve(values.accounts!), "utf-8")) as {
  candidates: CandidateAccounts[];
};

const finders = socialFinders(process.env, { fetchedAt, maxItems: Number(values.max) });
console.log(
  `Scraping ${parsed.candidates.length} candidate(s), window ${window.since} → ${window.until}, ` +
    `finders: ${finders.map((f) => `${f.platform}(${f.method})`).join(", ")}`,
);
if (!process.env.SERPAPI_API_KEY)
  console.log("SERPAPI_API_KEY not set: only Bluesky (and X if X_BEARER_TOKEN) will run.");

const { sources, report } = await scrapeSocial(parsed.candidates, window, finders);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "sources.json"), JSON.stringify(sources, null, 2));
writeFileSync(join(outDir, "coverage.json"), JSON.stringify(report, null, 2));

console.log("\nCoverage");
console.table(
  report.map((r) => ({
    candidate: r.candidateId,
    platform: r.platform,
    status: r.status,
    method: r.method ?? "",
    items: r.items,
    undated: r.undated,
    error: r.error?.slice(0, 80) ?? "",
  })),
);

console.log("\nNewest items");
const newest = [...sources].sort((a, b) =>
  (b.eventDate.date ?? "").localeCompare(a.eventDate.date ?? ""),
);
for (const s of newest.slice(0, 15)) {
  const when = s.eventDate.date ? `${s.eventDate.date} (${s.eventDate.precision})` : "date unknown";
  console.log(`  ${when.padEnd(20)} ${s.candidateId} · ${s.outlet} · ${s.text.slice(0, 90)}`);
}
console.log(`\nWrote ${sources.length} sources and ${report.length} coverage rows to ${outDir}`);
