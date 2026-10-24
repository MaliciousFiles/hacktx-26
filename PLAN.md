# 🧚 Fairy Tale Ballot — HackTX '26 Plan

> Explore what matters to you, then examine **every choice on your real ballot** through sourced evidence, contrasting arguments and concrete consequences—without leading with names or parties. Alignment is a navigation aid, **not the answer**.

**Scope:** automatically process **every contest** on the Travis County, Nov 3 2026 ballot (early voting Oct 19–30). The pipeline attempts full evidence treatment for each; only a contest that fails source/quality gates falls back to objective information. Use a few different races for end-to-end QA, **not** as an artificial coverage limit. Architecture supports other jurisdictions via adapters. Check HackTX dates before claiming election-day reach.
**Platform:** Expo + React Native mobile app, plus a small web page for share links.
**Status:** planning only. Types are a proposed integration contract, not an implemented app.

---

## 1. User flow

Screen-by-screen design: [docs/UX.md](docs/UX.md) · visual system: [docs/VISUAL_DESIGN.md](docs/VISUAL_DESIGN.md) · build guide: [docs/APP_BUILD.md](docs/APP_BUILD.md).

```
Onboarding (Fairy Godmother) → address processed locally → precinct → ballot
  ▼
Explore: balanced pole-choice cards + some "X at the cost of Y" tradeoff cards
  choose a pole / accept or decline a tradeoff / skip; ⭐ = matters to me
  anchors + ballot-relevant issues (including issues no candidate addresses)
  + judicial philosophy mini-deck (required if walking a contested judicial race)
  ▼
Ballot walkthrough (choose races; every contest accessible; questions and evidence first)
  ▼
The Unmasking → names/parties → "Surprised?" stats
  ▼
Share card · Daily Challenge (separate loop)
```

## 2. Features

### Core
| Feature | Summary |
|---|---|
| **Explore deck** | **Pole cards:** choose between two neutrally worded ends of one issue; either can appear on either side. **Tradeoff cards:** decide whether X is worth the stated cost Y; declining does not imply opposition to X. Anchors include important issues even if candidates don't address them; add ballot-relevant differences and gaps. ⭐ records importance. Buttons and screen-reader labels duplicate gestures. |
| **Ballot walkthrough** | Lead with what the office can do, the candidates' actions/plans, their differences, funding, consequences, missing answers and links. Invite the user to compare and make their own choice. |
| **Optional alignment buckets** | ✨ Happily Ever After · 🤝 Good Company · 🧭 Different Paths · 🌙 Worlds Apart · 🪞 Clouded Mirror. Collapsed or secondary on the candidate card, never a winner banner or automatic recommendation. Absolute, not curved per race. |
| **Evidence clarity** | Separate meter: issues compared, source quality. |
| **"No strong match" note** | If supported by enough evidence, mention no close alignment without burying issue-by-issue facts. |
| **Random masks** | Fresh, crypto-random characters per masking session (ballot or game). Not tied to the candidate. Destroyed on reveal. |
| **Unmasking** | Celebrates surprise ("38% matched across the aisle"), never shames. |
| **Share card** | "My Fairy Tale Ballot" image + link. |
| **Fairy Godmother** | Mascot and guide. |
| **How it works page** | Sources, methods, fact-check outlets, rating mapping, test results. |
| **Why these signals matter** | If historical analysis passes the preregistered gates (§6), show both groups' actual follow-through rates, sample sizes, uncertainty and a cautious relative comparison. Otherwise explain the metric without a numerical promise. |

### Candidate card
| Section | Summary |
|---|---|
| **Top agreements / disagreements** | Each with quote, date, link. |
| **Platform highlights** | Neutral-voiced, every sentence cited. |
| **Plan Explorer** | Goal → Mechanism → Cost → Funding → Timeline → Who acts. Missing slots show **"Not stated"** in red. |
| **Specificity score** | Separate, prominent indicator of documented plan detail (not truth or feasibility). May drive order only if fairness gates pass (§3). |
| **Credibility flags** | 🚩 Beyond this office's power (counts **against** them) · ⚠️ Needs others to act · 💸 No funding source stated · ✅ Funded / tradeoff named. |
| **Says vs. Does** | Official speech vs. social vs. record, per issue; gaps flagged. |
| **Promise Kept** | Stretch: for prior officeholders, ✅ Kept · 🛠️ Fought for · ❌ Broken **only after human review** · ⏸️ No documented action (not proof of inaction) · 🚫 Outside their power. Wayback promises are one possible source. |
| **Fact-checks** | Stretch: show individual IFCN fact-checks with context, not a candidate-level truthfulness score (coverage is unequal). 🔎 Record-Verified Claims also require reviewed identity/action matches. |
| **Bipartisanship** | Two designs kept until data decides: (a) one composite, (b) Bridge-builder + Maverick. Called "Coalition Breadth" in nonpartisan races. |
| **Follow the money** | FEC/TEC direct and outside spending first; FCC/IRS tracing stretch. Distinguish small unitemized donations, opaque entities, and genuinely undisclosed donors. Show documented ranges, never infer that all unknown money is dark. Identifying donor names held until reveal. |
| **No record in office** | Badge: "Based on what they say, not what they've done." |

