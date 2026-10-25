# Ballot-wide corpus collection

## Current live lookup result

For the user-provided Austin address and November 3, 2026 election, the public
county address index resolved precinct **315**, split **315.2**, Congressional
**37**, Texas House **49**, Texas Senate **14**, SBOE **5**, and Austin Council
**9**. These are district assignments, **not an official ballot-style ID**.

The live lookup checked all **3,267 public address-index rows** for ZIP 78705 in
two pages, locally matched the address, verified the election against the official
county election inventory, and archived the official consolidated ballot PDF.
The countywide PDF is a union of contests, not a personal ballot. No guessed
candidate roster or ballot-wide history/model job has been launched.

The finder also calls Travis County's **official precinct-keyed sample-ballot list**
(the same `getUniqueParties` endpoint its sample-ballot widget uses) for election
`20`, precinct `315`. On **2026-10-25** that list returned `ballotType: "PDF"` with
**zero published documents**, matching the county page's “Sample Ballots Coming
Soon.” The same empty list was observed for sampled precincts 1–414, including 315. That is **not published**, not a precinct with no contests. The report records
the official response snapshot/hash and status
`blocked_official_sample_ballot_not_published`.

Local report: `dist/ballot-discovery-2026-11-03/ballot-discovery.json` (relative to
this package). `lookup-cache/` contains immutable public reference snapshots;
the report does not contain the entered address. This lookup cache is **not** a
research run and must not be imported into the research database. Public addresses
inside the downloaded ZIP-level index are reference data, not collected voter
profiles. No voter names, dates of birth, registrations, or voting history are used.

## Re-run without sending the street address to a server

```sh
pnpm -F @ftb/pipeline ballot-find --election 2026-11-03 \
  --out dist/ballot-discovery-2026-11-03
```

Enter the address on stdin when prompted. The only address-index query sent is
`ZIP = 78705`; matching happens locally. `--offline` reuses the public snapshots.
Exit 2 means the official roster is unresolved, not success. The address index is
current public data, not proof of its election-effective date.

The finder keys the official sample ballot on **precinct** (315). A split (315.2)
is an address-index subdivision, not a ballot-style ID, and is never sent to the
ballot endpoint. If the county publishes documents, the finder downloads each
official PDF, extracts text, and stores its hash/text for review; it still refuses
to launch a ballot-wide crawl until a deterministic parser produces a complete
contest/candidate roster and that roster is verified. Do not use a ZIP, district,
precinct, or split as a fabricated ballot-style ID. Do not bypass CAPTCHA or scrape
voter-registration records to fill the gap. The countywide consolidated ballot is
never substituted for the precinct ballot.

## Current blocker

The ballot-specific block is the county's unpublished 2026 sample ballot. Rerun
`ballot-find` after publication; it will archive the precinct-315 PDFs and record
their hashes. Do not proceed from the consolidated ballot's union roster. A
county-supplied official sample ballot for precinct 315 is equally acceptable input
for roster verification, but it still has to be parsed and reviewed before a run.

## Parallel collection once the roster is verified

```sh
pnpm -F @ftb/pipeline start --config path/to/verified-ballot.json \
  --out dist/corpus --research-only --concurrency 3
```

This runs up to three candidate acquisition workers. Each collects records and
web material concurrently, while shared per-host queues retain publisher delays.
Records source phases and completed/total candidate counts go to timestamped
stderr. Raw response caches are reusable; successful candidate acquisitions are
saved immediately to `candidate-checkpoints/<candidate-id>.json`, before the full
ballot acquisition completes. Output arrays retain official input roster order,
not network completion order. Classification remains separately budgeted/sequential.
In-flight workers are drained on fatal failure; no detached tasks keep writing.

Checkpoints are inspectable recovery artifacts, **not** automatic completion or
retry scheduling. Failed/incomplete requests remain gaps. An unchanged rerun reuses
raw caches; changed outputs under a frozen run ID require a new run ID. The default
CLI concurrency is 3 (library default 1); supported range 1–16. Do not run multiple
jobs against the same run directory simultaneously.

## “Entire history” is not implemented yet

Existing discovery is bounded, not career-complete: it defaults to a 2015 start,
automatically inventories federal sources only from 2023, uses configured House
roll bounds and document caps, and only auto-discovers Texas FTP session 89R.
Other adapters need configured session/body/source inventories. Campaign/news
discovery is a bounded current-window search, not an exhaustive archive. Social
history, debates/transcripts, and finance have additional known gaps.

A full-corpus job needs verified office tenures, every relevant session/year,
exhaustive paginated inventories, durable task-level retry/backlog state, source
freshness checks, and explicit discovered/fetched/failed/remaining counts. Simply
raising the three-document test caps would not meet that requirement. Publication
must remain separate from collection and database import.
