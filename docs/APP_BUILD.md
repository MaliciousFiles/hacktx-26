# 🧚 Fairy Tale Ballot — App Build Guide

> How to build `apps/mobile`, `apps/api` and `apps/web` so they deliver [`UX.md`](./UX.md) and follow [`PLAN.md`](../PLAN.md) §3.
> The pipeline side is in [`PIPELINE_INTEGRATION.md`](../PIPELINE_INTEGRATION.md). The contract is [`packages/types/src/index.ts`](../packages/types/src/index.ts).
> **Status:** proposed. §9 lists contract changes that need sign-off from every owner before anyone builds against them.

---

## 0. Where things stand (Oct 24)

| Piece | State |
|---|---|
| `@ftb/types` contract + `@ftb/types/scoring` | Implemented and tested |
| `@ftb/pipeline` | Stages, validators and `publishRelease` implemented. It writes one `/ballot`-shaped JSON per release |
| `fixtures/release-fixture.json` | 1 ballot, 3 contests (legislative, measure, judicial), 5 cards |
| `apps/api` | Only `/health` exists |
| `apps/mobile` | On `main`: the default Expo template. On **`mobile-dev-build`**: a working Expo Router demo (home/onboarding, explore deck, ballot, contest, per-contest reveal) on a hand-written fixture (`src/fixtures/travisDemo.ts`), with the theme and UI kit this design builds on |
| `apps/web` | Default Vite template |

The critical path for the demo is **mobile + API**, built against the fixture from hour 0 (PLAN §10). **Build on `mobile-dev-build`** rather than starting over: merge it into `main` first, then apply this guide as changes to it.

**Changes this design asks of `mobile-dev-build`:**
1. Remove the per-contest "Lift the mask" footer and `session.revealContest`; add the single end-of-ballot Unmasking flow (`unmask/*`).
2. Add the ☰ menu on My Ballot (Daily, Notes, How it works, Report, Settings).
3. Persist the session (today it is in-memory `useState`).
4. Add the missing screens: priorities summary, candidate detail, Compare, pick sheet, citation sheet, Guess the party, Surprised?, share image, notes, Daily.

---

## 1. Mobile app (`apps/mobile`)

Read `apps/mobile/AGENTS.md` first: it requires Expo SDK 58 docs (not memory), `npx expo install` for every dependency, and Expo Router with routes in `src/app/`.

### 1.1 Dependencies to add

Install every one with `npx expo install` and check it against the SDK 58 docs.

| Need | Package | Notes |
|---|---|---|
| Routing | `expo-router` | Already set up on `mobile-dev-build` |
| Gestures / animation *(optional)* | `react-native-gesture-handler`, `react-native-reanimated` | Only if swipe gestures ship; buttons are the primary input |
| Secure small values | `expo-secure-store` | Mask map + session key |
| Files | `expo-file-system` | Cached releases, encrypted session blob |
| Randomness | `expo-crypto` | Only if `globalThis.crypto.getRandomValues` (used by the built `random.ts`) is missing on a target |
| Location *(if offline lookup ships)* | `expo-location` | Foreground only. Coordinates never leave `src/lib/lookup` |
| Share | `react-native-view-shot`, `expo-sharing`, `expo-media-library` (save image) | |
| In-app browser | `expo-web-browser` | Opens How it works and the full source links after the reveal |
| Analytics *(opt-in)* | `posthog-react-native` | Only behind the toggle; see §7 |

Not needed: a state library. React context + `useReducer` covers the app's single session object. Add `zustand` only if re-render cost becomes a problem.

### 1.2 Directory layout

This extends what's on `mobile-dev-build`. Files marked *(built)* exist there.

```
apps/mobile/
├─ app.json · eas.json        (built)
├─ assets/
│  ├─ masks/                  optional mask illustrations (bundled; never fetched)
│  └─ lookup/                 offline ballot-style list (+ polygons if lookup ships)
└─ src/
   ├─ app/                    ROUTES ONLY (Expo Router)
   ├─ components/             ui.tsx, CandidateCard.tsx (built) + VISUAL_DESIGN.md §6 additions
   ├─ theme.ts                (built) colors + serif
   ├─ labels.ts · format.ts   (built) UI strings and formatters → grow into the copy table
   ├─ session.tsx             (built) SessionProvider → add persistence + phases
   ├─ random.ts               (built) crypto-random shuffle / ids (masks, order, flips)
   ├─ matching.ts             (built) UI helpers over @ftb/types/scoring
   ├─ fixtures/travisDemo.ts  (built) hand-written demo data
   ├─ data/                   apiClient.ts, releaseCache.ts (new)
   └─ lib/                    PURE TS, no React Native imports (vitest), new:
      ├─ deck.ts              deck order, display→data pole mapping
      ├─ contestView.ts       screen view models from release + session
      ├─ unanswered.ts        "questions nobody answered"
      ├─ surprise.ts          Unmasking stats
      └─ lookup.ts            offline point-in-polygon (only if shipped)
```