### Special contest types
| Type | Handling |
|---|---|
| **Judges** | A separate required `JudicialCard` pole deck builds a **judicial-philosophy vector**, never a policy vector: reads the law's exact words ↔ reads for its purpose · defers to lawmakers ↔ willing to strike laws down · sticks with past rulings ↔ willing to overturn · how strictly they hold the government to procedure. `JudicialComparison` presents dimension-by-dimension evidence, **not policy MatchResult/buckets**. Plus objective experience, board certification, Austin Bar poll, court stats; thin evidence → objective info only. |
| **Propositions** | **Layer 1:** verbatim ballot text, sourced YES/NO effects, fiscal figures if verified, funded YES/NO campaigns if reporting exists, discourse and checked context. Missing facts explicitly marked unknown. **Layer 2 (gated):** at most 2 connections to swipes; include conflicts. Never a recommendation or bucket. |
| **Every contest** | **Context Brief** from official records and SerpApi-discovered discourse: ✅ Documented (specific source claim) · 🗣️ Supporters say · 🗣️ Opponents say · ❓ Disputed/unknown. Two articles copying the same wire story count once. Do not label an interpretation "confirmed" merely because two outlets agree. |

### Daily Challenge (NYT-games style, needs prototyping)
- **Leading ideas:** *Quote Match* (assign quotes to platform cards) and *Follow the Gold* (assign industries to characters). Emoji result grid to share.
- **Spoiler risk:** must not unmask the player's own ballot. Options are in §12.

---

## 3. Invariants

These are non-negotiable. Each has at least one test (§8).

1. **Automate coverage; abstain rather than hallucinate.** Attempt the same pipeline for every contest, but show objective info and let the user decide if evidence is thin or missing. An automated fallback is not a decision to omit the race.
2. **Every generated sentence cites evidence**, and the citation passes validation. If not, the sentence is dropped.
3. **Quotes are exact** substrings of the source.
4. **No model calls while serving users.** Every model output comes from a frozen, versioned **data release**: a numbered snapshot of the ballot, profiles, citations, scoring configuration and candidate-identity mapping. It is our publication version, **not** a change to the government's ballot. Keep the current release for a walkthrough; corrections publish a new one.
5. **Matching is pure code and runs on-device.** Address/geocoding and point-in-polygon lookup run locally (or the user manually selects an official ballot style). The API receives a **ballot-style ID**, not an address or coordinates. Swipes, picks and matches never reach our server; share images are rendered locally. Opt-in metrics must not contain those values; measure aggregate funnel events only.
6. **Party never enters matching; test whether masking party in classification helps.** For stance classification the only allowed input is a versioned, auditable `ClassificationInput` projection of normalized source text; compare name-only vs. name-and-party masking on the golden set before selecting a mode. `unmasked_eval_only` is not publishable; enforce approved mode and projection version. Do not pass a party field, voter party, vote party-share or donor party into stance/matching. Party-aware data is used only by bipartisanship, reveal, and the classifier *masking* input adapter. An import boundary alone cannot remove embedded party words.
7. **Masking is a speed bump, not anonymity.** Quotes, positions and public facts are searchable; network inspection can also correlate records. Prevent *accidental* leaks of names, parties, photos, direct source URLs, raw role/bill strings and donor names in the masked presentation and share card. Office/district names that are essential for knowing the real contest remain visible. Hold candidate-identifying links until reveal; tell users the limitation. Authentication/rate limits may deter scraping, but a mobile API cannot guarantee "app-only" access or enforce the mask against determined clients.
8. **Masks are random per session** and carry no correlation with the candidate.
9. **Symmetry.** Every candidate in a contest gets identical search templates, caps, time windows, rubrics, and review treatment.
10. **Proximity scoring, not directional.** Extremity is never rewarded.
11. **Repetition isn't evidence.** Confidence grows with distinct sources and events, not mention count.
12. **Actions outweigh words.** Contested votes outweigh unanimous or consent votes, which weigh about 0.
13. **Judges are never scored on policy.**
14. **Propositions never get a recommendation.** Connections are gated and capped.
15. **Default order is randomized.** Specificity-tier ordering is an experimental, opt-in decision only if tests exclude material disparity by party, incumbency **and resources** with adequate power; otherwise keep random order. No false claims of fairness from a small sample.
16. **Clearly impossible promises are called out, not hidden.** The office-authority matrix is public; negative credibility flags need a cited, human-reviewed, unambiguous legal authority mismatch. "Needs other officials" is explanatory, not a penalty.
17. **Each Context Brief side has the same cap.** If one side is missing, we say so; we never pad it.
18. **Money shows ranges when the source gives ranges.** Small unitemized donations are never counted as dark money.
19. **Fact-check sources are transparent:** IFCN signatories only; show original ratings, links after reveal, and coverage caveats. No aggregate truthfulness score by default.
20. **Every visible contest is honest about coverage.** Uncontested and unevaluated contests appear in Objective Info Mode, never as silently omitted or falsely compared.
21. **Nonpartisan disclaimer and correction path.** Explain we do not endorse candidates; display data-release date, source and limitations; allow candidate and voter error reports, log corrections with evidence, review symmetrically and publish release diffs.
22. **Critical thinking outranks matching.** A bucket cannot determine card order, contest order, a user's pick or which sourced evidence is hidden; show tradeoffs, unanswered questions and reasons to investigate. A tradeoff decline is never treated as the opposite stance on its policy goal.

---

## 4. Architecture

```
┌─ OFFLINE PIPELINE (TS) ───────────────────────────────────────────────┐
│ snapshot → normalize → mask → classify (Jev / LLM fallback) → aggregate│
│          → generate (LLM) → validate → publish release vN              │
│ adapters: BallotProvider · RecordProvider · SourceFinder · FinanceProv │
└───────────────────────────────┬───────────────────────────────────────┘
                                ▼ Supabase (Postgres + storage), pinned release
┌─ SERVING ─────────────────────┴───────────────────────────────────────┐
│ /ballot?ballotStyleId&releaseId  /reveal  /daily  (thin; no models)     │
└───────────────────────────────┬───────────────────────────────────────┘
                                ▼
┌─ APP (Expo RN) ───────────────┴───────────────────────────────────────┐
│ local address lookup · @ftb/types/scoring · masks · share image · opt-in │
└───────────────────────────────────────────────────────────────────────┘
```

