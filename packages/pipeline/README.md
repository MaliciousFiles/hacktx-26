# Offline ballot batch pipeline

## Commands

```sh
# One official/manual ballot-style roster, every included contest and candidate:
pnpm -F @ftb/pipeline start --config path/to/verified-ballot-run.json --out dist

# Rebuild from existing web/records/model snapshots; no model cache-miss calls:
pnpm -F @ftb/pipeline start --config path/to/verified-ballot-run.json --out dist --offline

# Explicit synthetic, offline acquisition/fallback/publication demonstration:
pnpm -F @ftb/pipeline start --config examples/ballot-run.demo.json --offline

# Explicit old presentation fixture; never used as a default live input:
pnpm -F @ftb/pipeline start --fixture

# Small live API protocol smoke test, synthetic text only; frozen on first success:
pnpm -F @ftb/pipeline check-ai
pnpm -F @ftb/pipeline check-ai --offline
```

Paths passed through `pnpm -F` are relative to `packages/pipeline`.
The default command now requires explicit input. It no longer silently loads a
fixture and calls that a complete live run.

## Connected stages

`run.ts` derives **all candidate jobs from the supplied ballot**, calls records
and contemporary voice collection, collects reviewed social accounts, prepares
versioned classification projections, classifies exact bounded passages,
validates quotes/ownership, aggregates sufficient evidence, masks presentation
data, validates publication and writes an immutable release plus reveal mapping.

Outputs in `<out>/<releaseId>/`:

- `research.json`: **private** raw sources/actions, proposed quotes/debate leads,
  model evidence, review queue and per-source acquisition details.
- `coverage.json`: every candidate and contest, acquisition gaps, model budgets,
  evidence accepted and Objective Info Mode/full-analysis status.
- `releases/<releaseId>.json`: masked publication artifact.
- `reveal.json`: identities and source links, bound to that release/hash.
- `web-cache/`, `records-cache/`, `model-cache/`: frozen inputs/results.

The run binds a release ID to the complete config, policies, git SHA and source-code
hash (including dirty working-tree code). Changed inputs/data need a **new release
ID**. Published release files and final research/coverage/reveal artifacts cannot
be overwritten with different bytes. Model-cache misses fail offline.

The example is synthetic. Do not relabel it as real ballot data. A production
input supplies the official election-specific `ballotStyleId`, its complete
contest/candidate roster, provenance URL and reviewer/date. These are **upstream
reviewed assertions**, not automated proof from a domain name. A precinct alone
is not a ballot style. No address or coordinates are uploaded.

This runner currently **consumes** the reviewed roster; it does not discover an
arbitrary official ballot style from an address or automatically parse/certify
the entire Travis County consolidated PDF. Separate official styles need separate
complete roster inputs; do not claim that a run over one style covers all styles.

## AI providers and approval

Credentials live only in the root git-ignored `.env`:

```dotenv
JEV_API_KEY=
JEV_MODEL_VERSION=jev-1.14.0
OLLAMA_API_KEY=
OLLAMA_MODEL=gpt-oss:20b
OLLAMA_MODEL_DIGEST=
```

**Jev primary:** actual TypeSafe `POST https://api.typesafe.ai/v1/systemone`, named
Choice/Score/Noul questions. Explicit versions only, and the resolved response
model must match. Full stance/relevance/claim-type distributions are retained.

**Ollama fallback:** `https://ollama.com/api/chat`, non-streaming JSON, bearer auth.
The configured model digest is checked against `/api/tags` before a cache-miss
inference. Temperature zero isn't the determinism guarantee; saved results are.
Malformed JSON/distributions fail closed. Ollama's self-reported confidence is
**not** Jev calibration: fallback results go to review unless a separately
evaluated fallback is explicitly approved. Gemini remains optional compatibility
support; no Gemini key is necessary for the Jev/Ollama path.

Both providers passed explicit live protocol smoke tests on synthetic housing
text, including replay from cache. That proves authentication/protocol integration,
**not** political accuracy, calibration or publication readiness.

To enable classification in a run, add an `analysis` configuration:

```json
{
  "analysis": {
    "mode": "names_and_party",
    "projectionVersion": "YOUR-EVALUATED-PROJECTION-VERSION",
    "approvedBy": "YOUR-REVIEWER",
    "evaluationHash": "SHA256-OF-YOUR-ACTUAL-EVALUATION-REPORT",
    "rubricVersion": "YOUR-FROZEN-RUBRIC-VERSION",
    "maxCallsPerCandidate": 12,
    "lowConfidenceThreshold": 0.8,
    "fallbackEvaluated": false
  }
}
```

