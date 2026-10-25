import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { load } from "cheerio";
import {
  fetchTravisSampleBallotDocuments,
  lookupTravisDistricts,
  SnapshotClient,
  TRAVIS_ELECTION_INVENTORY,
  TRAVIS_ELECTION_PAGE,
  travisCountyFetch,
} from "@ftb/records";
import { z } from "zod";

const { values } = parseArgs({
  options: {
    election: { type: "string" },
    out: { type: "string", default: "dist/ballot-discovery" },
    offline: { type: "boolean", default: false },
  },
});
const election = z.string().date().parse(values.election);
const directory = resolve(values.out);
const client = new SnapshotClient({
  directory: join(directory, "lookup-cache"),
  mode: values.offline ? "offline" : "reuse",
  intervalMs: 750,
  fetch: travisCountyFetch,
});
const progress = (message: string) => console.error(`[${new Date().toISOString()}] ${message}`);

const lines = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
progress("Enter address on stdin (used locally only; not written to output artifacts):");
let address = "";
try {
  for await (const line of lines) {
    address = line;
    break;
  }
} finally {
  lines.close();
}
if (!address) throw new Error("Address input required on stdin");
const lookup = await lookupTravisDistricts(address, { client, onProgress: progress });
address = "";
progress(`District lookup: ${lookup.status}`);

const page = await client.get(TRAVIS_ELECTION_PAGE, { format: "html" });
const $ = load(page.text);
const links = $("a[href]")
  .toArray()
  .map((element) => ({
    label: $(element).text().trim(),
    url: new URL($(element).attr("href")!, TRAVIS_ELECTION_PAGE).href,
  }));

const electionSnapshot = await client.get(`${TRAVIS_ELECTION_INVENTORY}?type=current&lang=en-US`, {
  format: "json",
});
const inventory = z
  .object({
    elections: z.array(z.object({ eid: z.number().int(), date: z.string(), name: z.string() })),
  })
  .parse(JSON.parse(electionSnapshot.text));
const [year, month, day] = election.split("-");
const matching = inventory.elections.filter((row) => row.date === `${month}/${day}/${year}`);
if (matching.length !== 1)
  throw new Error("Requested election not uniquely verified in official election inventory");
const officialElection = matching[0]!;

const references: Array<{
  label: string;
  url: string;
  snapshotId: string;
  contentHash: string;
  scope: string;
}> = [];
for (const link of links.filter(
  (entry) =>
    /consolidated ballot/i.test(entry.label) &&
    new URL(entry.url).hostname === "votetravis.gov" &&
    /\.pdf$/i.test(new URL(entry.url).pathname),
)) {
  progress(
    "Archiving official countywide consolidated ballot (reference only, not an address ballot)",
  );
  const snapshot = await client.get(link.url, { format: "pdf" });
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `consolidated-${snapshot.contentHash}.txt`), snapshot.text, {
    flag: "wx",
  }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  });
  references.push({
    ...link,
    snapshotId: snapshot.id,
    contentHash: snapshot.contentHash,
    scope: "countywide_union_not_personal_ballot",
  });
}

const precinctId = lookup.districts?.Precinct;
const sample =
  lookup.status === "districts_resolved" && precinctId
    ? await fetchTravisSampleBallotDocuments({
        client,
        electionId: officialElection.eid,
        precinctId,
        onProgress: progress,
      })
    : undefined;

const officialSampleBallots: Array<{
  party: string;
  partyAbbreviation?: string;
  alternateBallotType?: string;
  fileName: string;
  url: string;
  snapshotId: string;
  contentHash: string;
  textFile: string;
}> = [];
if (sample?.status === "published") {
  await mkdir(directory, { recursive: true });
  for (const document of sample.documents) {
    progress(`Archiving official sample ballot document: ${document.party} / ${document.fileName}`);
    const snapshot = await client.get(document.url, { format: "pdf" });
    const label = (document.partyAbbreviation ?? document.party)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const textFile = `official-sample-ballot-${sample.precinctId}-${label}-${snapshot.contentHash}.txt`;
    await writeFile(join(directory, textFile), snapshot.text, { flag: "wx" }).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    });
    officialSampleBallots.push({
      ...document,
      snapshotId: snapshot.id,
      contentHash: snapshot.contentHash,
      textFile,
    });
  }
}

const scopeStatus =
  lookup.status !== "districts_resolved"
    ? lookup.status === "ambiguous"
      ? "blocked_ambiguous_address"
      : "blocked_address_not_found"
    : !sample
      ? "blocked_official_sample_ballot_unavailable"
      : sample.status === "published"
        ? "official_sample_ballot_available_pending_roster_parse"
        : sample.status === "interactive_not_supported"
          ? "blocked_interactive_ballot_only"
          : "blocked_official_sample_ballot_not_published";

const report = {
  version: "travis-ballot-discovery-v2",
  election,
  officialElection,
  status: scopeStatus,
  lookupStatus: lookup.status,
  // Do not persist the address, matching rows, coordinates, or voter information.
  districts: lookup.districts,
  matchingRows: lookup.matchingRows,
  checkedRows: lookup.checkedRows,
  lookupSnapshots: lookup.snapshots,
  ballotStyleId: null,
  officialSampleBallot: sample
    ? {
        electionId: sample.electionId,
        precinctId: sample.precinctId,
        language: sample.language,
        status: sample.status,
        ballotType: sample.ballotType,
        documents: officialSampleBallots,
        source: sample.source,
      }
    : null,
  references,
  officialLookupLinks: links.filter((entry) => /voter lookup|accessible ballot/i.test(entry.label)),
  officialPage: {
    url: page.sourceUrl,
    snapshotId: page.id,
    contentHash: page.contentHash,
    fetchedAt: page.fetchedAt,
  },
  gaps: [
    ...lookup.gaps,
    ...(sample?.gaps ?? []),
    "Countywide consolidated PDF must not be represented as this address's personal ballot. Voter-registration lookups and CAPTCHA bypass are not used.",
    ...(sample?.status === "published"
      ? [
          "Official documents are archived but not yet parsed into a verified contest/candidate roster. Do not launch a ballot-wide crawl until that parser and roster review pass.",
        ]
      : []),
  ],
};
await mkdir(directory, { recursive: true });
await writeFile(join(directory, "ballot-discovery.json"), JSON.stringify(report, null, 2) + "\n");
progress(
  `Official sample-ballot status: ${sample?.status ?? "not checked"}. Ballot-wide scraping remains blocked until a verified roster exists; no guessed candidate roster launched.`,
);
console.log(
  JSON.stringify(
    {
      election,
      status: scopeStatus,
      precinct: precinctId ?? null,
      districts: lookup.districts,
      sampleBallotStatus: sample?.status ?? null,
      sampleBallotDocuments: officialSampleBallots.length,
      report: join(directory, "ballot-discovery.json"),
    },
    null,
    2,
  ),
);
process.exitCode = 2;
