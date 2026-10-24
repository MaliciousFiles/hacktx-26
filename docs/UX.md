# 🧚 Fairy Tale Ballot — UX Spec

> What every screen shows, in what order, and how a voter moves between them.
> Product rules come from [`PLAN.md`](../PLAN.md); §3 Invariants override anything here.
> Visual tokens and components are in [`VISUAL_DESIGN.md`](./VISUAL_DESIGN.md). How to build it is in [`APP_BUILD.md`](./APP_BUILD.md).
>
> **Status:** proposed design. Items marked **[decide]** are open and need a team call. Items marked **[contract]** need a change to `packages/types/src/index.ts` and sign-off from every owner (see `APP_BUILD.md` §9).

---

## 1. Design principles

Use these to settle questions this doc doesn't answer.

1. **Evidence before verdicts.** Every screen leads with what the office does, what candidates did and said, and what's missing. Alignment is secondary and is always collapsed by default (Inv. 22).
2. **The voter decides.** The app never says "best match", "recommended", "you should", or "winner". It asks questions and points to things worth a closer look.
3. **Honest about gaps.** Missing data is shown as missing ("Not stated", "No evidence found", "Objective info only"). It is never hidden or padded (Inv. 1, 17, 20).
4. **Masks are fun, not a promise.** The masquerade makes the product feel like a game, but we say plainly that masks can be seen through (Inv. 7).
5. **Private by construction.** Picks, swipes and location stay on the phone. When the UI talks about privacy, it describes what the code really does (Inv. 5).
6. **Same treatment for everyone.** Every candidate in a contest gets the same layout, the same section order and the same empty states. Their order is random per device (Inv. 9, 15).
7. **Playful voice, serious substance.** The Fairy Godmother's whimsy goes in transitions and empty states. Evidence text is always neutral and plain.

---

## 2. End-to-end flow

```
 FIRST RUN                                                  RETURNING
 ─────────                                                  ─────────
 Splash ─► Welcome (Godmother) ─► How this works (3 panels)    App opens on the
        ─► Privacy promise ─► Find my ballot                   last phase reached
              │                                                (tab bar shown
              ├─ Use my location (on-device lookup)            after onboarding)
              │      ├─ resolved ──────────────┐
              │      └─ ambiguous/failed ──┐   │
              └─ Choose my ballot style ◄──┘   │
                                               ▼
                                     Confirm ballot (N contests)
                                               │
 EXPLORE ──────────────────────────────────────▼──────────────────────────
   Deck intro ─► Pole / Tradeoff cards (anchors first) ─► [Judicial mini-deck
   if ballot.requiresJudicialDeck] ─► "What matters to you" summary
                                               │
 WALKTHROUGH ──────────────────────────────────▼──────────────────────────
   My Ballot (every contest) ─► Contest ─► Candidate card / Compare / Measure
        ▲                          │
        └──── mark pick ◄──────────┘   (repeat per contest; any order)
                                               │
 UNMASKING ────────────────────────────────────▼──────────────────────────
   Ready? (permanent warning) ─► optional "Guess the party" ─► Reveal
   ceremony (contest by contest) ─► "Surprised?" stats
                                               │
 AFTER ────────────────────────────────────────▼──────────────────────────
   Share card · My ballot notes · Daily Challenge · How it works · Report an error
```

### 2.1 Phases and gating

The app keeps a local `phase`: `onboarding → explore → walkthrough → revealed`. Gates:

| Gate | Rule | Why |
|---|---|---|
| Leave onboarding | Ballot style confirmed and release downloaded | Nothing works without a ballot |
| Leave Explore | All **anchor** cards answered or skipped. The rest of the deck is optional ("Finish later") | Fewer cards means lower certainty and more Clouded results, which we show honestly |
| Open a contested judicial race | Judicial mini-deck finished (answered or skipped) | PLAN §1: required when walking a contested judicial race |
| Unmasking | At least one contest viewed. Unmasking is per ballot session and **permanent** | Masks are destroyed on reveal (Inv. 8) |
| Daily Challenge | Always available, but never uses the player's own ballot data before their reveal | Spoiler risk (PLAN §12 #7) |

Users can go back to Explore at any time before the reveal. Changing an answer recomputes alignment on the device.

