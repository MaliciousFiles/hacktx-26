# Records research: sources, formats and implementation boundaries

> **Status, 2026-10-24:** wave-1 structured + wave-2/3 official HTML/PDF adapters under §8’s structured-first gate (TX journals, TLO, judicial, AG/governor/register, config-driven `official-minutes`, VoteTravis reference). Cheap LLM minutes fallback is optional (`EXTRACT_LLM_*`), span-validated, pipeline-only.
> Observations below combine live checks by the parent session and source-research agents on 2026-10-24; unverified exports and discovery-only leads are labeled. A successful request does not establish completeness or current vote coverage.
> **Scope remains the full vertical:** every contest and every candidate, including federal, state, judicial, county, city, school and special districts, plus propositions handled by the ballot pipeline. Travis County, November 2026 is the first tuned target, not a hardcoded limit. Build order never reduces coverage; missing evidence produces an explicit gap / Objective Info Mode, not an invented individual action or a promise that every source is already built.

## 0. TL;DR

1. **Records follow the person.** The requested position is the office sought; verified actions in earlier offices remain eligible. Do not filter a person's history to the new office or district.
2. **TLO bill-history XML** provides authorship, sponsorship, actions and committee vote totals. The inspected XML does not provide individual floor choices. Official House/Senate journals are the identified document route; each needs source-specific approval.
3. **Official structured Senate member votes do exist in GovInfo CREC MODS XML.** GovInfo's JSON summaries omit these roles; the earlier conclusion based on JSON/prose was wrong. Use House Clerk XML for House votes and GovInfo MODS for Senate votes (§3.2), without a Voteview default or anti-bot bypass.
4. **Local structured votes exist, but coverage varies.** Austin Socrata, Travis CivicClerk and some Legistar records expose member choices. Recent agendas do not establish recent finalized votes; Round Rock has a freshness gap to investigate.
5. **Official Texas judicial PDFs exist.** Research the official TAMES index and opinion PDFs first, with separate source approvals. CourtListener is not an approved default. GovInfo USCOURTS concerns participating federal courts, not Texas state opinions.
6. **County and special-district structured data often describes bodies, not decisions by people.** TCJS/OCA statistics, district registries and bond-election data are useful context, but cannot be converted into individual votes or causal performance claims (§3.6).
7. **Ownership is settled:** pipeline owns `(location, month, year) → ballot`, then calls both records and scraping with `CandidateResearchRequest`. Records does not discover the ballot. Lookup must resolve an official election-specific ballot style or use PLAN's official/manual fallback (§6).

Settled approvals and the remaining **per-source** approval backlog are in §8.

---

## 1. Design principles

- **Structured first:** official API → official bulk XML/JSON/CSV/XLSX → official RSS. Discovering an HTML/PDF source is allowed; production parsing requires explicit approval for that source, not a blanket policy or approval of an entire platform.
- **Official over third-party:** use government IDs, indexes and documents first. OpenStates may be an ID crosswalk only if truly necessary. CourtListener and Voteview are not approved default transports or fallbacks.
- **Provenance on every action:** official source URL, immutable raw snapshot, `fetchedAt`, content hash, adapter/version, extraction format and source locator. Document extraction additionally needs exact text spans and page/context attribution.
- **Polite fetching:** bounded concurrency, retries/backoff, conditional requests and a frozen raw cache. Use TLO's bulk/FTP route where appropriate rather than aggressive site scraping; respect access controls. A block is an availability state, not permission to bypass anti-bot systems.
- **Source/platform adapters, jurisdiction config:** tenant IDs, dataset IDs, court codes, board identifiers, official URLs, roster evidence and date coverage belong in configuration. One platform parser does not prove every tenant publishes votes.
- **Attribution before inference:** totals, attendance, a signature, a motion, a speech and an individual vote are different facts. Never assign an unlisted member a vote or absence merely from a roster or aggregate tally.
- **Absence ≠ evidence:** distinguish unconfigured, unavailable, stale, incomplete and unresolved-identity sources from a verified empty result. Agency activity during someone's term is not proof of that person's choice or its causal effect.

## 2. Coverage follows prior roles, not a curated candidate list

Earlier candidate/race notes came from news voter guides and Ballotpedia, not a verified election manifest. They must not seed the ballot, determine incumbency or justify claims that an office has no relevant candidates. The pipeline supplies the official candidate/contest inventory; records verifies identity and prior roles symmetrically for every supplied candidate.

Examples of historical-source needs, **not an authoritative November 2026 candidate list**:

| Person / office family | Historical records to investigate | Source implications |
|---|---|---|
| Greg Casar | US House; Austin Council 2015–2022 | Federal structured sources; Austin history predates the inspected Socrata dataset |
| Sarah Eckhardt | TX Senate; Travis County Judge 2015–2020 | TLO/journals; pre-CivicClerk Commissioners Court archive |
| Officials seeking a different statewide office | Earlier legislature, executive, local or judicial service | Verify each tenure; do not restrict history to the office sought |
| Appellate and trial judges | Opinions, orders, credentials and appropriately scoped court statistics | Judicial evidence, never policy scoring; thin evidence → objective information |
| County row offices, JPs, constables | Office-specific records and prior roles | Explicit adapter/research gaps where individual decisions have not been located |
| School/college, MUD/WCID, appraisal and other district boards | Their own and prior offices' records | Platform-specific minutes research; no exclusion because records are PDFs or a contest is uncontested |

