# Agent notes

- pnpm workspace monorepo; layout and commands are in `README.md`. Product rules and invariants are in `PLAN.md` (§3 is non-negotiable).
- `packages/types/src/index.ts` is the integration contract. Don't change it casually: changes need sign-off from every owner. Flag any edit to it.
- Keep the package count low. Put new code in an existing package before creating a new one.
- `@ftb/types/scoring` must stay pure (no I/O, no randomness, no model calls) because it runs on-device and in the pipeline.
- No model calls in `apps/api` or `apps/mobile`. Model output only comes from frozen pipeline releases.
- Before finishing: `pnpm typecheck && pnpm test`.
- `apps/mobile` has its own `AGENTS.md` with Expo-specific rules.
