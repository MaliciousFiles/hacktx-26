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

## 2. For Upstream Agents: Providing Inputs to the Pipeline

The pipeline does **not** scrape web pages or download government XMLs directly. It receives strongly typed objects from `@ftb/records` and `@ftb/scraping`.

### A. `@ftb/records` (Official Actions / Person 1)
Your module pulls roll-call votes, signed/vetoed bills, and local council votes.

* **Interface to implement**: `RecordProvider` in `packages/records/src/index.ts`
* **Output to produce**: `OfficialAction[]`

```ts
import type { OfficialAction } from "@ftb/types";

export interface OfficialAction {
  id: string;               // e.g. "act-hb1234-vote"
  actorId: string;          // candidateId
  issueIds: string[];       // e.g. ["housing.zoning"] (from config/issues.yaml)
  role: string;             // e.g. "TX House D49"
  body?: string;            // e.g. "Texas House of Representatives"
  type: "floor_vote" | "committee_vote" | "authored" | "signed" | "vetoed" | ...;
  stance: "yes" | "no" | "abstain" | "author";
  margin?: { yes: number; no: number }; // Contested votes (minority >= 10%) weigh 1.5x
  date: string;             // ISO "2025-05-12"
  title: string;            // "HB 1234 - Multifamily Transit Zoning"
  officialText: string;     // HRO bill analysis, order summary
  sourceUrl: string;        // e.g. "https://capitol.texas.gov/..."
}
```

> **Pipeline Invariant 12**: Contested roll-call votes are weighted twice as heavily as campaign speeches. If `margin` shows a contested vote, its weight increases further.

---

### B. `@ftb/scraping` (Voice, Context & Money / Person 3)
Your module queries SerpApi, candidate questionnaires (VOTE411, Texas Tribune, KUT), campaign sites, and campaign finance APIs (FEC/TEC).

* **Interfaces to implement**: `SourceFinder` & `FinanceProvider` in `packages/scraping/src/index.ts`
* **Outputs to produce**: `Source[]` and `MoneyFlow[]`

#### 1. Sources (`Source[]`)
```ts
import type { Source } from "@ftb/types";

export interface Source {
  id: string;               // e.g. "src-vote411-hinojosa"
  contestId: string;        // e.g. "contest-tx-house-49"
  candidateId?: string;     // e.g. "cand-hinojosa" (if candidate statement)
  type: "questionnaire" | "debate_speech" | "campaign_site" | "news" | "social_post";
  url: string;              // Source URL
  outlet?: string;          // e.g. "vote411", "texas_tribune" (from config/sources.yaml)
  fetchedAt: string;        // ISO "2026-10-24" — when we fetched it, NOT when it was said
  eventDate: EventDate;     // { date?, basis, precision } — when it was said and how we know (PLAN.md §5 "Dates")
  contentHash: string;      // sha256(originalText)
  originalText: string;     // RAW, untouched text from the site (used for UTF-16 quote validation)
  text: string;             // Cleaned/normalized text
}
```

> **Pipeline Invariant 3**: `originalText` must be untouched. The pipeline validates that quotes extracted by models are exact character-for-character substrings of `originalText`.

#### 2. Campaign Finance (`MoneyFlow[]`)
```ts
import type { MoneyFlow } from "@ftb/types";

export interface MoneyFlow {
  id: string;
  from: string;             // Entity ID (donor, PAC, c4)
  to: string;               // Committee / Candidate ID
  kind: "contribution" | "transfer" | "independent_expenditure" | "ad_buy";
  amount: { min: number; max: number }; // Meta/Google ads use ranges; exact donations have min === max
  date: string;
  supports?: string;        // candidateId
  opposes?: string;
  sourceUrl: string;        // FEC / TEC filing URL
}
```

The pipeline aggregates `MoneyFlow[]` into a `FundingMap` and calculates the outside spending dark-money interval:
$$\text{DarkShare} = \left[\frac{\text{Dark}_{\min}}{\text{Outside}_{\max}}, \frac{\text{Dark}_{\max}}{\text{Outside}_{\min}}\right]$$

---

## 3. For Downstream Agents: Consuming Pipeline Output

### A. `@ftb/api` (Serving API / Person 4)
The serving API does **NOT** call AI models. It serves the frozen JSON files published by `@ftb/pipeline`:

* **Release file location**: `packages/pipeline/dist/releases/*.json` (or `fixtures/release-fixture.json` during development)
* **Routes to implement in `apps/api/src/index.ts`**:

```ts
// GET /ballot?ballotStyleId=...&releaseId=...
app.get("/ballot", (c) => {
  // 1. Read the requested release file from disk / storage
  // 2. Return { release, ballot, contests, candidates, cards, citations }
});

// GET /reveal/:contestId?releaseId=...
app.get("/reveal/:contestId", (c) => {
  // Returns candidate identity mapping only when the user taps Reveal:
  // { releaseId, contestId, identities: [{ id, name, party, photoUrl, website }] }
});
```

> **Pipeline Invariant 7**: The `/ballot` response contains **zero** candidate names, party labels, or donor identities. Names are only returned by `/reveal`.

---

### B. `@ftb/mobile` (Expo App / Person 4)
The mobile app computes matches **on-device** using pure functions from `@ftb/types/scoring`. No user swipes or GPS coordinates are ever sent to a server.

```ts
import {
  computeUserVector,
  computeContestMatch,
  computeJudicialComparison
} from "@ftb/types/scoring";

// 1. Convert user's card swipes into a stance vector
const userVector = computeUserVector(swipes, ballotData.cards, salienceWeights);

// 2. Score legislative/executive contests
const matchResult = computeContestMatch(userVector, contest, ballotData.candidates);
// Returns alignment bucket: "happily_ever_after" | "good_company" | "different_paths" | "worlds_apart"

// 3. Score judicial contests (Invariant 13: Judges are NEVER scored on policy!)
if (contest.officeKind === "judicial") {
  const judicialComp = computeJudicialComparison(userVector, contest.id, ballotData.candidates);
  // Returns proximity on 4 dimensions: text_vs_purpose, restraint_vs_review, precedent, procedural_strictness
}
```

---

## 4. Pipeline Execution Command

To run the pipeline and generate a new published release:

```sh
pnpm -F @ftb/pipeline start
```

This compiles, classifies, validates, and seals the output into `packages/pipeline/dist/releases/{releaseId}.json`.