All office families remain in scope regardless of whether their adapters are in the first implementation. The election's official manifest, not assumptions about likely candidates or appointed boards, determines eligible contests.

## 3. Source catalog by office type

“Structured” describes a format, not completeness, attribution quality or implementation status. HTML/PDF entries below are either **approved under §8’s structured-first gate** or still pending; never prefer them when an official structured bulk already has the needed fields.

### 3.1 Texas Legislature

| Source | Provides / format | Status and limitations |
|---|---|---|
| **TLO FTP bill history** `ftp://ftp.legis.state.tx.us/bills/{sess}/billhistory/{house_bills\|senate_bills}/HB00001_HB00099/HB 2.xml` | XML: caption, authors/coauthors, sponsors/cosponsors, committees, aye/nay/PNV/absent **totals**, action codes, `RV#` references, subjects, companions and document URLs | Structured adapter in progress. Observed sessions include `71R` through `89R`, `891`, `892`; filenames can contain spaces, BOM and M/D/YYYY dates. Node `fetch` does not handle FTP; transport must match the official route |
| TLO HRO/SRC analyses `analysis/html/`, fiscal notes | Official document text for later interpretation/classification | **Approved** under §8 gate (no analysis bulk). Use as `officialText`/context only — not a vote |
| TLO `reports/author/index.htm` and official member rosters | Per-session author/member codes, e.g. `Alders (H-A4395)` | **Approved** identity crosswalk under §8 gate; prefer supplied verified IDs when already known |
| **House Journal** `https://journals.house.texas.gov/hjrnl/89r/html/89RDAY43FINAL.HTM` | XHTML record votes, e.g. `(Record 158)` and named Yeas/Nays | **Approved** under §8 gate. Match record number, bill/motion and date, not just nearby text |
| **Senate Journal** `https://journals.senate.texas.gov/sjrnl/89r/html/…` | XHTML; inspected entries sometimes name only the minority side | **Approved** under §8 gate. Do not infer other senators from a roster alone |
| Legislative Reference Library `memberDisplay.cfm?memberID=N` | Official person IDs and historical terms | **Approved** identity/term evidence under §8 gate |
| OpenStates/Plural TX | Community people YAML / `ocd-person` IDs | Only a necessary ID crosswalk, not the default vote provider or a substitute for official IDs |

Confirm veto and filed-without-signature action-code mappings against known official examples; do not label every enactment a signature. House journal labels such as `Bell, C.` differ from XML labels such as `Bell, Cecil`, requiring verified session-specific identity evidence. Inspected FTP journal coverage stopped at 83R; newer journal-site documents are a separate approval/coverage item. These findings do not establish that no other structured source exists anywhere.

### 3.2 Federal

| Source | Provides / format | Status and limitations |
|---|---|---|
| **House Clerk member list** `https://clerk.house.gov/xml/lists/MemberData.xml` | No-key XML, `MemberData/members/member/member-info`: `bioguideID`, `official-name`, state `@postal-code`, district | Verified official current-House identity source; resolver in progress. Current membership is not a complete historical roster (§5) |
| **House Clerk roll calls** `https://clerk.house.gov/evs/{year}/roll{NNN}.xml` | XML question, vote type/result, totals and member choice by bioguide `name-id` | Primary House vote adapter in progress. Preserve the actual question: cloture/amendment/procedural votes are not final passage |
| **GovInfo CREC granule MODS** `https://www.govinfo.gov/metadata/granule/{packageId}/{granuleId}/mods.xml` | Official XML with `congVote` totals and nested `congMember` IDs/roles | Primary accessible Senate member-vote route in progress; verified example and validation requirements below |
| **GovInfo BILLSTATUS** `https://www.govinfo.gov/bulkdata/BILLSTATUS/{c}/{type}/BILLSTATUS-{c}{type}{n}.xml`; listing `/bulkdata/json/BILLSTATUS/{c}/{type}` | XML sponsors/cosponsors by bioguide, actions, CRS summaries, enactment/veto metadata and `<recordedVote>` links | Adapter in progress. **Vote links and metadata are not per-member choices**; resolve them through the vote sources above |
| **Congress.gov API v3** `https://api.congress.gov/v3` | JSON `/member/{bioguide}`, sponsored/cosponsored legislation, bill actions; `/house-vote/{c}/{session}/{roll}/members` has `voteCast` and bioguide IDs | Verified research route; free API key. Useful member/history lookup and House vote access, not a promise this entire API adapter is implemented |
| Senate LIS `https://www.senate.gov/legislative/LIS/roll_call_votes/vote{c}{s}/vote_{c}_{s}_{NNNNN}.xml`; floor activity `…/LIS/floor_activity/MM_DD_YYYY_Senate_Floor.xml` | Official per-senator XML using LIS IDs / floor log | Direct requests encountered WAF/403 responses. Official MODS avoids making blocked LIS access a prerequisite; no bypass deployment authorized |
| House floor proceedings `https://clerk.house.gov/floor/YYYYMMDD.xml` | XML timestamps, narrative actions and `act-id` codes | Optional context; voice/body actions do not prove an individual's vote |
| GovInfo BILLS | Official bill text, including successive versions `ih/is`, `rh/rs`, `eh/es`, `enr` | Planned detail source if summaries are insufficient; use the text/version corresponding to the action |
| Federal Register API | Structured presidential executive-order metadata | Planned source when applicable; office scope is not limited to the current election |
| `https://github.com/unitedstates/congress-legislators` | Community bioguide/LIS/FEC crosswalk | Research aid if an official identifier mapping is unavailable; not the primary identity source |