### 2.2 Navigation model

- **Onboarding** is a full-screen stack with no tab bar.
- **After onboarding**, a 4-tab bar:
  `🗳️ Ballot` · `✨ Explore` · `🧩 Daily` · `📖 More`
  The Ballot tab is the home tab. Once revealed, the Ballot tab shows names.
- Candidate cards, Compare, citations and pick sheets open as **stack pushes** or **bottom sheets** on top of the Ballot tab.
- The Unmasking is a full-screen modal flow started from the Ballot tab ("Ready for the Unmasking?").

---

## 3. Screens

ASCII wireframes are for structure only. Spacing, color and type come from `VISUAL_DESIGN.md`.

### 3.1 Onboarding

**O1 · Welcome**
```
┌──────────────────────────────┐
│        [Fairy Godmother]     │
│                              │
│  Pick the plan               │
│  before the party.           │
│                              │
│  Explore what matters to     │
│  you, then meet every choice │
│  on your real ballot, masked.│
│                              │
│  [ Let's begin ✨ ]           │
│  How it works ›              │
└──────────────────────────────┘
```

**O2 · How this works** (3 swipeable panels with Next buttons and a page indicator)
1. "First, tell us what matters to you: pick between two ideas, or decide whether something is worth its cost."
2. "Then walk your real ballot. Candidates wear masks, so you see plans and records first."
3. "When you're ready, the Unmasking shows who's who. We never tell you how to vote."

**O3 · Privacy promise**
- Bullets, written to match the code exactly:
  - "Your address never leaves this phone. We look up your ballot on the device."
  - "Your answers and picks stay on this phone. We can't see them."
  - "Masks hide names, not facts. A determined person could search a quote. Masks are a speed bump, not a secret."
- Toggle: "Share anonymous usage counts (optional)". Off by default; see `APP_BUILD.md` §7.
- Link: "Read the full method ›" (How it works).
- Button: "Got it".