Move `random.ts` and `matching.ts` under `lib/` when they need tests. They're already free of React Native imports.

### 1.3 Route tree (`src/app/`)

It's a single stack with no tab bar (UX.md §2.2). Expo Router can't have both `contest/[id].tsx` and a `contest/[id]/` folder without converting the file to `contest/[id]/index.tsx`, so sibling routes use their own folders.

```
_layout.tsx               (built) Root Stack, SessionProvider, safe area, bg color
index.tsx                 (built) O1 Welcome + Godmother panel + ballot style → redirects by phase
onboarding/intro.tsx      O2
onboarding/privacy.tsx    O3
onboarding/find.tsx       O4 (only if location lookup ships)
onboarding/style.tsx      O5 manual ballot-style list
onboarding/confirm.tsx    O6
explore.tsx               (built) E1–E4 deck, judicial cards inline
priorities.tsx            E5 What matters to you
ballot.tsx                (built) B1 My Ballot + ☰ menu + "Ready for the Unmasking?"
contest/[id].tsx          (built) B2 / B5 / B8 by officeKind; footer becomes "Make your pick"
candidate/[id].tsx        B3 full candidate card
compare/[id].tsx          B4 (id = contestId)
pick/[id].tsx             B6 form sheet
citation/[id].tsx         CitationSheet form sheet
menu.tsx                  ☰ form sheet: Daily · Notes · How it works · Report · Settings
unmask/index.tsx          U1 Ready?
unmask/guess.tsx          U2 Guess the party
unmask/reveal.tsx         U3 ceremony (replaces the built reveal/[id].tsx)
unmask/surprised.tsx      U4
unmask/share.tsx          A1
notes.tsx                 A2 My ballot notes
daily.tsx                 Daily Challenge
report.tsx                Report an error
settings.tsx              analytics, motion, start over, delete everything
about.tsx                 nonpartisan statement + release info
```

`index.tsx` redirects by phase: `explore` goes to `/explore`, `walkthrough` and `revealed` go to `/ballot`.

### 1.4 Session state

There is one local session object per ballot. It never leaves the phone, and no part of it is ever sent to the network (Inv. 5).

```ts
// src/state/session.ts (app-local types; NOT added to @ftb/types)
type Phase = "onboarding" | "explore" | "walkthrough" | "revealed";

interface LocalSession {
  version: 1;
  phase: Phase;
  onboardingStep?: "welcome" | "intro" | "privacy" | "find" | "choose" | "confirm";
  releaseId: string;              // pinned for the whole walkthrough (Inv. 4)
  ballotStyleId: string;
  order: Record<ID, ID[]>;        // (built) crypto-shuffled candidate order per contest, persisted
  flips: Record<ID, boolean>;     // (built) which pole shows first per card, persisted
  swipes: Swipe[];                // @ftb/types Swipe; last write per cardId wins
  salience: Record<IssueId, number>;  // from ⭐ (e.g. 2 when starred, else 1); never changes sign
  picks: Record<ID, ContestPick>;
  visited: Record<ID, true>;
  guesses?: Record<ID, string | "unknown">;   // U2, candidateId → guessed party
  revealed?: Record<ID, CandidateIdentity[]>; // filled by /reveal, per contest
  analyticsOptIn: boolean;
}

type ContestPick =
  | { kind: "candidate"; candidateId: ID }
  | { kind: "measure"; choice: "yes" | "no" }
  | { kind: "write_in" }
  | { kind: "undecided" }
  | { kind: "skip" };
```

- **Masks are separate** from the session (`session.masks` on `mobile-dev-build` today). They live in a `MaskSession` (`@ftb/types`) stored in `expo-secure-store` as `candidateId → cast index`, which stays small enough for SecureStore. The `MaskSession` is deleted the moment `/reveal` succeeds and when it expires after 24h.
- **Persistence:**
  - The session is serialized to JSON in `expo-file-system`'s document directory.
  - If SDK 58 `expo-crypto` offers AES-GCM, encrypt that file with a random key kept in SecureStore. If it doesn't, rely on the OS app sandbox and note that on the privacy screen. **[verify in SDK 58 docs]**