**Verified Senate MODS discovery (corrects earlier research):**

- The parent fetched HTTP 200 without a key on 2026-10-24: <https://www.govinfo.gov/metadata/granule/CREC-2025-07-23/CREC-2025-07-23-pt1-PgS4581-2/mods.xml>.
- Free-key API equivalent: <https://api.govinfo.gov/packages/CREC-2025-07-23/granules/CREC-2025-07-23-pt1-PgS4581-2/mods>.
- The MODS root uses `http://www.loc.gov/mods/v3`. Its extension includes `granuleDate=2025-07-23` and `congVote` attributes `chamber=SENATE`, `congress=119`, `number=426`, `yescount=52`, `nocount=41`, `nvcount=7`.
- Nested `congMember` entries contain `@bioGuideId`, full names, and `@role` values including `VOTED YES`, `VOTED NO`, `NOT VOTING - NV`; Texas members include Cornyn `C001056` and Cruz `C001098`. **Members/speakers outside that `congVote` are not voters in that roll call.**
- Parse all vote blocks independently: a granule can contain multiple votes. Reconcile member-role counts with declared totals, preserve not-voting separately from absence, and verify the actual vote date rather than assuming the Congressional Record document date is identical. An example proves availability, not complete coverage of every Congress/date.
- GovInfo's JSON granule summary omits these vote roles. The official [Congressional Record help](https://www.govinfo.gov/help/crec) documents `votenumber`, `memberyes`, and `memberno` search metadata. Package/granule API indexes and bulk package ZIPs provide official discovery/backfill routes; fetch and cache MODS, not only summary JSON.

**Access and reuse boundaries:**

