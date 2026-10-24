# 🧚 Fairy Tale Ballot — Pipeline Integration Guide

> **For agents and teammates working on `@ftb/scraping`, `@ftb/records`, `@ftb/api`, and `@ftb/mobile`:**
> This document defines the exact contract, input interfaces, and output formats to plug your modules into the offline data pipeline (`@ftb/pipeline`).

---

## 1. Architecture Overview

```
 ┌──────────────────────┐         ┌──────────────────────┐
 │   @ftb/records       │         │    @ftb/scraping     │
 │  (OfficialAction[])  │         │(Source[], MoneyFlow[])
 └──────────┬───────────┘         └──────────┬───────────┘
            │                                │
            └───────────────┬────────────────┘
                            │
                            ▼
              ┌───────────────────────────┐
              │      @ftb/pipeline        │
              │  (Offline 7-stage engine) │
              └─────────────┬─────────────┘
                            │
                            ▼ Publishes frozen release artifact
              ┌───────────────────────────┐
              │ dist/releases/*.json      │
              └─────────────┬─────────────┘
                            │
                            ▼
              ┌───────────────────────────┐
              │         @ftb/api          │
              │ (GET /ballot, GET /reveal)│
              └─────────────┬─────────────┘
                            │
                            ▼
              ┌───────────────────────────┐
              │       @ftb/mobile         │
              │  (Uses @ftb/types/scoring)│
              └───────────────────────────┘
```

---

## 2. Inputs to the Pipeline

The inputs are raw, uncurated data produced by the scraping and official records packages:

| Input Object | What it contains | Where it comes from |
|---|---|---|
| **`Source[]`** | Raw text from questionnaires (VOTE411, Texas Tribune), campaign websites, debate transcripts, and news articles. Contains the full `originalText`, date, URL, and outlet. | `packages/scraping` (via SerpApi / web fetchers) |
| **`OfficialAction[]`** | Real government voting records, bill sponsorship, and votes (e.g. "Voted YES on HB 1234, margin 85-60"). | `packages/records` (via Texas Legislature Online & City Council minutes) |
| **`MoneyFlow[]`** | Direct campaign contributions, PAC transfers, and independent outside ad spending. | `packages/scraping` (via FEC & Texas Ethics Commission) |
| **`Contest[]`** | The list of races and ballot propositions for the election (e.g. State Rep District 49, Austin Prop A). | VoteTravis county election data |
| **Config files** | `issues.yaml` (issue axes), `authority.yaml` (legal office powers), `sources.yaml` (trusted media list). | `config/` directory |

### How Scraped Text is Converted into Typed Objects
Here is an example (from `test-live-ai.ts`) showing how raw text from a website is structured by `@ftb/scraping` before handing it to the pipeline:

```ts
// 1. Raw candidate speech (e.g., from a real questionnaire on housing in Austin)
const candidateRawText =
  "Representative Gina Hinojosa stated: We must reform municipal zoning to allow multifamily housing " +
  "near major transit corridors by right. High housing costs are pushing working families out of central Austin. " +
  "I sponsored HB 1234 to cut red tape and incentivize private builders without public subsidies.";

const source: Source = {
  id: "src-live-test-1",
  contestId: "contest-tx-house-49",
  candidateId: "cand-hinojosa",
  type: "questionnaire",
  url: "https://apps.texastribune.org/features/2026/texas-voter-guide/",
  outlet: "texas_tribune",
  fetchedAt: "2026-10-24",
  contentHash: "hash-live-test",
  originalText: candidateRawText, // MUST be untouched for UTF-16 quote verification
  text: candidateRawText,
};
```

---

## 3. What the Pipeline Does

The pipeline turns noisy, biased raw web text into clean, cited, masked data through 7 stages:

1. **Deduplicates**: Two news outlets repeating the exact same wire story count as 1 source, not 2 (`(url, contentHash)` deduplication).
2. **Masks**: Redacts names and party affiliations into an auditable `ClassificationInput` so AI models evaluate policy positions objectively without party bias.
3. **Classifies with JEV**: Scores where the candidate stands on a `-1.0` to `+1.0` scale for each issue axis with full probability distributions.
4. **Compares Words vs. Deeds**: Checks if how a politician voted in the legislature matches what they say on their campaign site (computes Says vs. Does gaps and dark-money spending ratios).
5. **Generates Plans with Gemini**: Summarizes candidate proposals into 6 slots (*Goal, Mechanism, Cost, Funding, Timeline, Who Acts*).
6. **Validates Deterministically**:
   * Drops any generated sentence that doesn't cite an exact quote.
   * Checks quotes character-for-character against the original source text (`validateQuote`).
   * **Leak Gate (`identityLeakGate`)**: Rejects the release if any real candidate name, party name, or donor name accidentally slipped into the text.
7. **Publishes Release**: Assembles the snapshot and cryptographically seals it with a canonical SHA-256 `manifestHash`.

---

