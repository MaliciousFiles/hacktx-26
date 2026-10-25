# Offline pipeline

Jev is the primary classifier. Ollama replaces Gemini for highlights, plan slots,
and classification fallback. Model calls run only here; serving apps consume releases.

Copy the root `.env.example` to `.env` and fill `OLLAMA_API_KEY` and `JEV_API_KEY`.
The supplied credentials are already configured locally. Never commit `.env`.
`OLLAMA_MODEL` selects the inference model; `OLLAMA_MODEL_VERSION` records its
revision in cache keys and release metadata. Pin a revision from `/api/tags` and
update it when changing weights. `JEV_MODEL_VERSION` must be an explicit version.

```sh
pnpm -F @ftb/pipeline test:live
pnpm -F @ftb/pipeline start
pnpm -F @ftb/pipeline start --input /absolute/path/to/batch.json
```

`test:live` uses synthetic text and makes authenticated calls. It does not publish
election evidence. `start` without arguments validates and publishes the existing
fixture. `--input` runs snapshot → normalize → classify → aggregate → generate →
validate → publish over prepared election data. Paths are relative to the pipeline
workspace when invoked with `pnpm -F`; use an absolute input path.

The JSON input has the following fields (see `BatchInput` in `src/batch.ts`):

| Field       | Contents                                                                                                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payload`   | Same structure as `fixtures/release-fixture.json`: release, official ballot/style, every contest, candidate metadata, reviewed cards and source citations. Candidate analysis fields are rebuilt.                                |
| `sources`   | `Source[]` from scraping, with immutable original text and verified candidate attribution. Multi-speaker sources are withheld by this runner.                                                                                    |
| `actions`   | `OfficialAction[]` from records. Non-scoring actions are withheld by the existing records policy.                                                                                                                                |
| `issues`    | Reviewed `Issue[]` with negative and positive poles; the same axes are attempted for each candidate.                                                                                                                             |
| `normalize` | `{ "mode": "names_only", "projectionVersion": "proj-v1", "candidateNames": [...] }`; supply `partyLabels` for `names_and_party`. Include every candidate name and alias. Use the masking mode approved by golden-set evaluation. |
| `blocklist` | Identity-leak terms: `candidateNames`, `partyLabels`, and optional aliases, donor names, photo URLs and source URLs.                                                                                                             |
| `gitSha`    | Source revision recorded by the snapshot stage.                                                                                                                                                                                  |

The runner requires discovered, election-specific ballot and source data; it does
not discover a real ballot from API keys. It preserves every contest and candidate.
Judicial, uncontested, failed and thin-evidence contests receive objective information
only. Full comparison requires at least three common issues with sufficient evidence
for every candidate. Money discovery, judicial philosophy extraction, context facts,
and human-reviewed claims must still come from their respective upstream workflows;
the runner does not invent these fields.

Raw source snapshots and coverage reports are in `packages/pipeline/dist/snapshots/`.
Published artifacts are in `packages/pipeline/dist/releases/`. Keep raw snapshots
private. Low-confidence Jev results and all uncalibrated Ollama fallback results go
to `dist/logs/review-queue.jsonl` and are withheld from publication.

Ollama Cloud does not enforce structured outputs. The client requests JSON in the
prompt, parses it, and validates distributions and evidence references before caching.
Local Ollama additionally uses `format: "json"`; set `OLLAMA_BASE_URL` to
`http://localhost:11434`, select an installed model and pin its revision. No API key
is needed locally. Provider error bodies and credentials are never logged or cached.

Citation resolution and exact quote checks do not establish semantic entailment.
Golden-set evaluation, content review, and independent-event verification are still
required before treating generated election analysis as ready for voters. Authority
defaults to unknown/none until the reviewed office-authority workflow supplies it;
the classifier does not invent legal powers or publish adverse credibility flags.