**O4 · Find my ballot**
```
┌──────────────────────────────┐
│  Which ballot is yours?      │
│                              │
│  [📍 Use my location]         │
│   Looked up on this phone.   │
│   Nothing is sent.           │
│                              │
│  [⌨️ Type an address]         │
│   Also looked up on-device.  │
│                              │
│  [📋 Choose my ballot style]  │
│   From the official list.    │
│                              │
│  Travis County · Nov 3, 2026 │
└──────────────────────────────┘
```
- If the location lookup returns `needs_manual_ballot_style`, or a point is ambiguous, go to O5 with the Godmother line "This spot sits near a boundary. Let's pick from the official list so we don't guess."
- If location permission is denied, show O5. No nagging.
- **[decide]** Whether the MVP ships offline geocoding at all, or only the manual selector (PLAN §12 #12). The manual selector is required either way.

**O5 · Choose my ballot style**: a searchable list of official ballot styles (precinct number, style code, a plain-language label). Includes a "Where do I find this?" helper that points to the voter registration card and the VoteTravis personalized ballot lookup.

**O6 · Confirm ballot**
- "Your ballot has **14 contests**: 6 races, 2 judicial races, 6 propositions."
- A short list by section, then the release stamp: "Data release `data-v3` · as of Oct 24". The data release is pinned to this walkthrough (Inv. 4).
- Button: "Start exploring".

### 3.2 Explore

**E1 · Deck intro**: "A few quick choices. There's no right answer, and skipping is fine. ⭐ the ones that matter most to you."

**E2 · Pole card**
```
┌──────────────────────────────┐
│ Housing · 3 of 14     [Skip] │
│                              │
│  Which is closer to you?     │
│ ┌──────────────────────────┐ │
│ │ Cities should allow more │ │
│ │ apartments by default.   │ │  ◄ option shown first:
│ └──────────────────────────┘ │    side is random per device
│            — or —            │
│ ┌──────────────────────────┐ │
│ │ Neighborhoods should keep│ │
│ │ existing zoning rules.   │ │
│ └──────────────────────────┘ │
│                              │
│  ☆ This matters to me        │
│  [← Back]                    │
└──────────────────────────────┘
```
- Swipe left or right picks the option on that side. **Tapping an option does the same**, and both options are real buttons with screen-reader labels (PLAN §2).
- Which pole shows on top is seeded per device and per card. The recorded `chosen: "a" | "b"` always refers to `poleA`/`poleB` in the data, never to the screen position.
- Skip records `chosen: "skip"`, which means missing, not neutral.
- ⭐ toggles `starred` and works on any card type.

**E3 · Tradeoff card**
```
│  Is this worth it to you?    │
│  ┌────────────────────────┐  │
│  │ More frequent buses     │  │
│  │ ─────── at the cost of ─│  │
│  │ a higher sales tax      │  │
│  └────────────────────────┘  │
│  [ Worth it ]  [ Not worth it ]
│  Saying "not worth it" doesn't mean you oppose buses.
```
- Buttons say `accept`/`decline`; swipe up/down mirrors them. The footnote under the buttons is always visible (Inv. 22).
- Tradeoff answers feed only the reflection summary (E5) and the "questions to consider" prompts. They never feed matching.

**E4 · Judicial mini-deck**: a short interstitial ("Judges aren't scored on policy. These four cards are about how a judge reads the law."), then 4 judicial pole cards in the same layout as E2 with a distinct "Judicial" badge.

**E5 · What matters to you**
- ⭐ starred issues are listed first, then the other answered issues, each as a neutral sentence ("You leaned toward: allowing more housing by right").
- Tradeoffs: "You said frequent buses were worth a higher sales tax." Shown as a reflection, with no score.
- Skipped issues: "You skipped 3. That's fine. Races on those issues will show evidence but no alignment."
- Buttons: "Change answers" and "Walk my ballot ›".

### 3.3 Walkthrough

**B1 · My Ballot (home)**
```
┌──────────────────────────────┐
│ My Ballot          data-v3 ⓘ │
│ 5 of 14 looked at · 3 picked │
│ ───────────────────────────  │
│ STATE                        │
│ ▸ TX House, District 49      │
│   Race · 2 candidates        │
│   ● Full analysis   ✓ Picked │
│ ▸ Railroad Commissioner      │
│   Race · 3 candidates        │
│   ◐ Objective info only      │
│ JUDICIAL                     │
│ ▸ 201st District Court       │
│   Judicial · philosophy cards│
│ PROPOSITIONS                 │
│ ▸ Austin Prop A: Transit Bond│
│   Yes/No · Ballot text first │
│ ───────────────────────────  │
│ [ 🎭 Ready for the Unmasking?]│
└──────────────────────────────┘
```
- Every contest on the ballot style appears, **in official ballot order** (`ballot.contestIds`), grouped by section. Nothing is hidden or re-sorted by alignment (Inv. 20, 22).
- Coverage chip per contest: `Full analysis` · `Objective info only` · `Unopposed` · `Judicial` · `Yes/No measure`.
- Status: not started / looked at / picked / undecided.

**B2 · Contest overview** (candidate races)

Section order is fixed:
1. **Header**: office title, district, seats, partisan or nonpartisan.
2. **What this office can do**: `contest.officeDescription` sentences, each with a citation chip.
3. **What people are saying**: the Context Brief in four labeled groups, always in this order: ✅ Documented · 🗣️ Supporters say · 🗣️ Opponents say · ❓ Disputed or unknown. When a group is empty, say so ("No organized opposition found" or "No data available") from `notes`. Never pad it (Inv. 17).
4. **The candidates**: masked mini cards in the device's seeded random order (Inv. 15):
   ```
   ┌────────────────────────────┐
   │ [mask] The Lantern Keeper  │
   │ Incumbent · Record in office│
   │ Plan detail: ●●○ Some detail│
   │ Evidence: sufficient        │
   │ 🚩1  ⚠️2  💸0  ✅1          │
   │                See card ›   │
   └────────────────────────────┘
   ```
5. **Compare side by side ›** (B4).
6. **Questions nobody answered**: ballot-relevant issues where every candidate's `issueEvidenceState` is `none`, plus plan slots that are `not_stated` across the board. For example: "No candidate has said how they'd fund a transit expansion."
7. **Your pick**: opens the pick sheet (B6).
8. **How your answers line up** *(optional, collapsed)*: the alignment section (B7).

**Objective Info Mode** (`coverage: "objective_only"` for every candidate, or the contest is unopposed): show sections 1–3, then the candidates with only their objective facts, then an explainer: "We didn't find enough public evidence to compare these candidates fairly, so we're showing only what's documented. Here's where to look: …". No alignment section is rendered at all.

**B3 · Candidate card** (full screen; every candidate uses this exact layout)

| # | Section | Content | Empty state |
|---|---|---|---|
| 1 | Mask header | Mask art, mask title, badges: Incumbent / "No record in office: based on what they say, not what they've done" | — |
| 2 | Evidence clarity | Meter: issues with evidence, source mix (actions vs. words) | "Thin evidence" banner |
| 3 | Where you agree / differ | Top 3 each from `MatchResult.agreements/disagreements`: excerpt, date, outlet, source-type chip | "Not enough overlap with your answers to compare" |
| 4 | Platform highlights | `platformHighlights`, each sentence with citation chips | "No platform found in reviewed sources" |
| 5 | Plan Explorer | Per plan: 6 slots Goal → Mechanism → Cost → Funding → Timeline → Who acts. `not_stated` slots show a **red "Not stated"** pill; `not_applicable` shows a grey pill with its cited reason | "No specific plans found" |
| 6 | Plan detail (specificity) | Tier chip (Detailed / Some detail / Limited detail), score, number of plans. Caption: "How specific the plans are, not whether they're true or achievable." | Omitted if there are no scoreable plans |
| 7 | Credibility flags | 🚩 Beyond this office's power · ⚠️ Needs others to act · 💸 No funding source stated · ✅ Funded / tradeoff named. Tap for the evidence and the office-authority explanation | "No flags" |
| 8 | Says vs. Does | Per issue: three dots (Official/speech, Social, Record) on the issue's pole line. Gap callout only when the gap exists in the data | "Not enough record to compare" |
| 9 | Follow the money | Direct receipts and outside spending as **separate** range bars (never summed), dark share range, top industries (labelled "inferred"), in-state share. Unitemized small donations are explicitly called "small donors, not dark money" | "No filings found. That doesn't mean $0." |
| 10 | Bipartisanship / Coalition Breadth | Per the chosen design | "Not available" |
| 11 | Fact-checks *(stretch)* | Individual IFCN checks with the outlet's own rating. Links after reveal | "No fact-checks found. Coverage is uneven." |
| 12 | Promise Kept *(stretch)* | ✅ 🛠️ ❌ ⏸️ 🚫 per promise | Section hidden when `promiseKept` is empty and the candidate isn't a prior officeholder |
| 13 | How your answers line up *(collapsed)* | B7 | — |

Sections 3–12 keep the same order for every candidate, and **sections are never hidden based on alignment**.

**Citation sheet** (opens on any citation chip):
```
│ "We must reform municipal zoning to   │
│  allow multifamily housing near       │
│  transit corridors by right."         │
│  Verbatim · Questionnaire · Texas      │
│  Tribune · Oct 2, 2026                 │
│  🔒 Full link available after the      │
│     Unmasking                          │
│  [Report a problem with this]          │
```
- Use `"Verbatim"` only when `redacted === false`. Otherwise use `"Excerpt, names removed"` (Inv. 7, PLAN §7 validator 2).

**B4 · Compare side by side**
```
│ Issue           Lantern  Cobbler  You │
│ Housing zoning   ●──────────○───◆     │  ◄ pole line, poles labelled
│ School funding   no evidence  ●   ◆    │    at the ends
│ Plan detail      ●●○       ●○○        │
│ Flags            🚩1 ⚠️2   ✅1         │
│ Direct $         $40–45k   $120k      │
```
- One row per issue that at least one candidate has evidence on, plus every starred issue. Each row is a horizontal **pole line** with the neutral pole labels at the ends, a dot per candidate and a diamond for the user.
- Up to 3 candidates fit on screen; more scroll sideways inside the table only, never the whole page.

**B5 · Measure (proposition)**

Fixed order:
1. **Ballot text, verbatim**, in a "parchment" block, with a citation.
2. **What YES means / What NO means** side by side (stacked on small screens). These are Slots: `not_stated` gets the red pill.
3. **Money and costs**: principal, interest, tax impact (cited). "Unknown" where it isn't verified.
4. **Who's funding each side**: separate YES and NO funding maps. "No filings found" never reads as $0.
5. **What people are saying**: the Context Brief, same as B2 §3.
6. **Connections to your answers** *(optional, collapsed; max 2; only when gates pass)*: "You leaned toward X on transit; this measure would fund Y [cited]." Conflicting connections are shown too. **Never a recommendation and never a bucket** (Inv. 14).
7. **Your pick**: For / Against / Undecided / Skip.

**B6 · Pick sheet** (bottom sheet)
- Options: each masked candidate, `Undecided`, `Skip this race`, and `Write-in` when `writeInsAllowed`.
- Caption: "Saved only on this phone. You can change it anytime before the Unmasking."
- No option is pre-selected or highlighted.

**B7 · How your answers line up** (collapsed accordion, candidate races only)
- Header: "How your answers line up *(optional)*", collapsed by default on both the contest and the candidate card.
- Expanded content, per candidate:
  - The bucket chip: ✨ Happily Ever After · 🤝 Good Company · 🧭 Different Paths · 🌙 Worlds Apart · 🪞 Clouded Mirror.
  - Match clarity meter and "Compared on N issues".
  - An issue-by-issue list, which carries the real content.
- If `noStrongMatch`: "No candidate lines up closely with your answers on the issues we could compare. Here's issue by issue."
- Footer, always shown: "This is a way to navigate, not a recommendation. It only covers issues with enough evidence."
- The bucket chip is never shown on mini cards, the ballot list, the share card or notifications.

**B8 · Judicial contest**
- Header and "What this court does", then the Context Brief.
- **Judicial philosophy** for each masked judge, one row per dimension:
  - Text ↔ Purpose
  - Defers to lawmakers ↔ Willing to strike laws down
  - Sticks with past rulings ↔ Willing to overturn
  - Procedural strictness
- Each row shows the user's diamond and the judge's evidence dot, or "No evidence".
- **Objective qualifications**: years of experience, board certification, Austin Bar poll summary, court stats. All cited.
- No buckets, no policy alignment and no "match" wording (Inv. 13). Thin evidence shows the qualifications only.

### 3.4 Unmasking

**U1 · Ready?**
- "The Unmasking shows the names and parties for **every** contest on your ballot. You can't put the masks back on for this ballot."
- Counts: "You looked at 9 of 14 contests and picked in 7."
- Toggle: "Play *Guess the party* first" (on by default; see U2).
- Buttons: "Unmask ✨" and "Not yet".

**U2 · Guess the party** *(optional, local only)*: for each partisan contest where the user picked someone, the question "Which party do you think *The Lantern Keeper* is?" with the parties on that contest as options, plus "No idea". The guesses feed the U4 stats, never leave the phone, and are deleted with the session.

**U3 · Reveal ceremony**
- Contests reveal one at a time in ballot order. Each mask "lifts" (Reduce Motion: a crossfade) to show the name, party (when partisan), photo and website.
- The user's pick gets a "Your pick" ribbon. Undecided races say "You hadn't decided. Here's who's who."
- Citation links unlock on every screen after this step.

**U4 · Surprised?**
All stats are computed on the device from picks, guesses and the identities returned by `/reveal`:
- "Your picks came from **3** different parties." (partisan races only)
- "You guessed **4 of 7** parties right." (only if U2 was played)
- "In **38%** of partisan races, your pick wasn't from the party you picked most often." This is the cross-the-aisle stat.
- For nonpartisan contests: "**6** of your picks were in nonpartisan races, where party isn't on the ballot."
- Tone: celebrate the surprise and never shame it. No "you were wrong". Use "Plot twist!" instead.
- **[decide]** Final stat set after friend testing (Suite F).

### 3.5 After the reveal

**A1 · Share card**: preview of the locally rendered image (see `VISUAL_DESIGN.md` §6) with "Share" (OS share sheet) and "Save image". The card **does not include picks, names or alignment** by default. **[decide]** Whether an opt-in "include my picks" exists at all. The default proposal is no.

**A2 · My ballot notes**: a printable, screenshot-friendly list of contests in ballot order with the user's pick or "undecided".
- Helper: "Texas lets you bring written notes to the polls, but not use your phone in the voting booth. Print or write this down." **[verify wording against current Texas Election Code before shipping]**
- Buttons: "Save as image" and "Clear my picks".

**A3 · Release changed banner**: if a newer release exists, show "Updated data is available (data-v4). Your walkthrough uses data-v3." with "See what changed" (release diff) and "Switch". Switching keeps the swipes but resets the masks and the picks for contests that changed. Never switch silently (Inv. 4).

### 3.6 More tab

- **How it works**: sources, methods, outlet allowlist, fact-check rating mapping, office-authority matrix, test results, research findings (only if the PLAN §6 gates pass). The same content as the web page.
- **About & nonpartisan statement**: "We don't endorse candidates." Includes the data release date, sources and limitations (Inv. 21).
- **Report an error**: a form pre-filled with the contest, source or citation ID. **It never includes swipes or picks** (PLAN §10).
- **Settings**:
  - Analytics opt-in.
  - Text size follows the OS.
  - Reduce motion follows the OS, with an in-app override.
  - "Start over on a different ballot".
  - "Delete everything on this phone".
- **Demo data banner**: if the app runs on synthetic fixtures, a persistent "Demo data, not real candidates" banner is shown on every screen (PLAN §10 "If data fails").

### 3.7 Daily Challenge

- **[decide]** Mechanic: *Quote Match* vs. *Follow the Gold* (PLAN §12 #6). Wireframe for Quote Match: 4 masked quotes and 4 platform cards; drag or tap to pair them; 3 lives; a result emoji grid (`🟪🟪⬜🟪`) to share.
- Data: past races, other states or national figures only. It never uses contests on the player's own ballot before their reveal (PLAN §12 #7).
- Uses its own `MaskSession` with `scope: "game"`, separate from the ballot masks.

---

## 4. Cross-cutting states

| State | Treatment |
|---|---|
| First load / release download | Godmother "sprinkling" loader with real progress text ("Fetching 14 contests…"). Never a blank screen |
| Offline after download | Everything works, because the release is cached by `releaseId`. Only `/reveal`, `/daily` and reports need the network; they show "Needs a connection" with a retry |
| `/reveal` fails | Masks stay on, nothing is destroyed until identities arrive, and a retry is shown |
| Unknown or superseded release | "This data release is no longer available. Let's load the current one." A diff link appears if one exists |
| Contest with 0 evidence | Objective Info Mode, never an error |
| Unopposed contest | "Unopposed: one candidate is on the ballot." Objective info only and no comparison |
| Mask session expired (24h) before reveal | "Your masks were refreshed for privacy." New random masks are dealt and the picks are kept |
| Errors | The Godmother apologizes in one line, then states the plain cause and a retry. No stack traces |

---

## 5. Voice and copy

**Fairy Godmother voice:** warm, brief, a little wry. She narrates transitions and empty states, and never evidence.

| Do | Don't |
|---|---|
| "Worth a closer look." | "Best match" / "Top pick" / "Winner" |
| "Here's what they've said and done." | "Here's who you should vote for." |
| "Not stated" | "Refused to say" / "Dodged" |
| "No filings found. That doesn't mean $0." | "No money" |
| "Plot twist!" | "You were wrong" |
| "Supporters say… / Opponents say…" | "The truth is…" (for interpretations) |
| "Small donors, not dark money" | Calling unitemized donations "dark" |

**Banned words in UI strings:** recommend, should vote, best, winner, correct choice, right answer. Enforce this with a lint test over the string table (`APP_BUILD.md` §8).

**Mask titles** are protagonists only, never villain-coded (PLAN §11). The cast is in `VISUAL_DESIGN.md` §5.

---

## 6. Accessibility

- Every gesture has a button with the same effect (swipe → option buttons; long-press → menu item).
- Screen-reader order follows the visual order. Pole cards announce "Option 1 of 2: …". The ⭐ toggle announces its state.
- Supports Dynamic Type / font scaling up to 200% without clipping. Cards grow taller; text never shrinks.
- Color is never the only signal: every chip pairs color with an icon and text.
- Minimum tap target is 44×44 pt.
- Reduce Motion replaces the swipe fling, mask lift and confetti with fades.
- Contrast is WCAG AA minimum (4.5:1 for body text) in both light and dark themes.
- Avoid any red-vs-blue pairing that could read as a party signal. See `VISUAL_DESIGN.md` §2.