- **Derived values are never stored.** The user vector, matches and comparisons are recomputed from `swipes + release` with `@ftb/types/scoring` (all memoized):
  - `computeUserVector(swipes, cards, salience)`
  - `computeContestMatch(userVector, contest, candidates)` for non-judicial races
  - `computeJudicialComparison(userVector, contestId, candidates)` for judicial races
  - `computeMeasureConnections(...)` for measures (max 2)
- **"Delete everything"** removes the session file, the SecureStore keys, cached releases and the analytics identifier.

### 1.5 Data layer

```
apiClient.ts      fetch wrapper with an ALLOWLIST of paths + query keys (see §7)
releaseCache.ts   releases/<releaseId>/<ballotStyleId>.json, immutable once written
fixtureSource.ts  reads fixtures/release-fixture.json; sets demo=true
```

- **Source switch:** when `EXPO_PUBLIC_API_URL` is unset, the app reads the fixture and shows the built `SampleMark` ("Sample release · not a live ballot") on every screen (PLAN §10). Demo data must never mix with real data.
- **Release pinning:**
  1. On confirm (O6), fetch `GET /ballot?ballotStyleId&releaseId` and write it to the cache.
  2. From then on, every screen reads only from the cache.
  3. Checking for a newer release (A3) is a separate, explicit action (§9 gap 1).
- **Reveal:**
  1. Call `GET /reveal/:contestId?releaseId` once per contest, sequentially, with a retry for each.
  2. Validate that `res.releaseId === session.releaseId` and that the identity IDs equal `contest.candidateIds` exactly (no missing, extra or duplicate IDs). On a mismatch, abort and keep the masks.
  3. Delete the `MaskSession` **only after every contest succeeds**.

### 1.6 Pure logic (`src/lib/`)

| Module | Contract |
|---|---|
| `random.ts` *(built)* | Crypto-random `shuffle`, `randomBit` and `randomId`. Candidate order and pole-side flips are drawn once per session and **persisted**. That gives each device a stable random order without a separate seeded PRNG. Inject the random source so tests can stub it. |
| `deck.ts` | `orderDeck(cards)`: anchors first, then the rest; the judicial deck stays separate. The built `session.flips[cardId]` decides which pole shows first. `toSwipe(card, displaySlot)` maps a tap or swipe on the top or bottom option back to `"a"`/`"b"` in the data. **This mapping gets its own tests** (Suite D side-swap). |
| masks (in `session.tsx` today) | Shuffle the cast with crypto randomness for each contest, with no repeats within a contest. Never use a candidate ID as an input to the choice, so masks stay independent of candidates (Inv. 8). |
| order (in `session.tsx` today) | `session.order[contestId]` is a crypto shuffle. It must never take anything that depends on alignment or tier (Inv. 15, 22). |
| `contestView.ts` | `(release, session) → ContestViewModel` with fully resolved sections, empty-state reasons and citation lookups. Screens only render view models. That's what makes the leak test in §8 possible. |
| `unanswered.ts` | Lists ballot-relevant issues where every candidate's `issueEvidenceState` is `none`, plus slots that are `not_stated` for all candidates. |
| `surprise.ts` | U4 stats from `picks`, `guesses` and `revealed`. It returns only the stats whose inputs exist; with too few partisan picks it returns none rather than a misleading %. |

**UI rule over scoring output:** treat a `MatchResult` with `matchClarity === 0` as **🪞 Clouded** whatever its `bucket` says. Today `proximityToBucket` never emits `"clouded"`, so the UI has to apply this rule. Pipeline/scoring owners should decide whether near-threshold uncertainty also maps to Clouded in `@ftb/types/scoring` (PLAN §6.5).

### 1.7 Offline ballot lookup

PLAN §12 #12 is still open. Build the **manual selector first** (it's required regardless), then build the offline lookup only if time allows:

1. The pipeline or scraping step exports `assets/lookup/travis-2026.json`: simplified precinct polygons mapped to ballot-style IDs, plus an `ambiguous` flag near boundaries.
2. `lib/lookup.ts` does point-in-polygon on the device. An ambiguous or unmatched point returns `needs_manual_ballot_style`.
3. Typed addresses need on-device geocoding. If there's no reliable offline geocoder, drop the "Type an address" option. **Never send an address to a remote geocoder** (Inv. 5).

