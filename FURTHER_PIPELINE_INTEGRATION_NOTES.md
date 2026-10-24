# 🧚 Further Pipeline Integration Notes: Mapping Pipeline Data to the Mobile UI

> **Reference for Mobile and API Developers (`apps/mobile` & `apps/api`):**  
> While `@ftb/pipeline` is an offline processing engine, every field in its output (`Release` JSON) is specifically designed to power the front-end UI components specified in **`PLAN.md` §2 ("Candidate Card")**.

---

## 1. Why Does the Pipeline Produce These Specific Fields?

The pipeline doesn't just extract text; it pre-computes structured metadata so the mobile app can render complex civic screens **locally without running any AI models at runtime**.

Here is the exact mapping between pipeline data fields and the front-end UI elements:

---

## 2. UI Component Mapping Table

| Pipeline Field (in `CandidateProfile`) | Type / Shape | What the Mobile App Renders (per `PLAN.md` §2) |
|---|---|---|
| **`credibility.flags`** | `CredibilityFlag[]`<br>(e.g. `kind: "beyond_power"`) | **Red Warning Alert**: Triggered when a politician promises a policy where their office has no statutory authority (checked via `config/authority.yaml`). E.g. *"Beyond Office Authority — This office has no legal power to regulate this issue."* |
| **`saysVsDoes`** | `SaysVsDoes[]`<br>(`says`, `does`, `gap`) | **"Says vs. Does" Gap Meter**: Compares questionnaire/campaign statements (`says`) against official roll-call votes (`does`). Visual bar showing divergence between words and legislative deeds. |
| **`plans`** | `Plan[]`<br>(6 slots: Goal, Mechanism, Cost, Funding, Timeline, Who Acts) | **Plan Explorer**: Renders 6 distinct policy tiles. If a candidate did not state a cost or funding source, the slot is explicitly rendered with a red **"Not Stated"** badge rather than hidden. |
| **`specificity`** | `{ score: number, tier: 0 \| 1 \| 2 }` | **Specificity Tier Badge**: Categorizes candidate proposals into: <br>• **Tier 2**: Detailed Plan ($\ge 2/3$ slots documented)<br>• **Tier 1**: Some Detail ($\ge 1/3$ slots documented)<br>• **Tier 0**: Broad / Limited Details ($< 1/3$). |
| **`funding.darkShare`** | `{ min: Prob, max?: Prob, denominator, basis }` | **"Follow the Money" Dark Money Range**: Displays documented intervals of untraceable outside spending (e.g. *"20% to 60% of outside spending comes from undisclosed donors"*). |
| **`coverage`** | `"full" \| "objective_only"` | **Objective Info Mode Badge**: When evidence is missing, displays an honest notice: *"Insufficient public records to score policy stances for this candidate."* Never hallucinates fake stances (Invariants 1 & 20). |

---

## 3. Special Contest Types & UI Flows

### A. Judicial Contests (`contest.officeKind === "judicial"`)
* **Rule (Invariant 13)**: Judges are **never scored on policy stances** (`stances: {}`).
* **Pipeline Output**: The pipeline outputs `judicialProfile.philosophy` across 4 dimensions:
  1. `text_vs_purpose` (Textualism vs. Purposivism)
  2. `restraint_vs_review` (Judicial Restraint vs. Judicial Review)
  3. `precedent` (Adherence to Precedent vs. Overruling Errors)
  4. `procedural_strictness` (Strict Procedural Bounds vs. Flexibility)
* **Mobile Handling**: When `ballot.requiresJudicialDeck === true`, the mobile app inserts the 4-card Judicial Mini-Deck into onboarding. At match time, the app calls `computeJudicialComparison()` to show legal philosophy proximity, completely decoupled from partisan politics.

---

### B. Ballot Propositions (`contest.officeKind === "measure"`)
* **Rule (Invariant 14)**: Propositions **never get an alignment score or recommendation**.
* **Pipeline Output**: The pipeline outputs verbatim `ballotText`, official `yesMeans` and `noMeans` effects, and fiscal bond principal/interest estimates.
* **Mobile Handling**: The mobile app calls `computeMeasureConnections()` to display up to 2 objective connection cards linking the voter's swipes on related issues (e.g. transit) to the bond measure's documented impact.

---

## 4. The Single Source of Truth
All data structures, types, and mathematical formulas are strictly governed by:
1. **Contract**: [`packages/types/src/index.ts`](file:///Users/rachitkakkar/Documents/root/Documents/College%20Work%20Fall%202026/HackTX/hacktx-26/packages/types/src/index.ts)
2. **Scoring Engine**: [`packages/types/src/scoring.ts`](file:///Users/rachitkakkar/Documents/root/Documents/College%20Work%20Fall%202026/HackTX/hacktx-26/packages/types/src/scoring.ts)
3. **Product Plan**: [`PLAN.md`](file:///Users/rachitkakkar/Documents/root/Documents/College%20Work%20Fall%202026/HackTX/hacktx-26/PLAN.md)