This is a shape illustration, **not usable approval or a completed evaluation**.
The CLI fills pinned provider model names/digest from `.env`; the resolved values
are frozen into the run configuration hash. Credentials never enter that config.
Never invent an approval/report hash to turn this on. Without evaluated projection
configuration, acquisition still runs and publication abstains from policy scores.

Debates/news/questionnaires require approved speaker spans, never just a model's
`isOwnSpeech`. Bind each entry in `attributions` to `sourceId`, `contentHash`,
`candidateId`, exact UTF-16 `start/end`, a reviewed independent `eventId` and
`approvedBy`. Inspect `research.json` after a research-only run, then publish a
**new** release with the approved ledger. Search snippets never become verified
speech. Official-action interpretation also needs reviewed issue linkage and
attribution; omnibus bills aren't automatically classified on every issue.

## The core loop: says → does → compare

- **Says:** the candidate's verified campaign site, verified social posts, and
  reviewed single-candidate questionnaires (`web.verifiedDocuments` with
  `candidateId`) are their own words. Debates, forums, multi-candidate guides and
  news need approved speaker spans (`attributions`). Search snippets never count.
- **Does:** records actions are already actor-verified by their adapters. Each
  scorable action (authored bill or recorded yes/no vote) is classified for what
  the **measure** would do if enacted, then mirrored for a "no" vote. Procedural
  votes (cloture, tabling, recommittal, the rule…), consent/voice votes and
  unreviewed omnibus measures (relevant to >2 issues) are never scored.
  Unanimous/untallied votes weigh about zero and don't count as events.
- **Platform:** one neutral sentence per compared issue built from reviewed pole
  labels and cited to the candidate's own statements — no generated prose.
- **Says vs. Does:** emitted only with ≥2 independent events on **both** sides,
  using the same action weighting; the app can show each side's dates from the
  cited evidence.
- **Ballot building:** the release includes the Explore deck (child-issue pole
  cards, one anchor per topic, poles in no fixed order, tradeoffs whose issues
  exist, judicial deck when a judicial race is contested).

## Gates and remaining gaps — not a finished product

- Full comparisons require three common sufficiently supported issues across
  opponents; low confidence, thin evidence, uncontested and judicial races fall
  back to Objective Info Mode. Judges never enter policy classification.
- Exact duplicated passages don't add confidence; campaign pages from one site
  are grouped conservatively. Distinct reviewed events are explicit, not inferred
  from mention count. More sophisticated event/syndication dedup remains work.
- Finance collection, generated platform highlights/plans, reviewed Explore cards,
  Context Brief synthesis and proposition explanations are **not connected** in
  this runner. They are reported as gaps, not invented. `cardsAvailable: false`
  means this is not a complete app-ready walkthrough release.
- Debate recordings are prioritized discovery leads; automatic captions/audio
  transcription and unreviewed speaker attribution are not implemented.
- Campaign/account identity discovery still requires reviewed mappings.
- The serving API still needs release/reveal endpoint integration; publication
  here writes local artifacts, not a deployment.

Exit `2` means synthetic mode or coverage gaps, even when an objective-only release
was written successfully. Exit `0` is never a promise of complete internet coverage.
Inspect `coverage.json`, not just the process exit status.
# Ballot-wide collection status

See [CORPUS.md](CORPUS.md) for the live Travis County lookup, parallel acquisition,
and the unresolved official-ballot/full-history coverage requirements.

## Prepared batch mode (`--input`)

`runBatch` (`src/batch.ts`) is the simpler path for data that was already collected
elsewhere: snapshot → normalize → classify (Jev, Ollama fallback) → aggregate →
generate highlights/plans (Ollama) → validate → publish. It does not collect anything.

```sh
pnpm -F @ftb/pipeline test:live                        # synthetic text, authenticated calls
pnpm -F @ftb/pipeline start --input /absolute/path/to/batch.json
```

`.env`: `OLLAMA_MODEL`, `OLLAMA_MODEL_VERSION` (pinned revision from `/api/tags`),
`OLLAMA_BASE_URL`, `JEV_API_KEY`, `JEV_MODEL_VERSION`. `BatchInput` fields: `payload`
(shape of `fixtures/release-fixture.json`), `sources`, `actions`, `issues`,
`normalize` (include every candidate name/alias), `blocklist`, `gitSha`. Judicial,
uncontested, failed and thin-evidence contests get objective information only; full
comparison needs at least three common sufficiently-evidenced issues per candidate.
Raw snapshots/coverage: `dist/snapshots/` (keep private).

For a full ballot with acquisition (records + voice + social), use `--config`
(see Commands above).