The ballot-style list for O5 ships in the same bundled asset, so manual selection needs no API call.

---

## 2. Screen → data map

| Screen | Reads | Computes |
|---|---|---|
| O6 Confirm | `ballot.contestIds`, `contests[].officeKind`, `release` | Counts by section |
| E2/E3/E4 | `cards` | `orderDeck`, `sideFor` |
| E5 | `swipes`, `cards`, issue labels (§9 gap 3) | `computeUserVector` |
| B1 | `ballot.contestIds` order, `contests`, `candidates[].coverage` | Coverage chip, status |
| B2 | `contest.officeDescription`, `contest.context`, `candidates` | `candidateOrder`, `unanswered`, `computeContestMatch` (collapsed) |
| B3 | One `CandidateProfile`, `citations` | Agreements/disagreements from `MatchResult` |
| B4 | All profiles in the contest, `userVector` | Pole-line positions from `stances[issueId].position` |
| B5 | `contest.measure`, `contest.context` | `computeMeasureConnections` |
| B8 | `judicialProfile` per candidate | `computeJudicialComparison` |
| U3/U4 | `/reveal` identities, `picks`, `guesses` | `surprise.ts` |

---

## 3. API (`apps/api`)

A thin Hono app serving frozen releases. **No model calls, ever** (AGENTS.md, Inv. 4).

### 3.1 Routes (current contract)

| Route | Behavior |
|---|---|
| `GET /health` | Exists |
| `GET /ballot?ballotStyleId&releaseId` | Loads `<RELEASES_DIR>/<releaseId>/ballots/<ballotStyleId>.json`. 400 if either param is missing; 404 if the release or style is unknown. The response is exactly `Api["GET /ballot"]["res"]`. Sends `Cache-Control: public, max-age=31536000, immutable`, which is safe because releases never change |
| `GET /reveal/:contestId?releaseId` | Loads `<RELEASES_DIR>/<releaseId>/identities.json` and returns the identities for that contest. 404 for an unknown release or contest |
| `GET /daily?date` | From `<RELEASES_DIR>/<releaseId>/daily/<date>.json` of the current release. 404 if there's none |
| `GET /research?releaseId` | `research.json` or `[]` |

### 3.2 Release storage layout (proposal)

Today `publishRelease` writes one file per release in the `/ballot` response shape. The API needs:

```
releases/
└─ data-v3/
   ├─ manifest.json          Release + list of ballot styles
   ├─ ballots/<style>.json   exact /ballot response per ballot style
   ├─ identities.json        Record<contestId, CandidateIdentity[]>  (REVEAL-ONLY)
   ├─ daily/<date>.json
   └─ research.json
```

Keeping `identities.json` in **its own file** means no `/ballot` code path can ever read it. This needs a pipeline change in `publish.ts`, owned by Person 2, but **no contract change**. Until it lands, the API serves `fixtures/release-fixture.json` as the only ballot, plus a hand-written `fixtures/identities-fixture.json` with obviously synthetic names.

### 3.3 Server rules

- **Logging:** method, path, status and latency only. **Don't log `ballotStyleId`**, since it's coarse location. Never log IP + style together.
- **CORS:** allow the web origin for `/research` and `/releases/current`.
- **Serialization:** responses come straight from the pre-validated files. The API never adds, merges or computes fields, so the leak gate the pipeline ran still holds (PLAN §7 validator 4).
- **Rate limit** per IP on `/reveal`. It only deters bulk scraping and isn't a security boundary (Inv. 7).
- **Config:** `RELEASES_DIR` (default `../../fixtures` in dev), `CURRENT_RELEASE_ID`, `PORT`.
- **Deploy:** a Node process on a Vultr instance behind Caddy for TLS (PLAN §13). Static release files can also sit on the same box.

---

## 4. Local share rendering

`unmask/share.tsx` renders the share card component (VISUAL_DESIGN §8) off-screen at 1080×1350, captures it with `react-native-view-shot`, then calls `expo-sharing`. The component's props are a fixed allowlist, `{ statKey, statValue, decorativeMaskIds }`, so picks or names can't reach it by accident. A unit test asserts the prop type has no other keys.

---

## 5. Daily Challenge (stretch)

