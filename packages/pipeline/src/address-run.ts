// address → districts → roster (from the county's consolidated ballot) → research-only corpus run.
//
//   pnpm -F @ftb/pipeline corpus --address "600 W 26th St., Austin, TX 78705"
//
// The address is used in memory only; it is never written to any artifact. The roster is DERIVED
// from the countywide union ballot filtered by the address's public district assignments. It is
// not an official ballot style and is always labeled unreviewed; the run is research-only (no
// release is published, no model calls are made without an `analysis` config).
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import { parse as yaml } from "yaml";
import { z } from "zod";
import {
  lookupTravisDistricts,
  parseConsolidatedBallot,
  selectRoster,
  SnapshotClient,
  TRAVIS_ELECTION_INVENTORY,
  TRAVIS_ELECTION_PAGE,
  travisCountyFetch,
  type RosterContest,
  type TravisDistrictAssignments,
} from "@ftb/records";
import { runConfig } from "./run-cli.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const log = (message: string) => console.error(`[${new Date().toISOString()}] ${message}`);

/** Fixed, reproducible config for a derived roster. No address, no secrets. */
export function buildCorpusConfig(input: {
  releaseId: string;
  asOfDate: string;
  election: { year: number; month: number };
  precinct: number;
  provenanceUrl: string;
  contests: RosterContest[];
  web: { allowedPageHosts: string[]; speechDomains: string[] };
  records: { documentCap: number; houseRollCap: number; since?: string; exhaustive?: boolean };
}) {
  return {
    releaseId: input.releaseId,
    asOfDate: input.asOfDate,
    campaignWindow: {
      since: `${input.election.year - 1}-11-05`,
      until:
        input.asOfDate > `${input.election.year}-11-03`
          ? input.asOfDate
          : `${input.election.year}-11-03`,
    },
    election: input.election,
    // demo:true = not an official ballot style; research-only artifacts, never published.
    demo: true,
    ballot: {
      id: "derived-address-roster-not-an-official-ballot",
      ballotStyleId: "DERIVED-FROM-COUNTYWIDE-UNION-NOT-AN-OFFICIAL-BALLOT-STYLE",
      precinctId: String(input.precinct),
      provenance: {
        url: input.provenanceUrl,
        verifiedBy: "automated-district-filter-unreviewed",
        verifiedAt: input.asOfDate,
      },
      contests: input.contests.map((contest) => ({
        id: contest.id,
        title: contest.title,
        office: contest.office,
        officeKind: contest.officeKind,
        districtType: contest.districtType,
        districtId: contest.districtId,
        jurisdiction: contest.jurisdiction,
        level: contest.level,
        partisan: contest.partisan,
        seats: 1,
        candidates: contest.candidates.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          aliases: candidate.aliases,
          identifiers: {},
          ...(candidate.party ? { party: candidate.party } : {}),
          // The ballot does not say who holds or held office; history research probes every
          // supported office family by name regardless of these defaults.
          incumbent: false,
          recordInOffice: "none" as const,
          accounts: [],
        })),
      })),
    },
    web: {
      allowedPageHosts: input.web.allowedPageHosts,
      speechDomains: input.web.speechDomains,
      campaignSites: [],
      verifiedDocuments: [],
      resultsPerQuery: 10,
      maxPagesPerChannel: 5,
      maxQuotesPerSource: 10,
      maxSocialItems: 20,
    },
    records: {
      documentCap: input.records.documentCap,
      houseRollCap: input.records.houseRollCap,
      ...(input.records.since ? { since: input.records.since } : {}),
      includeTloFtp: false,
      exhaustive: input.records.exhaustive ?? false,
    },
  };
}

