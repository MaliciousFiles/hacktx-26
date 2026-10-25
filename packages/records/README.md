# @ftb/records

Past **official actions**, across the full ballot: federal, state, judicial,
county, municipal, school and special-district offices. The implementation is
incremental; an unimplemented or inaccessible source is a **coverage gap**, not a
claim that someone never acted or held office.

See [RESEARCH.md](./RESEARCH.md) for sources and the approval backlog (§8).
Wave-1 structured adapters plus wave-2 **deterministic** HTML/PDF parsers for
approved official sources (TX journals, TLO identity/analysis HTML, SCOTX/TAMES/SCJC)
are implemented. Extraction is rules-first (totals must match named lists; no
roster-inferred Yeas; explicit justice bylines only). No model extraction, news
scraping, CourtListener/Voteview defaults, or WAF bypass.

## Integration contract — team heads-up

The pipeline discovers/parses the ballot, then calls **both records and scraping**
with `CandidateResearchRequest` from `@ftb/types`:

```ts
const request = {
  candidate: {
    id: "pipeline-candidate-id",
    name: "Greg Casar",
    // Optional, already verified against an official source:
    identifiers: { bioguide: "C001131" },
    // aliases: ["a verified alternate full name"],
  },
  position: { office: "us_house", jurisdiction: "us/tx", district: "37" },
  month: 11,
  year: 2026,
};
```

`position` is the office **being sought**, not a restriction on which prior
offices can contribute records. In particular, redistricting doesn't invalidate
someone's past service in a different district. Full-name aliases must be
verified upstream; we never auto-match a surname to a candidate.

Month/year identify the election context, **not a one-month history window**.
The default exclusive cutoff is the first day of that month. An optional plan
`since` limits the historical lookback. This convention deliberately excludes
results/actions during or after the election month; use a new fixed contract if
the team needs an election-day cutoff instead. It is never based on wall-clock
time.

## Name + race → full history (phase 1)

Pass the candidate **name** and the **race they are running in**. Records builds
a prior-office source plan (`buildHistoryPlan`), optionally suggests a bioguide
via Congress.gov when `CONGRESS_GOV_API_KEY` is set, and returns
`OfficialAction[]` for `@ftb/pipeline`.

```bash
pnpm -F @ftb/records history --name "Greg Casar" --office us_house --district 37
pnpm -F @ftb/records playground   # http://127.0.0.1:4310
```

```ts
import { researchCandidateHistory } from "@ftb/records";

const { actions, gaps, rationale } = await researchCandidateHistory({
  name: "Greg Casar",
  office: "us_house",
  jurisdiction: "us/tx",
  district: "37",
  month: 11,
  year: 2026,
});
```

District is optional (omit for Senate / statewide). Known gaps (TX journal URL
inventories, AG opinion auto-crawl, TLO FTP unless `includeTloFtp: true`, …)
are returned explicitly — never as empty history claims. Playground defaults are
intentionally capped so interactive runs finish in under a minute.

**Additive shared-type changes** in `packages/types/src/index.ts`:

- `CandidateResearchRequest` is new; existing `RecordProvider` is retained.
- Optional `OfficialAction` metadata: `extraction`, `provenance`, `consent`,
  `attribution`, `dateBasis`, `measureUrl` (bill/resolution page when known),
  and `vote` (raw value, question/basis, voting method, optional `legisNum`).
  GovInfo's document date/title fallbacks are explicitly distinguished from a
  verified action date or motion question and keep the source status partial.
  **Team flag:** `measureUrl` / `vote.legisNum` are additive contract fields.
- Optional counts distinguish present, not voting, abstaining, absent and recused.
  These are **not interchangeable**, and only yes/no votes enter the contested
  vote denominator. A procedural vote is not silently treated as final passage.
- Existing action objects remain type-compatible. New collector output requires
  immutable provenance; these records must **not** be serialized into the masked
  ballot response directly.

## Collect

```ts
import { createRecordsCollector } from "@ftb/records";

const collector = createRecordsCollector({
  cacheDirectory: "/your/pipeline-cache/records",
  // Optional, for historical federal member verification:
  congressApiKey: process.env.CONGRESS_GOV_API_KEY,
});

const result = await collector.collect(request, {
  since: "2025-01-01",
  sources: [
    {
      id: "house-2025-roll-218",
      adapter: "house-clerk",
      config: {
        urls: ["https://clerk.house.gov/evs/2025/roll218.xml"],
        role: "US House of Representatives",
      },
    },
  ],
});
```

A **plan** is a source inventory configured by pipeline, not a list of candidates
or a ballot. It must include relevant prior-office sources and declare its date
range. Source-index discovery supports corpus-wide collection; the explicit URLs
in the examples are only small smoke tests, **not a limit to selected races**.
Several candidates can share one collector/cache.

For the one-argument batch interface, configure `plan` once in
`createRecordsCollector({ cacheDirectory, plan })`, then call
`collector.collect(request)` for each candidate. Identity assertions must be
bound to that candidate; for example, TLO's abbreviated `memberName` mapping
requires a matching `memberCandidateId` and official evidence URL. Reusing a
source plan must never reassign another office-holder's actions.

The result contains:

- `actions`: `OfficialAction[]`, sorted by date/ID, with stable event identities.
- `snapshots`: metadata for this candidate's downloaded artifacts. Original bytes
  are stored by SHA-256 in the cache; `SnapshotClient.read(snapshotId)` retrieves
  the original text. Refreshing a URL does not erase an older snapshot.
- `coverage`: per-source status, reason, action count and exact date window.
  `complete` means the **configured source inventory** was processed, not that
  every prior office/year or ballot level is complete. Unsupported sources and
  identity conflicts are explicit.

## CLI smoke tests

From the repository root:

```sh
pnpm -F @ftb/records collect \
  --request examples/house.request.json \
  --plan examples/house.plan.json \
  --output output/house.json

pnpm -F @ftb/records collect \
  --request examples/senate.request.json \
  --plan examples/senate.plan.json \
  --output output/senate.json
```

Neither example requires an API key. The House example looks up the member's
bioguide ID in the official Clerk XML roster. The Senate example consumes GPO's
**structured MODS vote metadata**, so it does not need Senate.gov access or
Voteview. These are examples of past actions, **not certified ballot rosters**
(e.g. Ted Cruz is not running in November 2026).

`examples/texas.*.json` exercises a TLO FTP bill with an explicitly cited official
name/identity mapping. That mapping is an upstream assertion; the XML parser is
not a substitute for validating the per-session member crosswalk.

Paths passed through `pnpm -F` are relative to `packages/records`.
Exit codes: `0` all configured sources complete; `2` partial/unavailable/review or
unsupported coverage; `1` invalid input or fatal error. Partial runs still write
their results so pipeline can display honest coverage.

## Cache and safety

- Cache reuse is the default. `--offline` forbids network access; `--refresh`
  explicitly checks HTTP updates using ETag/Last-Modified where supported.
- The request-pointer cache is separate from immutable source objects/metadata.
  Raw bytes are hash-checked on replay; URL credentials are not persisted in
  provenance or request filenames.
- HTTP requests are serialized/throttled per host, time out, and retry transient
  errors. HTTP 403 is not retried or bypassed.
- HTML block pages masquerading as XML/JSON fail validation, even on HTTP 200.
  XML must have the expected root, and entity declarations are rejected.
- Party metadata in source files is retained in raw snapshots but **never added
  to stance/action classification input**. Bipartisanship is a separate pipeline
  concern.
- Missing member votes are not inferred from a roster. A committee tally does not
  establish any particular legislator's vote; an undated affiliation does not get
  an invented join date. An agency statistic is not an individual's decision.

No model calls occur here in this pass. Before any document fallback is added,
its official source needs approval and a cheap extraction model must be evaluated
on a reviewed fixture set. Constrained output/temperature zero alone do not make
model output deterministic or truthful.

## Source indexes, not hand-selected races

Set `discovery` on a plan source instead of enumerating `config.urls` manually:

```ts
{
  id: "senate-record-2025",
  adapter: "govinfo-crec",
  discovery: { kind: "govinfo-record", years: [2025] },
  config: { role: "US Senate" },
}
```

Available structured discovery:

| Kind | Config | Inventory |
|---|---|---|
| `govinfo-record` | `years` | Published CREC sitemaps → whole-day MODS XML. Uses package publication dates, **not index modification dates**. |
| `govinfo-billstatus` | `congresses`, optional `billTypes` | Official GPO JSON bulk listing → bill-status XML, all eight bill/resolution types. |
| `tlo-billhistory` | `sessions`, `billTypes` | Anonymous FTP listings → bill-history XML. |

Each supports optional `maxDocuments` for explicit development budgets; hitting
that cap produces **partial** coverage. Production coverage must declare all
relevant years/sessions/types and cannot silently use a development cap.

HTTP inventories are cached for offline replay. TLO FTP **listings** aren't
persisted yet (the XML itself is). For offline TLO runs, first save a plan with
explicit discovered `urls`; offline discovery refuses to open an FTP connection.

Implemented adapters:

- Structured: `house-clerk`, `govinfo-crec`, `govinfo-billstatus`,
  `tlo-billhistory`, `socrata-votes`, `civicclerk`, `legistar`
- Deterministic HTML/PDF (approved §8 sources only): `tx-house-journal`,
  `tx-senate-journal`, `tlo-author-index`, `tlo-bill-analysis`,
  `scotx-orders`, `tames-opinions`, `scjc-sanctions`, `ag-opinions`,
  `governor-orders`, `texas-register`, `official-minutes`, `votetravis-ballot`

`official-minutes` is config-driven (BoardDocs/BoardBook/Diligent/IQM2/MUD/school/…):
rules first, optional `EXTRACT_LLM_*` OpenAI-compatible fallback with exact
span validation. `votetravis-ballot` is reference-only and never overrides
official ballot style.

Local tenant/dataset URLs and role/identity mappings are configuration, not
hardcoded Travis County branches. Journal/judicial/minutes adapters require
`memberCandidateId` + exact source labels; Senate “deemed Yea except” never
invents Yeas for unnamed members.

## Tests

```sh
pnpm typecheck
pnpm test
```

Unit tests are offline fixtures/mocks. Live smoke tests are explicit CLI runs;
they aren't part of CI and do not silently consume keys or scrape blocked sites.