- `GET /daily?date` returns a `DailyChallenge`, with its `payload` shaped per game once PLAN §12 #6 is decided.
- The game state lives on the device. The result grid is plain text through the share sheet.
- It uses its own `MaskSession` (`scope: "game"`), never the ballot session.
- The pipeline must build daily payloads from contests **outside the Travis ballot** (PLAN §12 #7). The API cannot check this; it is a pipeline publish gate.

---

## 6. Website (`apps/web`)

A small Vite + React reading site on the `.tech` domain. Add `react-router` (one dependency) for 5 routes:

| Route | Content |
|---|---|
| `/` | Pitch ("Pick the plan before the party"), 30s demo video, app download / Expo QR, privacy promise, nonpartisan statement |
| `/how-it-works` | Sources and the outlet allowlist (generated from `config/sources.yaml` at build time), methods (PLAN §6 in plain language), the office-authority matrix (`config/authority.yaml`), fact-check rating mapping, invariants, test-suite results, research findings from `GET /research` (shown only if gates pass), and the current release ID, date and `manifestHash` |
| `/s` | **Share-link landing.** It carries no user data, path params or tracking IDs: the share card already holds everything the user chose to share. It explains the app and links to `/`. A static Open Graph image gives the link preview |
| `/corrections` | How to report an error, the review process (PLAN §10), and the change log with links to release diffs |
| `/releases/:id` | Release notes and diff: which buckets and flags changed and why (PLAN §7 harness 7) |

- **Build-time content:** a small Vite plugin or a `prebuild` script reads `config/*.yaml` and writes JSON into `src/generated/`. This makes the published allowlist and authority matrix the same files the pipeline uses.
- The mobile "How it works" opens `/how-it-works` in `expo-web-browser`, so there's one source of truth.
- **Delete** the Vite template assets (`hero.png`, `react.svg`, `vite.svg`, `App.css` counter styles) and rewrite `README.md`.

---

## 7. Privacy enforcement and analytics

**Network allowlist** (`apiClient.ts`): every outgoing request goes through one function that only permits these exact query shapes and throws on anything else:

| Path | Allowed query keys |
|---|---|
| `/ballot` | `ballotStyleId`, `releaseId` |
| `/reveal/:contestId` | `releaseId` |
| `/daily` | `date` |
| `/research` | `releaseId` |
| `/releases/current` *(proposed)* | none |
| `POST /reports` *(proposed)* | body keys: `releaseId`, `contestId`, `refId`, `message`, `evidenceUrl?`, `contact?` |

Request bodies and URLs never include swipes, picks, guesses, salience, coordinates or addresses (Inv. 5).

**Analytics (opt-in, off by default)**
- Events are funnel steps only: `onboarding_completed`, `explore_anchors_completed`, `walkthrough_started`, `contest_viewed` (no contest ID, just a counter), `unmask_completed`, `share_opened`, `report_submitted`.
- Events carry no properties beyond `app_version`, `release_id` and `demo`.
- The PostHog client is created only after opt-in and is destroyed on opt-out or "Delete everything".
- Disable autocapture, session replay and screen-name capture: screen names would include contest IDs.

---

## 8. Testing

Add `apps/mobile/src/lib/**/*.test.ts` and `apps/web/src/**/*.test.ts` to `vitest.config.ts` `include`. `src/lib` is pure TS, so the root Vitest runs it. Before finishing any change, run `pnpm typecheck && pnpm test` (AGENTS.md).

| Test | Suite (PLAN §8) | Assertion |
|---|---|---|
| Side-swap mapping | D | For every card and flip value, a tap on either displayed slot records the same `"a"`/`"b"` as the data pole shown there |
| Deck order | H | `orderDeck(cards)` is stable; anchors first |
| Mask independence | D, G | Over many crypto-stubbed deals, the mask distribution is uniform and independent of `candidateId`; no repeats within a contest |
| Candidate order | D | Order comes only from the persisted crypto shuffle; changing stances or tiers never changes it |
| Pre-reveal leak test | G | Build every `ContestViewModel` for the fixture, collect every string, and assert no identity name, alias, party label or URL from `identities-fixture.json` appears |
| Network allowlist | G | `apiClient` throws on any extra query key or body key; the session reducer has no import path to `apiClient` |
| Copy lint | — | No banned word (UX.md §5) in `copy.ts`; every evidence-facing string uses the neutral templates |
| Clouded rule | E | `matchClarity === 0` renders as Clouded |
| Objective Info Mode | — | A contest with every candidate `objective_only` produces a view model with no alignment section |
| Surprise stats | F | No % stat with fewer than 2 partisan picks; guesses are optional |
| Share props | G | The share card prop type is exactly the allowlist |
| API | G, H | `/ballot` output deep-equals the stored file; `/ballot` never contains any string from `identities.json`; unknown or mismatched release → 404; `/reveal` returns exactly `contest.candidateIds` |

**Manual QA** (each demo build):
- VoiceOver/TalkBack run-through of onboarding → one pole card → one contest → reveal.
- 200% text size.
- Reduce Motion.
- Airplane mode after download.
- A ballot style with an Objective Info contest.

---

## 9. Contract gaps (need sign-off; do not edit `index.ts` without it)

These come up when building the UX above against the current `packages/types/src/index.ts`. Each is **flagged per AGENTS.md** and has to be raised with every owner before anyone builds against it.

| # | Gap | Proposal | Workaround until agreed |
|---|---|---|---|
| 1 | The app can't discover the current `releaseId`, which `/ballot` requires | Add `"GET /releases/current": { query: {}; res: { releaseId: string; asOfDate: ISODate } }` | Ship `EXPO_PUBLIC_RELEASE_ID` in the app config |
| 2 | No endpoint for corrections (PLAN §10 report form) | Add `"POST /reports"` with body `{ releaseId, contestId, refId?, message, evidenceUrl?, contact? }` and no picks | A `mailto:` or form link on `/corrections` |
| 3 | `/ballot` doesn't include `Issue` labels/poles, so the app can't name issues or label pole lines | Add `issues: Issue[]` (only the ones referenced in the response) to `GET /ballot` res | Bundle the issue labels in the app, as `travisDemo.ts` already does (risk: version drift from `release.configVersions.issues`) |
| 4 | `coverage: "objective_only"` has no reason, so the Objective Info explainer can't say *why* | Add an optional `coverageReason?: "no_sources" \| "failed_gates" \| "unopposed" \| "not_evaluated"` to `CandidateProfile` | Generic explainer text |
| 5 | Identities have no storage location in the published release | Pipeline writes `identities.json` separately (§3.2) | Fixture identities file. *No type change needed* |
| 6 | `Bucket` "clouded" is never produced by scoring | Decide in `@ftb/types/scoring` (§1.6) | UI Clouded rule |

---

## 10. Build order (Person 4; event hours from PLAN §10)

| When | Mobile | API / Web |
|---|---|---|
| **H0–2** | Merge `mobile-dev-build`; session persistence; route skeleton for the new screens; switch the fixture source to `fixtures/release-fixture.json` (keep the sample mark) | `/ballot` and `/reveal` from fixtures; identities fixture; agree on §9 gaps 1 & 3 |
| **H2–6** | Onboarding O2–O6 (manual ballot-style list); E5 priorities; ☰ menu | Allowlisted `apiClient` tests; `RELEASES_DIR` layout |
| **H6–10** | B1 ballot list, B2 contest, B3 candidate card (sections 1–9), CitationSheet, B6 picks | Web: `/` and `/how-it-works` skeleton with generated config tables |
| **H10–12** | B5 measure, B8 judicial, Objective Info Mode, B7 collapsed alignment | Deploy API to Vultr; domain |
| **H12–16** | Switch to the real release for one contest end to end; fix data-shape surprises | Real release layout from the pipeline |
| **H16–20** | Replace per-contest reveal with Unmasking U1–U4 + Guess the party, share image, notes; B4 Compare; friend testing (Suite F) | `/s`, `/corrections`, `/releases/:id` |
| **H20–24** | Accessibility pass, Reduce Motion, Unmasking polish, demo recording. Stretch: offline lookup, Daily Challenge, opt-in analytics | Freeze; rehearse |

**Cut order if behind:** Daily Challenge → offline geocoding → Compare screen → Guess the party → analytics → Promise Kept / fact-check sections. **Never cut:** the manual ballot selector, every contest listed, Objective Info Mode, citations, buttons that mirror gestures, the reveal and the demo banner.

---

## 11. Demo definition of done

Maps to PLAN §10 "Demo success":

- [ ] Choose an official ballot style; release ID is visible.
- [ ] Answer a pole card (both via tap and via swipe), a tradeoff card, and ⭐ one.
- [ ] Open a full-analysis race: office description → Context Brief → masked candidates → candidate card with citations, Plan Explorer showing a red "Not stated", and a flag.
- [ ] Show one Objective Info / Clouded contest, presented honestly.
- [ ] Walk the judicial **or** proposition flow.
- [ ] Unmasking with the ceremony and "Surprised?" stats; share card rendered locally.
- [ ] Show How it works and the correction path.
- [ ] Network inspector during the demo shows only allowlisted requests.