async function readAddress(flag: string | undefined): Promise<string> {
  if (flag) return flag;
  log("Enter address on stdin (used locally only; not written to any artifact):");
  const lines = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
  try {
    for await (const line of lines) return line;
  } finally {
    lines.close();
  }
  throw new Error("Address required: --address or stdin");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      address: { type: "string" },
      election: { type: "string", default: "2026-11-03" },
      out: { type: "string", default: "dist/corpus" },
      "as-of": { type: "string" },
      offline: { type: "boolean", default: false },
      concurrency: { type: "string", default: "3" },
      "skip-judicial": { type: "boolean", default: false },
      "document-cap": { type: "string", default: "25" },
      "house-roll-cap": { type: "string", default: "100" },
      // Records history window start. 2003 reaches Abbott's AG years and a 20-year legislative record.
      "history-since": { type: "string", default: "2003-01-01" },
      "dry-run": { type: "boolean", default: false },
      exhaustive: { type: "boolean", default: false },
    },
  });
  const election = z.string().date().parse(values.election);
  const asOfDate = z
    .string()
    .date()
    .parse(values["as-of"] ?? new Date().toISOString().slice(0, 10));
  const out = resolve(values.out);
  const concurrency = Number(values.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16)
    throw new Error("--concurrency must be an integer from 1 to 16");

  let address = await readAddress(values.address);
  const zip = /\b(\d{5})(?:-\d{4})?\s*$/.exec(address.trim())?.[1] ?? "unknown";
  const client = new SnapshotClient({
    directory: join(out, "_discovery", "lookup-cache"),
    mode: values.offline ? "offline" : "reuse",
    intervalMs: 750,
    retries: 5,
    fetch: travisCountyFetch,
  });

  log("Looking up district assignments (ZIP-level public index; address matched locally)…");
  const lookup = await lookupTravisDistricts(address, { client, onProgress: log });
  address = "";
  if (lookup.status !== "districts_resolved" || !lookup.districts)
    throw new Error(`District lookup ${lookup.status}; refusing to guess a ballot`);
  const districts: TravisDistrictAssignments = lookup.districts;
  log(
    `Districts: CD ${districts.Congressional}, TX House ${districts.Legislative}, TX Senate ${districts.Senate}, SBOE ${districts.SBOE}, Austin ${districts.MuniSMD}, precinct ${districts.Precinct}`,
  );

  log("Verifying election and archiving the official consolidated ballot…");
  const [year, month, day] = election.split("-");
  const inventory = z
    .object({
      elections: z.array(z.object({ eid: z.number().int(), date: z.string(), name: z.string() })),
    })
    .parse(
      JSON.parse(
        (
          await client.get(`${TRAVIS_ELECTION_INVENTORY}?type=current&lang=en-US`, {
            format: "json",
          })
        ).text,
      ),
    );
  if (inventory.elections.filter((row) => row.date === `${month}/${day}/${year}`).length !== 1)
    throw new Error("Requested election not uniquely verified in official election inventory");
  const page = load((await client.get(TRAVIS_ELECTION_PAGE, { format: "html" })).text);
  const link = page("a[href]")
    .toArray()
    .map((element) => ({
      label: page(element).text().trim(),
      url: new URL(page(element).attr("href")!, TRAVIS_ELECTION_PAGE).href,
    }))
    .find(
      (entry) =>
        /consolidated ballot/i.test(entry.label) &&
        new URL(entry.url).hostname === "votetravis.gov" &&
        /\.pdf$/i.test(new URL(entry.url).pathname),
    );
  if (!link) throw new Error("Official consolidated ballot link not found");
  const ballot = await client.get(link.url, { format: "pdf" });

  const parsed = parseConsolidatedBallot(ballot.text);
  let roster = selectRoster(parsed, districts);
  if (values["skip-judicial"]) {
    const judicial = roster.contests.filter((c) => c.officeKind === "judicial");
    roster = {
      contests: roster.contests.filter((c) => c.officeKind !== "judicial"),
      skipped: [
        ...roster.skipped,
        ...judicial.map((c) => ({ title: c.title, reason: "--skip-judicial" })),
      ],
    };
  }
  if (!roster.contests.length) throw new Error("No contests matched this address");
  const candidates = roster.contests.reduce((n, c) => n + c.candidates.length, 0);
  log(
    `Roster: ${roster.contests.length} contests, ${candidates} candidates (${roster.skipped.length} contests skipped)`,
  );

  const sources = yaml(await readFile(join(root, "config/sources.yaml"), "utf8")) as {
    news: { domain: string }[];
    questionnaires: { url: string }[];
  };
  const newsHosts = sources.news.flatMap((entry) => [entry.domain, `www.${entry.domain}`]);
  const questionnaireHosts = sources.questionnaires.flatMap((entry) => {
    const host = new URL(entry.url).hostname;
    return [host, host.replace(/^www\./, ""), `www.${host.replace(/^www\./, "")}`];
  });
  const config = buildCorpusConfig({
    releaseId: "pending",
    asOfDate,
    election: { year: Number(year), month: Number(month) },
    precinct: districts.Precinct,
    provenanceUrl: link.url,
    contests: roster.contests,
    web: {
      allowedPageHosts: [...new Set([...newsHosts, ...questionnaireHosts])],
      speechDomains: sources.news.map((entry) => entry.domain),
    },
    records: {
      documentCap: Number(values["document-cap"]),
      houseRollCap: Number(values["house-roll-cap"]),
      since: values["history-since"],
      exhaustive: values.exhaustive,
    },
  });
  // Same roster + dates + caps → same release ID, so an interrupted run resumes from its caches.
  const releaseId = `corpus-${zip}-${election}-${createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 8)}`;
  config.releaseId = releaseId;

  await mkdir(out, { recursive: true });
  const configPath = join(out, `${releaseId}.config.json`);
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
  await writeFile(
    join(out, `${releaseId}.roster.json`),
    JSON.stringify(
      {
        releaseId,
        status: "derived_from_countywide_union_unreviewed_not_official_ballot_style",
        election,
        districts,
        consolidatedBallot: {
          url: link.url,
          contentHash: ballot.contentHash,
          snapshotId: ballot.id,
        },
        contests: roster.contests.map((c) => ({
          title: c.title,
          office: c.office,
          districtId: c.districtId,
          candidates: c.candidates.map((x) => x.name),
        })),
        skipped: roster.skipped,
        notes: [
          "Derived from the countywide union by the address's district assignments; the county's precinct sample ballot was not published when this ran.",
          "Austin ISD single-member trustee seats are skipped: the county's ISD district code is not mapped to trustee district numbers.",
          "Propositions/measures are not politicians and are not part of this roster.",
          "Incumbency is unknown from the ballot; history research probes every supported office family by name.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  log(`Wrote ${configPath}`);
  if (values["dry-run"]) {
    log("--dry-run: stopping before acquisition");
    return;
  }

  log(`Starting research-only corpus run ${releaseId} (concurrency ${concurrency})…`);
  await runConfig(config, {
    out,
    offline: values.offline,
    researchOnly: true,
    acquisitionConcurrency: concurrency,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
