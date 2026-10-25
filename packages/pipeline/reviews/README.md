# Real-person pipeline review: v1

The automated run is **experimental research only**, not a ballot, published
analysis, ideological comparison, or recommendation. No collected text or model
results were hand-edited. This file is commentary about the run, not evidence.

## Inspect the actual local artifacts

Under `packages/pipeline/dist/politician-reviews/politician-review-2026-10-24-v1/`:

- `REVIEW.md`: automatically rendered excerpts, source links, official acts and gaps.
- `research.json`: all extracted sources, classification attempts (including
  rejected predictions), accepted evidence, proposed debate leads and warnings.
- `acquisition.json`: the collection checkpoint before classification.
- `input.json`: exact resolved input, issue poles, source inventories, budgets,
  configuration versions and implementation hash. Positive/negative coordinates
  refer to those policy poles, **not good/bad judgments**.
- `web-cache/`: original HTTP response bytes (base64), SHA-256 hashes and metadata.
- `records-cache/`: original official-record snapshots.
- `model-cache/`: frozen provider responses and request specifications.

These generated artifacts are git-ignored. They are not deployed or exposed by
the serving API; research-only mode creates no `releases/` directory.

## What actually happened

| Person | Web pages | Official actions | Non-null proposed classifications | Accepted evidence |
|---|---:|---:|---:|---:|
| Greg Casar | 5 | 3 | 3 | 0 |
| Zohaib Qadri | 4 | 0 | 9 | 0 |
| Gina Hinojosa | 4 | 3 | 2 | 0 |

Zero accepted evidence is **not** a finding about these people. The proposed
classifications failed the confidence/own-speech gates. They remain inspectable
without silently weakening thresholds to make the demo look successful.

The exact same command was replayed with `--offline`; the frozen artifact checks
passed unchanged, with no fresh web/model calls. Exit 2 is intentional: this is a
demo with coverage gaps, not a successful production publication.

## Manual inputs (not hidden)

- Three manually selected people, identity aliases and campaign domain mappings.
  This is adapter QA, **not a politically representative bias evaluation**.
- Casar: three consecutive House roll calls, 2025 rolls 218–220.
- Qadri: Austin's configured vote dataset for September–October 2026, with a
  verified District 9 binding and exact full-name aliases.
- Hinojosa: TLO XML for the first three numbered authored bills listed on the
  official 89R author page: HB 1157, HB 1159 and HB 1161. Authorship is not passage.
- Identical web templates, per-channel caps, frozen dates, model-operation budget
  and classification thresholds. The two available evidence sides share the
  model-operation budget; neither may consume all of it.

## Failures the real test exposed

1. **Local-data freshness:** the Qadri request returned zero rows because the
   Austin dataset's newest meeting is **2026-08-27**, before the requested
   2026-09-01 start. A separate frozen diagnostic query established that. This is
   not proof of no council votes. Diagnostic snapshots are under
   `packages/pipeline/.cache/source-diagnostics/`.
2. **Missing measure context:** TLO filing events establish who filed and when,
   but do not contain the introduced bill's policy text. The classifier must not
   invent that content from a bill number or backdate a later enrolled caption.
3. **Acquisition and passage selection:** broad campaign homepages include bios,
   press coverage and other people's statements. Some clear platform passages
   weren't reached within the fixed budget. This needs source/section scheduling
   improvements, not cherry-picking desired conclusions.
4. **Gates need evaluation:** the top five-bin stance confidence is often split
   across adjacent stance labels. We have not established a calibrated acceptance
   rule on reviewed political examples. Do not lower the gate just to obtain
   accepted output; inspect and label the original examples first.
5. **No verified debates:** discovered recordings/articles are leads only;
   participation, full transcripts and speaker spans remain unverified.

Do not modify these v1 artifacts to hide failures. Any corrected collection or
classification run needs a new run/version, preserving v1 for comparison.

## Reproduce

From the repository root, with the same frozen code/configuration:

```sh
pnpm -F @ftb/pipeline start \
  --config examples/politician-samples.json \
  --out dist/politician-reviews --research-only --offline

pnpm -F @ftb/pipeline review-report \
  --input dist/politician-reviews/politician-review-2026-10-24-v1/research.json \
  --output dist/politician-reviews/politician-review-2026-10-24-v1/REVIEW.md
```

Web/provider keys are read from the ignored root `.env`, never included in these
input files or the reviewer report. The current cache request identities require
the same credentials for web replay; model-cache keys do not include API tokens.