**Models**
- **Jev** (pin a version *after access is confirmed*): preferred typed decisions — relevance, stance, claim type, source type, specificity, funding stated, entailment, industry. Its probabilities are not proof of correctness.
- **Fallback if no Jev access:** pinned structured-output LLM with the same rubrics, cache and golden-set evaluation; low-confidence outputs are reviewed or withheld. Do not pretend LLM logprobs and Jev confidence are interchangeable.
- **Frontier LLM** (pinned): text only — highlights, plan slots, claim extraction — always followed by validators.
- **Local embedding model** (pinned weights): retrieval, de-duplication, promise-to-action matching.
- Politicosmos Doc2Vec is **topic** similarity, not stance. Reuse it only for related bills and de-duplication.

---

## 5. Data sources

### Records (official actions)
| Office | Source |
|---|---|
| US Congress | Politicosmos bills/votes/reps; direction re-classified from CRS summaries or bill text |
| TX Legislature | **TLO FTP** bill history XML + **House/Senate Journals** for individual votes (built in-house); HRO/SRC bill analyses as Jev input; LegiScan only to spot-check |
| Governor / Lt. Gov | Signed and vetoed bills, veto proclamations, executive orders, interim charges |
| Attorney General | Lawsuits, AG opinions, amicus briefs |
| Railroad Comm. / SBOE | Open-meeting rule and permit votes, final orders, board minutes |
| Austin Council / Commissioners Court / AISD | Meeting minutes (AISD via BoardBook) |
| Judges | Opinions (TAMES), OCA court statistics, Austin Bar poll |
| Promise Kept | Wayback Machine CDX snapshots of prior campaign sites and questionnaires |

### Voice (statements)
Priority order:
1. **Questionnaires** (VOTE411, Texas Tribune, KUT/Statesman, Ballotpedia)
2. Debates, forums, town halls (SerpApi + YouTube transcripts)
3. Campaign sites
4. Social media: SerpApi `site:x.com` / `site:facebook.com` snippets (snippet dates/text may be incomplete). Paid X API fallback depends on volume and current pricing.