- The Senate WAF cause is **not conclusively IP alone**. Network/client fingerprints may matter; failed header experiments do not prove headers can never matter. No host/proxy bypass is needed for the verified GovInfo route or authorized here.
- [unitedstates/congress `vote_info.py`](https://raw.githubusercontent.com/unitedstates/congress/main/congress/tasks/vote_info.py) itself fetches Senate LIS XML. It offers parsing practices, **not an independent official mirror**. Voteview is not an approved default/fallback.
- Congress.gov HTML returned blocks in the inspected requests; use the official API/bulk routes. Politicosmos endpoint notes are leads, not reusable official records: a loader was not found in the inspected repo, and inspected summary artifacts included robots/block-page text without adequate provenance. Do not reuse those model outputs. Exposed historical credentials require rotation per PLAN §11; do not reproduce them.
- Undocumented House live-proxy and bioguide search backends are unnecessary while official Clerk/Congress.gov routes serve the need. Party fields must not enter stance/matching; party-aware record analysis is restricted to the uses allowed by PLAN invariant 6, including bipartisanship.

### 3.3 Statewide executive and agencies

| Office/source | Identified official route | Attribution and status |
|---|---|---|
| **Governor bill actions** | TLO XML; supplemental `reports/{signedbygov,vetoedbygov,filedwogovsign}.htm` | Structured TLO work in progress. Establish the officeholder's tenure and distinguish signed, vetoed and filed without signature; supplemental HTML is not approved |
| Governor executive orders | LRL index → `https://gov.texas.gov/` PDFs | Official index/PDF parser approvals pending; a dated order is not a yes/no vote |
| Governor proclamations/appointments | Texas Register “The Governor” section | HTML source approval pending; verify the named actor/action |
| **AG opinions** | `https://www.texasattorneygeneral.gov/opinions/ken-paxton/kp-NNNN` and PDFs; Texas Register “Attorney General” section | Source approvals pending. Office-tenure attribution must be evidenced; no invented yes/no stance |
| AG litigation/amicus | Official filings/orders where obtainable; office press releases as discovery leads | Research gap for systematic retrieval, not proof that filings do not exist. HTML/PDF approvals pending; a press release is not itself proof of every claimed personal legal action |
| Lt. Governor | Senate Journal rulings/tie-breaks, interim-charge PDFs | Separate source approval and explicit actor evidence required; presiding is not voting |
| Railroad Commission | Conference minutes PDFs found for roughly 2014–2021; signed final orders and other later material | Minutes/order parsing pending approval. Later minutes were not located in the inspected paths, **not proven absent everywhere**; signature and individual vote must be distinguished |
| SBOE | Official minutes PDFs, including 2020–2026 research examples | Approval pending. Split totals may lack member names; keep body context separate from named roll calls |
| GLO School Land Board | Official minutes PDFs | Approval pending. A stand-in's signature or unanimous body tally does not establish the candidate's personal choice |
| Comptroller / TDA | Official agency/GovDelivery RSS, Texas Register rules and releases | Planned research/adapter coverage. RSS can identify documents; agency output is not automatically the officeholder's individual action |
| Texas Register | Weekly RSS → issue HTML with section headings | Shared discovery route; HTML production parser still requires source approval and agency/person attribution |
| SOS Open Meetings | Official Appian app; UNT daily HTML mirror as a research lead | Notices identify meetings, not completed decisions or votes |

The inspected agency sources did not establish a comprehensive structured member-vote feed. This is a research/adapter gap, not a scope exclusion. For a verified non-vote executive action use `stance: "n/a"` and no invented margin; where attribution is only to the agency, retain agency-level context rather than fabricating an `OfficialAction` for a person.

### 3.4 Local governments: source/platform configuration

| Platform | Jurisdiction/config leads | Access, coverage and approval boundary |
|---|---|---|
| **Socrata** | Austin Council `https://datahub.austintexas.gov/resource/3c89-i35a.json` | Structured adapter in progress. `voter_name`, `vote_cast`; inspected data had about 76k rows from 2023-01 through 2026-08, so freshness and pre-2023 coverage require reporting |
| **CivicClerk** | Travis `https://traviscotx.api.civicclerk.com/v1/Events`, `/Meetings/{agendaId}` | Structured adapter in progress; inspected coverage begins around 2021. `minutesItemVotes` includes yes/no/abstain lists, initiator and seconder. Unlisted members are not automatically absent, and moving/seconding is not voting yes |
| **Legistar** | Round Rock, Pflugerville; Austin tenant `austintexas` | Structured adapter in progress; votes depend on tenant/event data. Austin's inspected records supplied agenda metadata, not member votes. Round Rock has recent agendas, but the latest finalized vote noticed was in 2024; investigate freshness rather than claiming current vote coverage |
| Diligent Community | Austin ISD since July 2026 in inspected material; Eanes ISD; Bee Cave | Meeting-list JSON can aid discovery; choices are often in HTML/minutes text. Each jurisdiction's HTML/PDF source remains pending approval |
| BoardDocs | Round Rock ISD; Austin ISD archive | RRISD meeting-list API JSON was accessible and minutes were HTML. An earlier 403 is **not universal**. Discover/configure each endpoint; HTML production parsing remains pending approval |
| BoardBook | Leander organization `795`; Del Valle `675`; Manor `938`; Lake Travis `900`; Pflugerville ISD (tenant ID still to verify) | Five ISD research leads. HTML/PDF minutes; approvals required per source, not a blanket BoardBook approval |
| Granicus IQM2 | Travis Commissioners Court archive before 2021 | HTML archive lead; inspected RSS was empty. Source approval and archive completeness checks pending |
| CivicClerk (additional tenant) | West Lake Hills current platform | Tenant/config and actual member-vote coverage still need validation; Travis support does not imply this tenant is covered |
| CivicWeb | Lakeway | HTML/PDF route; source approval pending |
| CivicPlus AgendaCenter | Lago Vista, Jonestown, Rollingwood, Cedar Park | RSS can aid discovery but was sometimes empty; agenda/minutes PDFs require individual source approvals |
| Municode | Manor city | Platform lead unverified; do not confuse with Manor ISD's BoardBook configuration |
| Laserfiche / own site | Sunset Valley | Research encountered 403; availability/config unresolved, no bypass authorized |
| Official PDF pages | ACC; Lago Vista ISD own-PDF lead (unverified) | ACC document route identified; parser approval pending. Lago Vista ISD still needs verification, separate from the city's AgendaCenter |

Platform configuration must record the official publishing link, tenant/organization ID, endpoint/document format, roster/term evidence, earliest/latest **finalized member votes**, pagination, and approval state. A working meeting-list API or RSS feed is discovery, not proof that votes are structured or current. City/ISD/district names must be disambiguated.

**Vote normalization and weight:**

- Preserve raw values, question/motion, named voters, present/not-voting/abstain/recused distinctions and explicit consent metadata. Absent/off-dais/withdrawn/no-action are not opposition votes.
- Austin items can be grouped by `item_id`; CivicClerk lists and Legistar `VoteValueName` can identify named yes/no choices. A body tally such as “Motion Carried 7-0” cannot assign seven personal votes without appropriate individual evidence.
- `EventItemConsent=1` or an explicit “Consent Motion” can mark consent; unanimity alone does not prove the item was on a consent agenda.
- A dissent/abstention is a useful review signal, not automatically PLAN's weighted “contested” definition. Only yes/no choices enter its denominator; keep the draft threshold in versioned scoring configuration. Unanimous/consent actions weigh approximately zero.
- Pull multiple years where available, with the fixed election cutoff (§7); report lag and gaps instead of manufacturing signal.

### 3.5 Judicial: official indexes and PDFs first

| Source | Provides / format | Status and limitations |
|---|---|---|
| **Third Court of Appeals official site** `https://www.txcourts.gov/3rdcoa/` → [Released Orders & Opinions](https://search.txcourts.gov/DocketSrch.aspx?coa=coa03) | Official TAMES index, plus CaseSearch/Events links | Live-verified discovery. Index HTML **approved** under §8 gate (no structured Texas opinion bulk) |
| **TAMES official media** `https://search.txcourts.gov/SearchMedia.aspx?MediaVersionID=…` | Official opinion/order PDFs | **Approved** primary document route under §8 gate; CourtListener stays unapproved |
| **SCOTX Orders & Opinions** `https://www.txcourts.gov/supreme/orders-opinions/` | Weekly/released orders index → linked opinion/order PDFs and author/disposition statements | **Approved** under §8 gate. This is the SCOTX hub; “Orders Pronounced” is the same official stream |
| OCA `coa-opinion-summary-2025.xlsx` | Official per-justice opinion counts/types, including Third and Fifteenth COA | Planned structured completeness/context source. Counts alone do not identify an opinion's reasoning or individual policy position |
| OCA district/county XLSX and `https://card.txcourts.gov/` | Court-level filings/dispositions/backlog and other reporting | Planned objective context. Crystal report export parameters were identified; Power BI exports remain unverified. A court may have multiple judges or changing assignments |
| State Commission on Judicial Conduct | Named sanctions and linked official orders | **Approved** under §8 gate; attach the actual action, date and named subject |
| Austin Bar poll; TBLS / State Bar | Preference poll and professional credentials | Objective context, not judicial decisions. Manual-entry workflow/source verification remains to settle; no CAPTCHA bypass or automatic preference-as-quality inference |
| GovInfo USCOURTS | Opinions from participating **federal** courts | Possible federal judicial source; **not a source of Texas state-court opinions** |
| CourtListener bulk/REST | Third-party opinion copies and metadata; official `download_url` may help spot-checking | **Not an approved default.** No need to assume third-party transport merely because the official route uses PDFs; any later use needs a separate decision |
| Travis Odyssey portals | Access-controlled trial-court research lead | Automated access/export unverified; keep an explicit source gap rather than bypassing controls |

Author/join/dissent attribution must come from explicit official document evidence, not just a judge's tenure, case assignment or presence on a panel. Per-curiam text does not establish an individual author's philosophy. Trial judges and JPs remain eligible for any verified individual evidence that is found; **thin evidence**, not the office category alone, triggers Objective Info Mode. Never score judges on policy or label court-level workload a judge's causal performance.

### 3.6 County and special-district research

These findings add coverage leads and explicit gaps; they do not turn agency statistics or director contact lists into personal choices. Except where marked unverified, the research agent live-checked the cited pages/endpoints; export and attribution limitations still apply.

| Office/body | Official source and format | What it supports / remaining gap |
|---|---|---|
| Travis County open data | County `open-data-portal` page | A **link hub**, not a verified unified data API. `data.traviscountytx.gov` did not resolve in the check; do not configure an assumed Socrata tenant there |
| County courts | [CriminalInsights dataset](https://courtsdata.traviscountytx.gov/CriminalInsights/Dataset) and CivilInsights Qlik dashboards | Agency/court context. No documented export was verified; these are not individual judicial-performance or decision feeds |
| District Attorney | [Official data and reports](https://districtattorney.traviscountytx.gov/data-and-reports) | Sexual-assault reporting PDFs were found, **not a whole prosecution docket**. Document parser approval and more comprehensive individual-action retrieval remain gaps |
| Sheriff / jail | [TCJS population reports](https://www.tcjs.state.tx.us/population-reports/) | Monthly XLSX county rows: `PopReportCurrent.xlsx`, `JailerTurnoverReportCurrent.xlsx`, `PaperReadyReportCurrent-1.xlsx`, `ImmigrationReportCurrent-1.xlsx`, `IncarcerationRateReportCurrent.xlsx`. Objective jail/agency statistics, not a sheriff's personal decisions or demonstrated causal performance; snapshot dated files because “Current” changes |
| Justices of the Peace | [OCA CARD](https://card.txcourts.gov/) | Crystal-report export-parameter route identified; Power BI export unverified. Report per court/period, not automatically per judge; verify assignment and definitions before associating a person |
| Clerks, treasurer, tax assessor-collector, county attorney, constables | Official office records still need source-specific investigation | This research has **not located structured per-person decisions** for these offices. Keep adapter/attribution gaps and search prior roles; do not exclude the offices or claim records cannot exist |
| MUD/WCID/MMD registry | TCEQ [active district dataset](https://data.texas.gov/resource/hr84-s96f.json) | Structured names/contacts for districts. **Not an elected-director roster or vote feed**; contacts may be staff/agents. iWUD HTML is a secondary discovery lead, pending source approval |
| Special-purpose district registry/taxes | Comptroller [SPD public information database](https://spdpid.comptroller.texas.gov/) | District/roster/tax context. A CSV export is mentioned but **was not verified**; do not claim an implemented export or individual decisions |
| MUD/WCID decisions | Official minutes at [TC MUD 10](https://tcmud10.com/), [TC MUD 18](https://tcmud18.org/), [West Travis County MUD 1](https://wtcmud1.org/), [Travis County MUD 2](https://traviscountymud2.org/), [TC WCID 18](https://tcwcid-18.org/), [TC WCID 19](https://tcwcid19.org/); shared [Texas District Information](https://txdistrictinfo.org/) | Small official PDF minutes are concrete research leads. Verify the district's official publishing link and named actors; **per-source approval pending**, including shared-host documents. MUD coverage stays in scope |
| Appraisal-district elected board | [Travis CAD board elections](https://traviscad.org/boardelections); official minutes pattern `wp-content/uploads/YYYYMMDD_BOD-Meeting-Minutes.pdf` | Official election/document adapter proposed, awaiting source approval. Election/board pages do not establish that every candidate lacks a prior record |
| Emergency services districts | Official election/board records, to be configured per district | Boards are often appointed, but local rules may allow elected boards. Do **not** blanket-exclude ESD elections or propositions; the official ballot manifest decides |
| Bonds / propositions | Bond Review Board [bond-election dataset](https://data.texas.gov/resource/kbmc-qmvg.json) | Structured `election_date`, amounts, purpose, result/votes. Scheduled future proposals can have **NULL results**: never treat them as completed elections. Body/measure context belongs to the ballot/proposition pipeline, not a per-director `OfficialAction` |

For county/agency statistics, keep the measured body, reporting period, definition, source date and limitations. Temporal overlap with an official's tenure is only temporal association. A separate official record must establish any claimed actor/action relation; no inference from office title, a contact field, aggregate outcomes or a board's result alone.

## 4. Known gaps and coverage reporting

- **Historical Austin:** Casar's 2015–2022 Council service predates the inspected Socrata dataset. Official minutes/archive discovery and per-source approval are still needed; no approved or completed historical parser is implied.
- **Historical Travis Commissioners Court:** Eckhardt's 2015–2020 County Judge service predates inspected CivicClerk coverage. IQM2 is an archive lead, not implemented coverage.
- **Local freshness:** Austin's inspected dataset lagged by roughly two months; Round Rock's recent Legistar agendas did not establish recent finalized votes (latest noticed: 2024). BoardDocs access varies; an earlier 403 is not a platform-wide prohibition or proof of permanent unavailability.
- **Named choices:** TX Senate journals and some SBOE/GLO/minutes entries omit individual names or participation details. Do not fill missing choices from totals, office rosters or “unanimous” alone.
- **Agency documents:** recent RRC minutes were not found in inspected paths; this is not evidence that none exist. AG filings, executive documents and statewide boards still need source-specific retrieval/attribution work.
- **Judicial:** official PDFs exist, but official index/document adapters remain approval-gated. OCA counts and court dashboards do not replace individual opinion evidence, and GovInfo USCOURTS does not cover Texas state courts.
- **County:** court/DA dashboards and TCJS reports offer limited body-level context. Clerk/treasurer/tax/attorney/constable individual-action sources remain unresolved; Qlik and Power BI export capability has not been established.
- **Special districts:** TCEQ contacts are not directors, the Comptroller CSV export is unverified, and local PDF minutes await individual approvals. ESD contest eligibility must come from the ballot, not an appointed-board assumption.
- **Ballot:** researched candidate/district/ENR feeds do not establish an official election-specific ballot-style mapping. Use the official/manual fallback, never a computed substitute (§6).

Coverage is **source-, date- and candidate-specific**. Report configured vs. unconfigured sources, access failures, date ranges, stale data, incomplete pagination, identity/attribution review and withheld records. “Complete” for one configured source never means complete personal history or all-contest coverage. All gaps remain in scope and trigger honest availability states, not “no action,” an omission, or an invented comparison.

## 5. Identity resolution

Official lookups exist; this research has not established one universal crosswalk across every office. Resolve the pipeline candidate to source IDs using official evidence first:

1. Use supplied verified government identifiers where available. The shared candidate `id` is the pipeline's ID, **not** a government person ID. Validate source-ID ownership rather than trusting a guessed value.
2. For current House members, use the no-key [Clerk `MemberData.xml`](https://clerk.house.gov/xml/lists/MemberData.xml): official name, bioguide ID, state and district. Name/state/district can retrieve a candidate match, but **never assign a person ID from name + district alone**. Require corroborating identity/tenure evidence and review collisions.
3. For historical federal service, use Congress.gov `/member/{id}` and official historical/roster evidence where available; an optional official state roster API can supply further corroboration. A missing current-roster match does not disprove prior service. **Redistricting or seeking a new district must not reject a valid prior-office identity.**
4. For Texas, prefer verified TLO codes and official session/member/term evidence. TLO author/member HTML and LRL parsing still need source approvals. OpenStates may supply an ID crosswalk **only if truly necessary**, not default identity authority.
5. For local sources, use source member IDs plus the correct jurisdiction/tenant and dated roster/term evidence. Normalized names/district labels are retrieval aids, not globally unique identities. Verified full-name aliases may help; surname-only/fuzzy matches must not auto-merge people.
6. Keep election-specific candidate IDs such as SOS `idCandidate` separate from historical person IDs. Route ambiguous matches to a symmetric human-review queue; unresolved matches produce a gap, not an automatic actor assignment.

Prior roles are independently verified and remain eligible even when the candidate seeks a different office. Attribution must also establish that the person acted on the relevant date; identity resolution alone does not prove the action.

## 6. Ballot from `(location, month, year)`: pipeline ownership

**Settled boundary:** pipeline owns election/ballot orchestration, using the ballot/lookup work owned by `@ftb/scraping`, then calls **both records and scraping** with Candidate, Position, Month and Year via the shared `CandidateResearchRequest` (§7). Ballot discovery and location lookup do not belong in records. Precise location stays on-device under PLAN; this orchestration is not authorization to transmit an address/GPS point.

These are ballot-team research leads, not implemented records adapters or a proven complete structured ballot:

| Source | Provides | Status / limitations |
|---|---|---|
| VIP feeds | Structured ballot data where an official feed is available | No Texas feed was located in this research; national generalization lead, not proof none exists |
| **TX SOS Civix** `https://goelect.txelections.civixapps.com/api-ivis-cbp/api/cbp` | `getElectionsByYear/2026`, `getCandidateBallotOrder`, `findQualifiedCandidates`, official XLSX export | **Official undocumented API accepted**, with polite cached access and **no anti-bot bypass**. Inspected election ID `53815`, Travis county ID `227`, and response counts are observations, not constants. Inspected candidate scope was federal through county, not city/ISD/propositions or an official ballot style |
| Clarity ENR `https://results.enr.clarityelections.com/TX/Travis/…` | Published contest/candidate/result data, depending on the election | November 2026 data was not found in the checked route at research time; timing/coverage must be verified. Results data is not automatically an official pre-election ballot definition or style mapping |
| Official VoteTravis consolidated/personalized ballots | [Election information](https://votetravis.gov/current-election-information/current-election/), local contests and verbatim proposition text | Official fallback/reference. Production PDF/HTML parsing needs source approval; manual official-style selection remains required where lookup is unresolved |
| Google Civic, Ballotpedia, Democracy Works, BallotReady | Potential cross-checks | Not the official ballot-style system of record; access/coverage must be verified |
| BRB bond-election JSON (§3.6) | Proposed/past bond amounts, purpose and result context | Pipeline-owned measure context; NULL/future results are not completed votes and do not enumerate every ballot proposition |

**District data does not establish ballot style:**

- TLC Capitol Data Portal CKAN/shapefile leads include `PLANC2333`, `PLANS2168`, `PLANH2316`, `PLANE2106` and `Precincts26P_Districts.xls`. Check the official election's operative map/version; Census TIGER 2025 congressional boundaries do not reflect the researched 2025 Texas redraw.
- Travis Tax Office Precincts FeatureServer and county boundary layers, plus Austin Council Socrata `w3v2-cj58`, are geography leads. AISD trustee boundary availability remains unverified.
- This research did **not locate a reliable public official precinct→ballot-style mapping**. Computed district sets are **not official ballot styles**. Checking a sample of personalized ballots cannot establish every split-precinct ballot or authorize silent guessing.
- Follow PLAN §5: if an official election-specific style cannot be reliably resolved, or a point is ambiguous, stop automated lookup and let the user select/confirm an **official** ballot style. Never silently substitute a computed style, omit contests, transmit precise location, or ask to waive this invariant.
- NIST SP 1500-20 is an interoperability/modeling reference, not an official Texas ballot source, an adopted contract change or a remedy for missing official styles.

## 7. `@ftb/records` design and implementation status

### Shared request and compatibility

The shared contract in `packages/types/src/index.ts` now adds:

```text
CandidateResearchRequest {
  candidate: { id, name, aliases?, identifiers? },
  position: { office, jurisdiction, district? },
  month,
  year
}
```

- `position` is **office sought**, not a restriction on prior offices. `month`/`year` describe the election, not a one-month records window.
- Default history cutoff is **the first day of the election month, exclusive**; e.g. November 2026 uses actions before `2026-11-01`. A configured `since` can bound history. Derive windows from request/configuration, **not the wall clock**, and apply comparable windows symmetrically.
- The legacy `RecordProvider` (`covers`, `actionsFor(personKey)`) is retained. The new per-candidate collector uses the request and supports the legacy provider separately; do not claim every new source adapter implements that old interface directly.
- Approved **backward-compatible, additive** `OfficialAction` metadata includes optional `extraction`, `provenance`, `consent`, `attribution`, raw `vote` value/question/method, and margin counts including `present` / `notVoting` (plus other supported distinctions). Existing required fields/provider remain. Formats include `xml`, `json`, `csv`, `xlsx`, `html`, `pdf`, `manual`; format support does **not** approve a source.
- Keep exact raw choice semantics: present/not voting/abstention are not synonyms for a no vote or an absence. `consent` requires explicit source evidence. Attribution methods distinguish member IDs, named records and evidenced office tenure.
- **Contract coordination:** the user approved these additions, but shared-type edits must still be flagged to every owner under AGENTS/PLAN's sign-off rule. The parent is responsible for flagging the edit in README/final coordination; **no actual team message has been sent**.

### First implementation versus planned work

**In progress now:** structured `SnapshotClient`/raw snapshots and source adapters for TLO XML, House Clerk XML, GovInfo CREC MODS and BILLSTATUS, Austin/configurable Socrata, Travis/configurable CivicClerk and Legistar. Configured sources, verified identity and collection/coverage reporting must remain distinguishable from unsupported sources. This status is not a production-readiness or full-coverage claim.

**Planned, not implied implemented:** broader official identity/history APIs; OCA/TCJS and registry/context imports; judicial official index/PDF collection; TX journals; executive/agency documents; school/city/district minutes; historical archives; manual objective-context workflows. HTML/PDF work must wait for the applicable source approval in §8. CourtListener/Voteview are not part of the approved defaults.

Reusable document tooling may eventually share text/span extraction and minutes patterns, but each adapter still needs source-specific identity, motion, participation, consent and date rules. Keep body-level statistics and proposition context separate from person-level `OfficialAction[]`; an unsupported fact must not be forced into that contract just to fill a gap.

### Extraction approach: selected (pipeline-only)

**Rules/patterns first**, then a **cheap grounded semantic fallback** in `@ftb/records` `extract/`:

| Option | Verdict |
|---|---|
| **GLiNER2** | Strong schema/span IE, CPU-local — **Python**. Out of band for the all-TS pipeline unless wrapped as an optional sidecar later. |
| **NuExtract** | Purpose-built document→JSON; open tiny ONNX exists, but shipping multi-hundred-MB weights in this package is heavy for HackTX. |
| **LangExtract-style + cheap LLM** | **Selected default fallback.** OpenAI-compatible HTTP (`EXTRACT_LLM_BASE_URL`, e.g. Ollama/Gemini/OpenAI-compatible) at temperature 0, JSON schema, **exact source-span validation** (UTF-16/`text:start-end` must equal the cited substring). Cached by `(contentHash, schemaId, modelId)`. |

Disabled unless configured. Fail closed on missing/invalid spans, actor mismatch, or invented totals. No model calls in `apps/api` / `apps/mobile`. Temperature 0 ≠ truth; spans are necessary, not sufficient — actor/motion/date/ownership gates still apply.

### Build sequencing, not scope reduction

1. Finish/test the current structured snapshot, identity and collection path with TLO, federal official XML/MODS and local structured adapters.
2. Add researched structured judicial/county/district context with honest body/person boundaries and configured coverage reports; these sources do not guarantee individual decisions for every office.
3. After **individual approvals**, add official TX journals, author/member HTML and bill analyses; official judicial indexes/PDFs; AG/executive/agency documents; minutes for each approved school/city/district source and historical archive.
4. Continue source discovery/configuration for every ballot office family, including county row offices and special districts. Missing evidence or a pending approval yields a visible gap / Objective Info Mode, never a silent scope cut.

## 8. Settled decisions and per-source approval backlog

**Settled; do not re-ask:** full-vertical coverage; pipeline ballot ownership and the shared per-candidate request; prior-office eligibility and election-derived history windows; official/manual ballot-style fallback; acceptance of the official TX SOS undocumented API without bypass; additive metadata/legacy-provider compatibility; rules plus a cheap purpose-built semantic fallback **in concept**, pending research/selection. User approval is not evidence that every source/parser is built or that all team owners have signed off on shared-type edits.

**HTML/PDF production gate (user, 2026-10-24):** official government HTML/PDF may be parsed **only when that source has no official structured bulk/API alternative** (XML/JSON/CSV/XLSX/RSS/FTP that already carries the needed facts). Prefer structured first always. Never scrape news. CourtListener/Voteview remain unapproved defaults. Bypass/WAF workarounds remain forbidden. This is **not** a blanket “any government HTML” approval — each adapter must still document the official publisher URL and why structured bulk is unavailable for the needed fields.

**Approved under that gate (wave-2 parsers may proceed):**

| Source | Why HTML/PDF is allowed | Use |
|---|---|---|
| TX House Journal (`journals.house.texas.gov`) | No official structured per-member floor-vote bulk for current sessions (FTP journal coverage inspected only through 83R) | Named record votes; match `RV#` / record number, bill/motion, date |
| TX Senate Journal (`journals.senate.texas.gov`) | Same; minority-only listings need participation rules, never invent the majority from a roster | Named floor votes / rulings with explicit actor evidence |
| TLO author/member HTML + LRL `memberDisplay` | Bill-history XML names people as strings; session codes like `H-A4395` live in HTML indexes, not in a member-ID API | Identity **crosswalk** only (name ↔ official session/member code ↔ pipeline candidate); not a vote source |
| TLO / capitol.texas.gov bill analyses + fiscal notes (`analysis/html/`, HRO, SRC, committee analyses) | No structured analysis bulk; bill-history XML only links out | `officialText` / classification context for authored actions — **not** a vote |
| SCOTX Orders & Opinions `https://www.txcourts.gov/supreme/orders-opinions/` | No structured SCOTX opinion bulk with author/join/dissent | Discovery index → official opinion/order PDFs; author/join/dissent from document text only |
| TAMES indexes + official opinion/order PDFs (`search.txcourts.gov`) | No structured Texas state-court opinion bulk (GovInfo USCOURTS is federal-only) | Appellate (e.g. 3rd COA) and other TAMES courts; same author evidence rules |
| SCJC sanctions/orders (official site) | No structured named-sanction bulk located | Named sanctions with linked official order |

**Approved under the same gate (user, 2026-10-24 — remaining HTML/PDF + LLM fallback):**

| Source | Why HTML/PDF is allowed | Use / limits |
|---|---|---|
| AG opinions + official litigation/amicus PDFs | No structured AG opinion bulk with named authorship | Opinion/order text; tenure-bound officeholder attribution; press releases are discovery only |
| Governor executive-order / proclamation index → gov.texas.gov PDFs | No structured EO bulk with full text | Dated orders as `executive_order` / `signed` with tenure; not a yes/no floor vote |
| Texas Register section HTML (Governor / AG / agency) | RSS discovers issues; body is HTML | Actor must be explicit in the section; agency notices ≠ personal votes |
| State-board + local minutes (RRC, SBOE, GLO, Diligent, BoardDocs, BoardBook, IQM2, CivicWeb, CivicPlus, Laserfiche, school/MUD/CAD/DA PDFs) | No structured member-vote feed for these publishers | **Per configured official URL**; named roll calls only; consent only when labeled; platform ≠ blanket |
| VoteTravis / official ballot HTML/PDF | No structured personalized-ballot API for style+contests together | Ballot **reference/discovery** only — never invent or override official ballot style (PLAN §5) |
| Manual poll/credential context | N/A structured feed | Provenanced manual workflow; not automatic OfficialAction invention |

**Not approved:** CourtListener/Voteview defaults; bypass deployment; computed ballot styles replacing official styles; treating press releases as proof of personal legal action; inventing member votes from totals/rosters/“unanimous.”

Preserve source URLs, immutable snapshots and limitations; only publish supported facts through the appropriate source, attribution and quality gates.
