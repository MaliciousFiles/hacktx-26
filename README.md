# 🧚 Fairy Tale Ballot

HackTX '26. See [PLAN.md](./PLAN.md) for the product, invariants and the type contract.

App design docs:

- [docs/UX.md](./docs/UX.md): user flow, every screen, copy and accessibility
- [docs/VISUAL_DESIGN.md](./docs/VISUAL_DESIGN.md): color, type, masks, components, motion, share card
- [docs/APP_BUILD.md](./docs/APP_BUILD.md): mobile architecture, API, website, privacy enforcement, tests, build order, contract gaps

Records integration: [packages/records/README.md](./packages/records/README.md)
documents the shared `CandidateResearchRequest`, additive action-provenance fields,
and source coverage. Pipeline owns ballot discovery; records and scraping receive
the same per-candidate election context.

Contemporary web collection: [packages/scraping/README.md](./packages/scraping/README.md)
covers campaign platforms, dedicated debate/forum discovery, news, social accounts,
exact-span quote leads, and frozen offline replay.

Database storage: [packages/pipeline/DATABASE.md](packages/pipeline/DATABASE.md)
covers private PostgreSQL research archives, approved frozen releases, local setup,
and read-only API credentials.

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

Pipeline batch inputs and Ollama configuration: [packages/pipeline/README.md](packages/pipeline/README.md).

Packages ship TypeScript source directly (`exports` → `src/*.ts`), so there's no build step between packages.

## Commands

```sh
pnpm install
cp .env.example .env          # fill in keys; never commit

pnpm mobile                   # Expo Go QR code for your phone (see apps/mobile/README.md)
pnpm mobile:tunnel            # same, when the phone can't reach the laptop over Wi-Fi
pnpm dev                      # all apps in parallel (no QR code; use `pnpm mobile` for the phone)
pnpm -F @ftb/api dev          # API on :8787
pnpm -F @ftb/pipeline start   # validate/publish the fixture
pnpm -F @ftb/pipeline test:live # synthetic Jev + Ollama smoke test

pnpm typecheck                # every workspace
pnpm test                     # vitest (packages + api + mobile)
pnpm format
```

Add deps to a single workspace with `pnpm -F <pkg> add <dep>`. In `apps/mobile`, use `npx expo install <dep>` so versions match the SDK.

Pipeline now requires an explicit verified ballot run config (or explicit
`--fixture` demo mode). See [packages/pipeline/README.md](packages/pipeline/README.md)
for the connected batch stages, Jev/Ollama setup, offline replay and remaining gaps.