### Ballot
VoteTravis consolidated ballot PDF (all eligible contests) + public district/precinct shapefiles → offline, on-device location lookup. **Lookup must resolve an official election-specific ballot style**, not merely a precinct: the [Travis County election page](https://votetravis.gov/current-election-information/current-election/) offers a consolidated ballot and separate personalized ballot; its [poll-worker manual](https://votetravis.gov/wp-content/uploads/G25-Training-Manual.pdf) tracks precinct **and ballot style** as separate fields. This establishes that styles matter, **not** that multiple styles share a precinct in this particular election. Verify local results against official personalized ballots. If no reliable public precinct→style map exists or a point is ambiguous, stop and let the user select/confirm the official ballot style; never silently guess or transmit an address/GPS point.

**Data release vs. official ballot:** `/ballot` returns the requested `releaseId` and that release's full contest/citation/profile snapshot. `/reveal` takes the same `releaseId`; server and client reject missing, superseded-without-snapshot, mismatched, duplicated or unknown candidate IDs. Store immutable releases while users may still have an active walkthrough. A release update must not silently replace the data a user is viewing.

### Context
SerpApi News/Web with fixed templates + official docs. Outlet allowlist lives in `config/sources.yaml` and is published in the app.

### Money
| Kind | Source |
|---|---|
| Federal direct | FEC Schedule A |
| Federal outside | FEC Schedule E (independent expenditures, 24/48-hr reports), Form 9 (electioneering communications) |
| State / county | TEC bulk CSVs (general- and specific-purpose committees, direct campaign expenditures) |
| City props | Austin City Clerk filings |
| TV / radio / cable ads | FCC Public Inspection File (PDFs → LLM extraction + validation) |
| Digital ads | Meta Ad Library API (`bylines`, spend **ranges**) · Google Political Ads (BigQuery) |
| Tracing | IRS 8872 (527 donors) · IRS Exempt Organizations master file (identifies 501(c)(4)/(c)(6)) |

**Trace rule:** follow PAC transfers up to 3 levels without double-counting. A (c)(4), (c)(6), or LLC **may** obscure donors; only classify dollars as dark when disclosure obligations and the actual filing establish the donor trail is unavailable. Mark unknown/unresolved separately. A 527 can be followed through 8872 reports. Industry inferred from employer/entity data is labeled as inferred, never proven donor intent.
**Dark share interval:** `FundingMap.traced.receipts` and `.outside` are separate; only `.outside.dark` divides outside-spending dollars. With a defensible outside-spending denominator, `min = dark.min / outside.max`, `max = min(1, dark.max / outside.min)`; if `outside.min = 0`, omit the upper bound. `@ftb/types/scoring` computes this in pure code. Avoid combining campaign receipts and outside ad spending into a deceptive single total; show bases and time windows.

### Fact-checks
Google Fact Check Tools API (ClaimReview), filtered to IFCN signatories.

---

## 6. Scoring

These are **draft operational definitions**, not validated findings. Freeze parameters in `prereg.yaml` before evaluating; change through a new version with a diff report.

1. **Issue axes.** Hierarchical: Politicosmos's 20 categories for retrieval, child issues for scoring. Each `Issue` has explicit positive and negative policy poles, e.g. `housing.zoning`: +1 = allow more housing by right; -1 = retain restrictive zoning. Neither pole means "good". Never use broad topic labels as stance axes.
2. **Two card rubrics.** A `PoleCard` neutrally explains two competing policy approaches on one defined axis; side/order randomized. Selecting either pole supplies a **direct but provisional** stance. A `TradeoffCard` asks whether a specific policy X is worth a specific cost Y; accepting/declining teaches about priorities and prompts reflection, but neither is fed into the stance vector without separately validated interpretation. Both need mirrored framing, comprehension tests and issue-diversity review. Skip means missing, not neutral.
3. **User vector (draft).** For issue `i`, use **only pole choices**: `u_i = Σ(x_ji · w_ji) / Σw_ji`, where `x_ji` is the chosen pole's fixed coordinate on issue `i` and `w_ji ≥ 0` is the reviewed card weight. Randomized screen side has no effect. `userCertainty` depends on independent cards and consistency; one card remains low-certainty. ⭐ and top-3 affect salience, never the sign. Tradeoff responses are a separate reflection record, not automatic candidate alignment; a user can support X generally yet reject X at cost Y.
4. **Candidate evidence.** Deduplicate by event and syndication; classify direction against the same issue poles. `modelConfidence` = stored response distribution; `evidenceStrength` = independent source breadth, provenance, recency and agreement (distinct concepts). Action-derived directions require an auditable issue/measure interpretation; votes on omnibus bills are not automatically positions on all topics. Recorded contested vote = losing side ≥10% of participating votes (draft); voice vote/consent is never treated as contested. Actions get higher evidentiary weight than words; specificity and feasibility stay **separate** from ideological proximity to avoid turning undocumented value judgments into stance.
5. **Secondary alignment aid.** For comparable issues, `a_i = 1 − |u_i − c_i|/2`; average weighted by salience and **both** user certainty and candidate evidence strength. Missing issues must not improve alignment; show coverage, avoid cross-candidate ranking if compared on materially different issue sets. Absolute bucket *draft* cutoffs: ≥0.80 Happily Ever After; ≥0.60 Good Company; ≥0.40 Different Paths; <0.40 Worlds Apart. `noStrongMatch` only when none reaches ≥0.80 **with sufficient coverage**. Near-threshold uncertainty ⇒ Clouded or issue-by-issue view. **Neither score nor bucket recommends a vote.**
6. **Coverage (draft).** `sufficient` = ≥3 comparable distinct child issues, each candidate stance supported by ≥2 independent source events (one may be a well-documented official action), user certainty above threshold. `thin` = some relevant evidence but below threshold; `none` = no defensible comparison. `matchClarity` reflects coverage and evidence strength, not Jev's confidence. No artificial claims that one official act and its press release are two independent events.
7. **Card selection.** Anchors cover important issues independent of what candidates say. Additional cards cover documented candidate differences **and major relevant questions candidates have not answered**, subject to issue-diversity caps. Tradeoffs probe interactions and spur questions in the walkthrough; they do not replace pole cards to optimize bucket separation. Use no party metadata. Stretch: adaptive choice evaluated against a fixed deck.
8. **Plan specificity (draft).** Per plan = documented slots among goal, mechanism, cost, funding, timeline, who acts ÷ applicable slots; a cited `not_applicable` is excluded from the denominator and differs from `not_stated`. If no slots apply, omit the score. Candidate score = average of plans, shown with number of plans and coverage. Tier cutoffs: ≥⅔ detailed, ≥⅓ some detail, otherwise limited detail. Separate from whether a proposal is true or achievable. "No funding source stated" is only shown for identified new spending/tax cuts after reviewing *all* evidence, and does not assert that no funding exists.
9. **Credibility and action checks.** Office-authority matrix is published and human-reviewed; `none` requires clear law/office limits. Beyond-power claims are flagged with a quote and official explanation, with an explicitly described negative credibility adjustment after human review. Says vs. Does gap = `|does − says|` only when both have adequate independent evidence. Promise status: kept = documented outcome tied to pledge; fought for = relevant effort despite failed outcome; broken = verified contradictory action **plus human sign-off**; no documented action ≠ broken; outside power = verified office-authority mismatch.
10. **Bipartisanship.** For partisan legislative offices, independently report cross-party cosponsorship, contested party-breaking votes and rhetoric, then test if composite and Bridge-builder/Maverick split are meaningful. Nonpartisan "Coalition Breadth" requires identifiable distinct factions/coalitions; if absent, display **not available**, not an invented score.

### Historical validation: do the displayed signals predict anything?

**Question:** among *historically elected* officials with archived pre-election plans, are clearly specified promises more often followed by documented effort or achieved outcomes? This is a test of why plan specificity may be worth examining—not a prediction that a particular 2026 candidate will keep a promise.

1. **Build a temporal cohort.** Gather dated pre-election promises/plans from archived campaign pages and questionnaires; freeze the specificity rubric **before** measuring later outcomes. Link to actions and outcomes within the same defined post-election window (e.g. 24 months). Politicosmos's 119th-Congress bills alone lack enough historical follow-up or original promises for this claim; expand the historical cohort if sources permit, or abstain.
2. **Define two different endpoints:** *documented effort* (proposed, voted or acted in the promised direction) and *achieved outcome* (promised policy enacted/implemented). A failed bill can count as effort but not achievement. "No action found," an unresolved match, and a promise not yet due are **not** coded as failures. "Broken" requires human review. Do not pool outcomes across offices with incompatible powers.
3. **Prevent hindsight and selection bias.** Set the threshold (e.g. ≥⅔ plan slots), time window, population, minimum data coverage and outcome rubric in `tests/prereg.yaml` *before* looking at results. Sample promises/officials without filtering for known outcomes; two independent reviewers label a stratified subset, including hard negatives. Report missing archives, unresolved promises, who was excluded and why. Cluster uncertainty by politician so one prolific promiser cannot dominate. Test sensitivity to office, issue area, year, incumbency, party and campaign resources; explore out-of-sample years rather than tuning a flattering threshold.
4. **Publication gate:** only a well-covered, reviewed and stable finding is shown. Display absolute rates and denominators first: “In [population/period], documented effort appeared for A/B promises with detailed plans versus C/D with less detail.” If the relative risk and its clustered 95% interval are stable, optionally add “~X times **as likely in this historical sample**.” These are **promise-level** rates; don't say “a politician is X times more likely” unless a separate politician-level endpoint (e.g. kept a majority of eligible promises, minimum promise count) is defined and tested. A wide interval, tiny/zero baseline, large missingness, changed definitions, or reversed subgroup patterns ⇒ no ratio claim. Never say “specificity causes follow-through” or use it as a candidate-level truthfulness score.
5. **Transparency:** publish the rubric, dataset window/hash, counting rules, cohort flow, effect estimates and limitations on the How it works page. `ResearchFinding` carries the denominators, confidence interval, exclusions and methodology reference. It is separate from candidate evidence and pinned to the same data release. Keep these research cards explanatory, not an ordering or recommendation nudge.

---

## 7. Determinism

**Principle: the frozen snapshot is what makes us deterministic, not the model.** Jev is probabilistic, and LLMs aren't reliable even at temperature 0.

### Tiers
| Tier | Meaning | Mechanism |
|---|---|---|
| **T1** pure code | Same input → identical output | No models, seeded PRNG, stable sorts, fixed rounding |
| **T2** frozen model output | Ran once; stored as a versioned record | Content-addressed cache, pinned versions |
| **T3** cosmetic | Mascot lines, art | Frozen per release; nothing depends on it |
| **R** intentionally random | Masks | Crypto-random per session; tested for independence |

### Inventory
| Decision | Tier |
|---|---|
| Ballot lookup, user vector, card selection, match, bucket, clarity, `noStrongMatch` | T1 |
| Recency (fixed `asOfDate`), all weights and thresholds (versioned config) | T1 |
| Evidence state, credibility flags, specificity tier, bipartisanship, money sums, dark % | T1 over T2 |
| Says vs. Does, Promise Kept status, Record-Verified verdicts | T1 over T2 |
| Candidate order (seeded per device; tier ordering disabled unless fairness gates pass) | T1 |
| Daily challenge (seeded by date) | T1 over T2 |
| Search query templates (identical per contest) | T1 |
| Raw fetches | Snapshot (hash + `fetchedAt`) |
| Chunking, normalization, masking | T1 |
| All Jev classifications, card vectors, bill and action direction, industries | T2 |
| Generated text (highlights, plan slots, context claims) | T2 + validators |
| Human overrides | Append-only log (author, reason) |
| Masks | R |

### Harness
1. **`cached_call(spec)`**: key = `sha256(canonical_json(CachedCallSpec))`. Stores the full distribution. A hit always reuses the stored output.
2. **Pin everything:** model versions (never `latest`), rubrics, issues, thresholds, authority, and source allowlist in versioned YAML. A version bump invalidates everything downstream.
3. **Stage manifests** record input hashes, git SHA, config versions, and counts. CI checks that a rebuild is byte-identical.
4. **Low-confidence escalation:** Jev → LLM → human queue. Review is **symmetric across the contest**.
5. **Repeatability check:** measure Jev variability with 3 runs on a sample; if material, average probability vectors (not category labels), recompute the result, and freeze. Disagreement near a threshold triggers review, not a forced answer.
6. **Single scoring implementation:** `@ftb/types/scoring`, imported directly by the app and the pipeline.
7. **Release diff report:** which buckets and flags changed, and why.

### Validators for generated text (deterministic)
1. Generated prose is represented as atomic `CitedSentence` entries (including highlights, Plan slots, context claims/notes, office explanations, fiscal impacts, archived promises and quoted fact-check claims). Each has ≥1 same-release `EvidenceRef`. Publish only if every reference resolves within **the same candidate and contest**, or to a contest/measure-scoped `SourceCitation`. Verified fixed system labels are enums, not uncited generated prose. Do not merge two generated sentences under one citation list. `@ftb/pipeline` (`validatePublication`) contains release, citation and response-leak checks; publication must invoke them on the current release's artifact set for every field and reject missing refs.
2. **Pure quote checkers:** `@ftb/pipeline` (`validateQuote`) verifies immutable `Source.originalText` with UTF-16 `{start,end}` spans, exact string equality (**no whitespace/Unicode/case normalization**), source-to-contest and source-to-candidate ownership, and official-action actor when linked. For multi-speaker sources require an approved attribution span; model `isOwnSpeech` alone is not proof. Props and general Context Briefs use separate `RawSourceCitation` proofs, verified against the original with `validateExactCitation`, and a deterministic redactor if displayed masked. Only the safe `SourceCitation` projection is serialized. A redacted excerpt is never labeled verbatim.
3. Numbers match the database.
4. Run the deterministic identity-leak gate over the **entire serialized `/ballot` response**: plans, archived promises, fact checks, context notes, ballot and office text, citations and evidence. Scan known candidate/donor names, aliases, party labels and URLs; reject or manually review hits. Keep official office/district labels needed to understand the contest. This is a blocklist against obvious leakage, **not** a guarantee against searchable quotes or paraphrases.
5. Model entailment ≥ threshold is a *triage signal*, not a proof. Confirm consequential allegations and flags with primary evidence and a human reviewer.
6. Failures are **dropped**, never rewritten. Too many drops → Objective Info Mode. Test the serialized API response and rendered screen, not only typed objects.

---

## 8. Test suite

Each owner tests their own module; **Person 2 owns the cross-cutting bias suites.** Thresholds go in `tests/prereg.yaml` and are **committed before results are seen.**

| Suite | Tests |
|---|---|
| **A. Data integrity** | Official **ballot-style ID** and contest list vs. ~20 personalized ballots from varied precincts (test possible split/ambiguous styles; never guess) · journal vote parsing vs. LegiScan sample (≥99%) · money reconciles with FEC/TEC summary totals · Meta totals are ranges · Wayback snapshot dates in window |
| **B. Model accuracy** | Golden set labeled by **2 humans** (human agreement = ceiling) · Jev accuracy by source and office type · calibration (does 0.8 mean right 80% of the time?) · fallback rate · historical promise/outcome labels checked against original records with inter-reviewer agreement |
| **C. Consistency** | Negation flips direction · paraphrase stability · name/party swap · formal vs. casual style (social) · **party-masking experiment** (unmasked / names masked / names + party masked → accuracy vs. bias; decision rule in prereg) |
| **D. Fairness & cards** | Evidence coverage parity across **all contests and office types** · template symmetry · pole-card side swaps and framing audit · tradeoff comprehension and no sign inversion on decline · topic balance, including unanswered issues · random/mirror-image swipers · assess disparity by party / incumbency / money for coverage, specificity and flags (small samples are descriptive) · random mask/party independence · Context Brief syndication and balance |
| **E. Scoring properties** | With sufficient coverage: identical → top bucket, opposite → bottom · closer never scores lower · extreme candidate doesn't beat a moderate one for a moderate user · low coverage → abstain · ⭐ changes weight, never direction · skip ≠ neutral · rejecting a tradeoff ≠ endorsing the opposite pole · cited `not_applicable` excluded from specificity denominator · reviewed `beyond_power` lowers credibility · judicial vector/dimensions only, judges have empty policy stances |
| **F. Product assumptions** | Do users read evidence and identify tradeoffs or just chase the bucket? Compare bucket-first vs. evidence-first presentation · card comprehension · contest completion · bucket distribution and stability · card count vs. understanding · post-unmask reactions · ⭐ usage · do historical-rate callouts improve understanding without being misread as a guarantee? |
| **G. Validators, privacy & accessibility** | Wrong-candidate/wrong-contest quotes, forged prop/context citation spans, wrong action actor, near-miss quotes, off-by-one spans, Unicode/whitespace changes, wrong numbers, unredacted plans/promises/notes and other obvious leaks anywhere in serialized response → **100% caught** · classification projection party-swap tests · no precise location in URL/logs · no choices or swipes in API/analytics/share requests · no entity/flow IDs pre-reveal · button parity with gestures and screen-reader flow |
| **H. Regression** | Byte-identical rebuild · release diff review |
| **I. Historical claims** | Frozen before/after periods and threshold · comparable follow-up and office strata · independently reviewed outcomes · missingness and confounding audit · clustered uncertainty by politician · out-of-sample/sensitivity checks · no “X times” publication if any gate fails |

**Middle-bucket rule (draft, finalize in prereg):** if Good Company + Different Paths hold more than ~70% of pairs **and** more than 50% of races have every candidate in one bucket → consider de-emphasizing buckets further, not manipulating cards or scores just to create more separation. The issue-by-issue explanation remains primary.

**Assumption tests before scaling:** compare friend comprehension of pole/tradeoff wording, completion time, automated coverage by office and candidate resources, model performance with Jev vs. fallback, confidence calibration, match stability and whether the walkthrough actually increases critical examination rather than outsourcing judgment. Pre-register denominators and minimum sample sizes; small samples are descriptive, not a statistical all-clear.

---

## 9. Integration contract — `packages/types/src/index.ts`

The contract lives in code at [`packages/types/src/index.ts`](packages/types/src/index.ts) (`@ftb/types`) and is the single source of truth. Every app and package imports it, so there's no copy here to drift out of date. Changes need sign-off from every owner.

---

## 10. Work split

| Person | Owns | Delivers |
|---|---|---|
| **1 — Records** | Build reusable official-record adapters and candidate/role resolution for **every applicable contest**; automate fetch, parsing, provenance and availability states. Sample across office types for QA, not hand-research selected races. Expand TLO, executive/regulatory, local and judicial adapters as available; later archive *dated* historical promises/outcomes for validation | `OfficialAction[]`, historical promise cohort + coverage reports |
| **2 — Classification & pipeline** | Primary: pole-defined issues, **both** card rubrics, golden set, cached classifiers (Jev or fallback), automated per-contest publish gates, abstain rules, pure scoring and validators. QA samples and release diffs across office types; later: deeper Plan Explorer and preregistered historical validation | `Evidence[]`, `CandidateProfile` aggregates, `@ftb/types/scoring`; owns suites B C D E G H I |
| **3 — Voice, ballot & money** | Primary: official Travis ballot and **local lookup**, candidate discovery + symmetrical queries for **all** candidates, questionnaires, speeches, campaign sites, SerpApi context, FEC/TEC where applicable. Missing-source states are explicit; later: social breadth, Meta, FCC/IRS tracing | `Source[]`, `Contest`/`ContextBrief`, `MoneyFlow[]` + coverage report · Suite A |
| **4 — App & serving** | Primary: Expo **pole/tradeoff** deck, evidence-first contest view, selectable **complete** contest list, abstain mode, unmask, local share render, offline lookup/manual fallback; minimal API. Alignment view is secondary. Later: historical-rate explainer only if validated, daily game, mascot polish, detailed Plan Explorer, opt-in PostHog | Demo + privacy/accessibility checks + Suite F instrumentation |

**Rules**
- Everyone works against **fixture JSON** in the contract from hour 0.
- **Critical path:** 1 & 3 → 2 → 4. Person 2 starts on fixture sources for one contest so integration can proceed, **then the same pipeline batches every ballot contest**. Manually audit a stratified sample of 3–5 *different office types* and all high-risk flags; do not manually curate full analyses or designate only a few races as eligible. Publish per-contest coverage and error counts. Missing sources and failed gates produce an honest automated Objective Info Mode.
- **Vertical slice first:** one race end to end before going wide.

**Milestones (event time)**
| When | Goal |
|---|---|
| H0–2 | Freeze contract, configs, fixtures, mockups |
| H2–12 | Parallel build against mocks |
| H12–16 | One contest end to end on real data |
| H16–20 | Batch all contests; inspect coverage report, spot-check varied races, fix systemic errors, friend testing; unqualified contests fall back automatically |
| H20–24 | Rehearse end-to-end demo, capture screen recording, 3 track submissions |

**Demo success:** official ballot lookup; a symmetric pole choice, a separate tradeoff choice and ⭐; evidence-first review of sourced candidates **from the general pipeline**, including one honest Clouded/Objective Info fallback; judicial or proposition flow; local reveal/share; source and correction path. Report *all-contest* coverage by office, not a claim that automation found rich data for everyone.

**If data fails:** retain verified official ballot and contest facts. A clearly labeled synthetic fixture/demo mode may demonstrate UI and mechanics, never be shown as real candidate analysis or mixed into friend metrics. No evidence → no bucket.

**Feedback/corrections:** in-app report form opens a prefilled contest/source ID without swipes or picks; store reporter-provided evidence separately, require reviewer approval, issue a new release and publish a change note. Candidates and users get the same process.

---

## 11. Before the event (non-code)

- [ ] **Rotate the exposed OpenRouter key** in Politicosmos, scrub git history and restrict database access. Never publish infrastructure addresses or credentials in this plan.
- [x] Meta Ad Library: developer account created · [ ] ID confirmation (pending) · [ ] app + long-lived `ads_read` token
- [ ] TypeSafe / Jev access (waitlist; OpenRouter lists it)
- [ ] SerpApi, OpenFEC, Google Fact Check API keys; verify the fact-check API is still live
- [ ] Confirm the Politicosmos DB still exists and has the 119th Congress
- [ ] Draft `issues.yaml`, `authority.yaml`, `sources.yaml`, card list (with tradeoffs), judicial deck, persona/mask cast (all protagonists, nothing villain-coded)
- [ ] Draft `prereg.yaml` thresholds; recruit friends for testing

---

## 12. Open decisions

| # | Decision | Status / how we decide |
|---|---|---|
| 1 | Mask party words before classification? | Suite C experiment |
| 2 | Bipartisanship: one score or two? | Component correlation in data |
| 3 | Specificity-tier ordering on? | Default off; pilot only with adequately powered fairness gates for party, incumbency and resources (Invariant 15) |
| 4 | How much specificity weighs in stance confidence | Tune on golden set; keep light |
| 5 | Bucket count / thresholds; is the middle uninformative? | Suite F + prereg rule |
| 6 | Daily game mechanic | Prototype Quote Match vs. Follow the Gold |
| 7 | Daily game data source (avoid spoilers) | Other states/past races · national figures · unlock after unmasking |
| 8 | Swipe intensity: keep ±1, or add ±2? | Currently ±1 + ⭐ salience |
| 9 | Candidate-level truthfulness score? | Default no; individual checks only, reconsider after coverage and selection-bias audit |
| 10 | X data: snippets only, or paid API for top races? | Snippet quality check |
| 11 | Corporate track picks | Proposed in §13; confirm with team |
| 12 | Offline geocoding/map size vs. manual ballot-style selector | Benchmark offline on real phones; never fall back to transmitting precise location silently |
| 13 | How to use tradeoff decisions beyond reflection | Default: keep separate from stance matching. Pilot comprehension and explicit follow-up choices before inferring any issue priority or candidate alignment |
| 14 | Exact thresholds (coverage, clarity, credibility, bucket uncertainty, fairness) | Drafts in §6; set prereg thresholds with labeled examples before looking at friends' results |
| 15 | Historical “specificity predicts follow-through” callout? | Run §6 study; decide only from preregistered coverage, reviewer agreement, uncertainty and sensitivity gates. If evidence is weak, omit numerical claim |

---

## 13. Tracks (HackTX '26)

Only target tracks where the sponsor tech does real work in the product. A forced integration costs hours and usually comes across badly in judging.

| Track | Fit | How we qualify | Owner | Cost |
|---|---|---|---|---|
| **Best Overall** | ✅ | The whole product | All | — |
| **Most Entertaining** | ✅ | Fairy Godmother, random masks, The Unmasking, Daily Challenge, share card. Make the reveal the high point of the demo | 4 | Polish |
| **Best Pitch** | ✅ | "Pick the plan before the party." Live unmasking on stage, honest coverage numbers | All | Rehearsal |
| **SerpApi** | ✅✅ | Already central: symmetric query templates for every candidate, Context Brief discovery, debate/questionnaire finding, social snippets | 3 | Already planned |
| **Meta: Bring People Closer Together With AI** | ✅ | "38% matched across the aisle": the reveal shows people that voters on the other side share their priorities. AI produces the evidence that does this. Possible stretch: **Compare with a friend**, where two people compare *issue-level* overlap locally (QR/link, no server, swipes never uploaded, per Invariant 5) | 4 + 2 | Low (framing); Med (friend compare) |
| **MLH: Best Use of Gemini API** | ✅✅ | Gemini is the pinned frontier LLM / Jev fallback in the offline pipeline: structured-output classification, plan-slot extraction, claim extraction, all behind `cached_call` and validators. Gemini embeddings are an option for retrieval/dedup | 2 | Free: we need an LLM anyway |
| **MLH: Best .Tech Domain** | ✅ | Register something like `fairytaleballot.tech` for the share-link web page and the How It Works page | 4 | ~10 min |
| **MLH: Best Use of Vultr** | ✅ | Host the thin serving API (`/ballot`, `/reveal`, `/daily`) and/or run pipeline batch jobs on a Vultr instance | 4 | Low |
| **MLH: Best Use of Tiger Data** | ✅ | Use Tiger (Timescale Postgres) instead of Supabase for release storage. Hypertables for contribution/ad-spend time series ("money over time" chart per candidate) | 3 | Low if chosen at H0 |
| **MLH: Best Use of Solana** | 🟡 | Anchor each data release's `manifestHash` on-chain (memo tx). Anyone can verify the release they saw wasn't edited afterward. This matches the frozen-release/corrections invariant and is about 2 hours of work | 2 | Low; stretch |
| **MLH: Best Use of Snowflake API** | 🟡 | Could warehouse FEC/TEC bulk CSVs. Overlaps with Tiger Data; **pick one DB story**, not both | 3 | Medium |
| **Capital One: Best Use of Nessie** | ❌ | Nessie is a mock *banking* API (customers/accounts/purchases). Campaign finance isn't banking data; any integration would be forced | — | Skip |
| **Toyota Financial Services: What's Your Next Move?** | ❌ | Personal-finance/mobility theme; no honest fit | — | Skip |
| **NMC2: Build the Platform Behind the Agent** | ❓ | We have no user-facing agent. Read the full prompt at opening; the cached/validated pipeline *might* fit if it's about agent infra/evals | — | Decide at H0 |
| **MLH: Build your A-Team with SpaceXSI** | ❓ | Read the prompt at opening | — | Decide at H0 |

**Default submission set:** Overall · Entertaining · Pitch · SerpApi · Meta · Gemini · .Tech · Vultr · Tiger Data (+ Solana if time). Check per-team submission limits for sponsor tracks at opening and trim from the bottom.

---

## 14. Repo layout (monorepo)

One **pnpm workspace** monorepo. Everyone pushes and pulls the same tree, and `@ftb/types` is the single integration contract (§9). No copied types between modules. **Keep the package count low:** put new code in an existing package before creating a new one.

```
hacktx26/
├─ apps/
│  ├─ mobile/     @ftb/mobile    Expo SDK 58 app (Person 4)
│  ├─ web/        @ftb/web       Vite + React: share-link + How It Works page (.tech domain)
│  └─ api/        @ftb/api       thin Hono serving API, deployed to Vultr
├─ packages/
│  ├─ types/      @ftb/types     §9 contract; `@ftb/types/scoring` = pure T1 scoring (on-device + pipeline)
│  ├─ records/    @ftb/records   official-record adapters / RecordProvider (Person 1)
│  ├─ scraping/   @ftb/scraping  SerpApi, ballot, questionnaires, money / SourceFinder, FinanceProvider (Person 3)
│  └─ pipeline/   @ftb/pipeline  cached_call, classify, generate, validators, publish (Person 2)
├─ config/        issues.yaml, authority.yaml, sources.yaml, prereg.yaml
├─ fixtures/      contract-shaped fixture JSON (everyone builds against this from H0)
├─ pnpm-workspace.yaml · tsconfig.base.json · vitest.config.ts · .env.example
```

**Decisions**
- **All TypeScript, including the pipeline (replaces the original Python pipeline plan).** No Python↔TS schema mirroring is needed. Use a small Python script only where TS is clearly worse (e.g. a PDF table extractor) and have it write fixture-shaped JSON.
- **Scoring lives in `@ftb/types/scoring`** (a subpath export, not its own package) because both the mobile app and the pipeline need it. It must stay pure. **Validators live in `@ftb/pipeline`**, since only publication runs them.
- **Packages are internal source packages** (`exports` → `src/*.ts`, `workspace:*` deps). There's no build step: Metro, `tsx` and Vite all import TS directly.
- **Expo + pnpm:** Expo SDK 54+ supports pnpm's default isolated installs and auto-configures Metro for monorepos (verified: iOS export bundles `@ftb/types`, expo-doctor passes). If a native library breaks, fall back to `nodeLinker: hoisted` in `pnpm-workspace.yaml`. In `apps/mobile`, add deps with `npx expo install`.
- **pnpm build scripts are allowlisted** under `allowBuilds` in `pnpm-workspace.yaml`. Approve new ones with `pnpm approve-builds <pkg>`.
- **No Turborepo.** `pnpm dev`, `pnpm typecheck`, `pnpm test` and `pnpm -F <pkg>` are enough.
- **Tooling:** one root `tsconfig.base.json` (strict), root Vitest, root Prettier. Web keeps its oxlint and mobile keeps `expo lint`.
- **Git flow:** short-lived branches per person and frequent rebases on `main`. Any PR that touches `packages/types/src/index.ts` needs a heads-up in team chat (§9 sign-off rule). Commit `pnpm-lock.yaml` and never hand-merge it; re-run `pnpm install` instead.
- **Secrets:** a single root `.env` (git-ignored, loaded by `tsx --env-file-if-exists`) plus a committed `.env.example`. No keys in the plan or repo (see §11).
