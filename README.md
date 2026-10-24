# 🧚 Fairy Tale Ballot

HackTX '26. See [PLAN.md](./PLAN.md) for the product, invariants and the type contract.

Records integration: [packages/records/README.md](./packages/records/README.md)
documents the shared `CandidateResearchRequest`, additive action-provenance fields,
and source coverage. Pipeline owns ballot discovery; records and scraping receive
the same per-candidate election context.

## Layout

| Path                | Package         | What                                                                          |
| ------------------- | --------------- | ----------------------------------------------------------------------------- |
| `apps/mobile`       | `@ftb/mobile`   | Expo RN app (on-device lookup, matching, masks, reveal)                       |
| `apps/web`          | `@ftb/web`      | Vite + React share-link / How It Works page                                   |
| `apps/api`          | `@ftb/api`      | Hono serving API for frozen releases (no model calls)                         |
| `packages/types`    | `@ftb/types`    | Integration contract (§9) + `@ftb/types/scoring` (pure on-device scoring)     |
| `packages/records`  | `@ftb/records`  | Official-record adapters (`RecordProvider`)                                   |
| `packages/scraping` | `@ftb/scraping` | SerpApi / ballot / questionnaires / money (`SourceFinder`, `FinanceProvider`) |
| `packages/pipeline` | `@ftb/pipeline` | Offline pipeline: classify, generate, validate, publish releases              |
| `config/`           |                 | `issues.yaml`, `authority.yaml`, `sources.yaml`, `prereg.yaml`                |
| `fixtures/`         |                 | Contract-shaped fixture JSON everyone builds against                          |

Packages ship TypeScript source directly (`exports` → `src/*.ts`), so there's no build step between packages.

## Commands

```sh
pnpm install
cp .env.example .env          # fill in keys; never commit

pnpm dev                      # all apps in parallel
pnpm -F @ftb/mobile dev       # one app (Expo)
pnpm -F @ftb/api dev          # API on :8787
pnpm -F @ftb/pipeline start   # run the pipeline

pnpm typecheck                # every workspace
pnpm test                     # vitest (packages + api)
pnpm format
```

Add deps to a single workspace with `pnpm -F <pkg> add <dep>`. In `apps/mobile`, use `npx expo install <dep>` so versions match the SDK.