## 4. Output of the Pipeline

The output is **one versioned, frozen JSON file** (e.g., `dist/releases/release-v1.json`) containing:

| Output Field | What it looks like / What it contains |
|---|---|
| **`release`** | Release ID (e.g. `"data-v1"`), as-of date, and a cryptographic `manifestHash` proving the data wasn't modified after publishing. |
| **`ballot`** | The ballot style ID and the list of contest IDs a voter in that precinct will see, plus `requiresJudicialDeck`. |
| **`contests`** | Each race on the ballot, official job description, and neutral context briefs (what supporters say vs. what opponents say). |
| **`candidates`** | **Masked candidate profiles (`CandidateProfile[]`)**:<br>• Stances on each issue (`-1.0` to `+1.0`) with evidence strength.<br>• Platform highlights cited with evidence.<br>• Plan breakdown with a specificity score (0% to 100%).<br>• Says vs. Does gap score.<br>• Follow the money: direct vs. dark outside money ranges.<br>• **NO names, NO parties, NO photos, NO donor names.** |
| **`cards`** | The interactive swipe cards (`PoleCard`, `TradeoffCard`, `JudicialCard`) that the voter will swipe through on their phone. |
| **`citations`** | Every verified quote and citation referenced by the candidates. |

---

## 5. How the App Uses This Output

* **`apps/api`**: Loads this output file and simply serves it statically over HTTP (`GET /ballot`). **Zero AI model calls happen when a user uses the app.**
* **`apps/mobile`**:
  1. Downloads the masked profiles and cards.
  2. The voter swipes through the cards.
  3. The phone calculates the user's score locally using `@ftb/types/scoring`.
  4. The user inspects candidate plans and quotes completely blind to party or identity.
  5. The voter taps "Reveal" at the end, and the phone calls `GET /reveal/:contestId` to finally show who the candidates were.

---

## 6. Contest Types & The Release Fixture

A real Travis County ballot does not just contain one kind of race. Voters face three fundamentally different choices, and the app handles each with completely different rules:

| Contest | Type | What is on the ballot | How the app handles it |
|---|---|---|---|
| **`contest-candidate-1`** | **Legislative / Executive Race** (e.g. TX House D-49) | Two or more human politicians (`cand-a`, `cand-b`) competing for one seat. | Evaluated on **policy stances** (housing, taxes, education), plan specificity, campaign money, and "Says vs. Does" voting record gaps. |
| **`contest-measure-1`** | **Ballot Proposition / Bond** (e.g. Austin Prop A: $350M Bond) | **No candidates.** Just a policy proposal to vote YES or NO on. | Evaluated on **verbatim legal ballot text**, what YES means vs. what NO means, and financial debt/interest impact. **Never gets an alignment score or recommendation** (Invariant 14). |
| **`contest-judicial-1`** | **Judicial Race** (e.g. 201st District Court Judge) | Two attorneys/judges (`judge-a`, `judge-b`) running for judge. | **Judges are NEVER scored on policy issues** (Invariant 13). Their `stances` are empty. Instead, they are evaluated on **judicial philosophy** (textualism, precedent) and objective qualifications (years licensed, board certification, Austin Bar ratings). |

### What is `"requiresJudicialDeck": true`?
When a voter's ballot contains a contested judicial race, the ballot sets `"requiresJudicialDeck": true`. 
The mobile app sees this flag and inserts the 4-card **Judicial Philosophy Mini-Deck** (`JudicialCard[]`) into the onboarding flow:
* **Text vs. Purpose**: Literal statutory text vs. legislative purpose.
* **Restraint vs. Review**: Deferring to lawmakers vs. active judicial review.
* **Precedent**: Adhering to past rulings vs. willingness to overturn errors.
* **Procedural Strictness**: Strict procedural rules vs. flexible justice.

This builds a separate **Judicial Vector** so voters evaluate judges on legal interpretation rather than partisan policy.

---

## 7. Configuration Files Reference

The pipeline relies on three versioned configuration files in `config/`:
1. **`config/issues.yaml`**: The hierarchical taxonomy of policy axes (e.g., `housing.zoning`, `economy.taxation`, `safety.policing`) with balanced, neutrally worded negative and positive poles.
2. **`config/authority.yaml`**: The legal power matrix mapping each office to its actual legal jurisdiction (`direct`, `influence`, or `none`). Used to flag candidates promising things beyond their office's authority.
3. **`config/sources.yaml`**: The media allowlist specifying vetted questionnaire providers (VOTE411, Texas Tribune, KUT), local news outlets, and IFCN fact-checkers.

---

## 8. Pipeline Execution Commands

```sh
# Run the pipeline to validate and publish releases
pnpm -F @ftb/pipeline start

# Run live AI pipeline test with real Gemini/JEV keys
export GEMINI_API_KEY="your-gemini-key"
pnpm -F @ftb/pipeline exec tsx src/test-live-ai.ts

# Run all test suites
pnpm test
```
