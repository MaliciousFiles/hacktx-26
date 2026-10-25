# Audit: web / voice side of the westcampus pilot

Run: `ballot-pilot-westcampus-v1`, asOfDate 2026-10-25, window 2025-11-05 → 2026-10-25.
Scope: 8 saved candidates (Greg Casar crashed; his 8 SerpAPI snapshots are cached but he has no checkpoint).
Evidence: `candidate-checkpoints/*.json` (`voice`), `web-cache/*.json` (63 SerpAPI + 46 page/robots snapshots), `input.json`, `dist-logs/pilot-westcampus.log`, `packages/scraping/src/{voice,snapshot,dates}.ts`, `packages/pipeline/src/run.ts`, `config/sources.yaml`.
No live SerpAPI calls were made. I did a few plain HTTP fetches (curl/webfetch) to confirm that campaign sites and Vote411 pages exist. The web-search tool returned nothing, so "what a human would find" comes from the cached SERP leads plus those fetches.

## 1. Verdict

**The web side is not producing a usable corpus yet.**

- **Only 29 pages came through.** Eight candidates ended up with 29 `Source`s (1 to 6 each), and every one is `type: "news"`. None is a campaign site, questionnaire or debate/forum transcript.
- **No source is attributed to its candidate.** 0 of 29 have `candidateId`, so every quote still needs attribution review.
- **151 quote leads exist, but only about a third are plausibly the candidate's.** The extractor takes any text inside quotation marks, and only 49 of 151 (32%) sit within 400 characters of the candidate's surname.
- **Some quotes are from the wrong contest.** Maggie Ellis has 9 quotes from a Harris County judge debate article that never mentions her (0 mentions of "Ellis", 0 of "Chief Justice").
- **Campaign, questionnaire and debate channels contributed 0 pages for 6 of 8 candidates.** Every campaign-channel page budget is `0/5`, and this never shows up as a gap.
- **Almost every shortfall comes from configuration and plumbing, not search quality.** SerpAPI does surface the real material:
  - Zo's, Garibay's, Ellis's and Abbott's own sites.
  - The Vote411 race page for McRaven.
  - The Statesman Q&A for District 9.
  - Texas Tribune and KUT guides.
- **That material is discarded for these reasons:**
  - `campaignSites=[]` and `verifiedDocuments=[]`.
  - A host allowlist that omits the local Austin outlets.
  - A bad `onyourballot.vote411.org` host match.
  - A WAF-blocked Ballotpedia.
  - Debate/forum/video results kept only as leads.
  - Failures recorded as generic "error" rows, or not at all.
- **Symmetry (PLAN §3.9) is broken by transient failures.** The District 9 pair is the only contest with two candidates, and they got very different treatment (§5).

Headline numbers, from the checkpoints:

| | Thadani | Qadri | McRaven | Brown | Ortega Carter | Abbott | Garibay | Ellis | Total |
|---|---|---|---|---|---|---|---|---|---|
| Queries with results (of 8) | 4 | 7 | 4 | 8 | 7 | 8 | 8¹ | 8 | |
| Queries never run or lost | 3 | 0 | 4 | 0 | 1 | 0 | 0 | 0 | 8 |
| YouTube "no results" (recorded as error) | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| Leads (SERP hits kept) | 37 | 68 | 38 | 77 | 62 | 78 | 79 | 71 | 510 |
| Pages fetched, kept as Source | 3 | 4 | 6 | 5 | 1 | 2 | 3 | 5 | 29 |
| Page errors (Ballotpedia 202) | 0 | 2 | 0 | 2 | 2 | 0 | 1 | 0 | 7 |
| Quote leads | 22 | 33 | 24 | 19 | 0 | 17 | 13 | 23 | 151 |
| Quotes within 400 chars of surname | 1 | 7 | 12 | 13 | 0 | 5 | 9 | 2 | 49 |
| Campaign-site / questionnaire / debate Sources | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

¹ Garibay's `contest_debate` results are cached (10 results) and 9 leads were kept, but the channel is marked `error`. See bug B3.

Across all 510 leads:
- 267 (52%) have `eventDate.basis=unknown`.
- 254 (50%) are on facebook/instagram/x/tiktok/youtube.
- Only 59 (12%) are on hosts the config would ever fetch.

## 2. How the code decides what gets fetched

Reference for the findings below.

1. **Eight fixed queries per candidate.** `voiceQueries` at `voice.ts:129-146` builds the identity as `"Name" <contest.title> us tx`, because `run.ts:492` passes `${contest.title} ${jurisdiction}` with the slash turned into a space. Examples are `"Dave Thadani" City of Austin, City Council Member, District 9 us tx austin` and `"Greg Abbott" Governor us tx`.
2. **Search hits become leads, not Sources.** A hit is queued for fetching only if its host matches `domains[channel]` (`voice.ts:248-257`, `:369`):
   - `campaign` = hosts of `campaignSites`, which is `[]` for everyone.
   - `questionnaire` = `www.vote411.org`, `apps.texastribune.org`, `www.kut.org`, `ballotpedia.org`.
   - `debate`, `contest_debate`, `forum` and `speech` = the 12 news domains.
   - `debate_video` = none.
   - `news` = the 12 news domains.
3. **Every fetched page also needs a host in `allowedPageHosts` (`snapshot.ts:150-153`) and a pass through robots.** Redirects are rejected at `snapshot.ts:246`. A fetched page becomes a Source only if `type` resolves (`voice.ts:456-470`):
   - `campaign` channel pages are `campaign_site`.
   - A `verifiedDocuments` match gives questionnaire or debate_speech.
   - Otherwise it is `news` if the host is a news domain.
   - Anything else is `needs_review` and dropped.
4. **A Source gets `candidateId` only for campaign-channel pages or verified candidate-owned questionnaires (`voice.ts:482`).** Both sets are empty here, so no Source is attributed to a candidate.
5. **`speechDomains` equals `newsDomains`.** A "debate/forum" result is only fetched if a news outlet published it, and then it is typed `news`.
6. **YouTube/`debate_video` hits are leads only (`voice.ts:290-329`).** No transcripts and no fetching.

## 3. Per-candidate tables

Channel key: `✓n` = query returned n results and leads were kept; `∅` = 0 results (provider said so); `✗` = query never completed and no snapshot exists (no result, and the row is a generic error).

### 3.1 Dave Thadani — D9 City Council (3 sources, 22 quotes, 37 leads)

| channel | status | notes |
|---|---|---|
| campaign | ✓10 | Found `statesman.com/projects/2026/texas-election-austin-november-voting-guide/austin-city-council-district-9/` (snippet "Why are you running for Austin City Council…", 2026-10-21), `ballotpedia.org/Dave_Thadani`, `sway.co/candidate/dave-thadani-…`, `aaul.org/voting-guide/…/district-9/`, `communityimpact.com`, `austincurrent.org`. **None fetched** because the campaign queue is empty. |
| questionnaire | ✗ | no snapshot (not a quota event) |
| debate | ✗ | no snapshot |
| contest_debate | ✓10 | shared with Qadri: `lwvaustin.org` D9 forum, `citizen.org` environmental forum 2026-09-24, YouTube "Austin City Council Candidate Forum — District 9", `video.nhpbs.org` Austin InSight. None are on allowed hosts. |
| forum | ✗ | no snapshot |
| debate_video | ∅ (recorded as `error`) | YouTube returned "hasn't returned any results"; `voice.ts:300` treats `body.error` as a failed search |
| speech | ✓7 | |
| news | ✓10 | |

- **Pages fetched (3, all `news`, no `candidateId`):**
  - `kut.org/politics/2026-10-19/austin-city-council-district-9-candidates-election-2026`: `published` 2026-10-19. KUT says "Thadani did not respond to requests for an interview", so no Thadani statements exist there. Its 10 quotes are other candidates', with 1 near his name.
  - `statesman.com/news/local/article/austin-election-district-9-housing-safety-economy-22464713.php`: `published` 2026-10-12. About Qadri's housing fight; Thadani appears twice and 0 quotes are near his name.
  - `statesman.com/opinion/editorials/article/zo-qadri-austin-council-district9-endorsement-22421172.php`: `published` 2026-10-16. This is an **endorsement of his opponent**, filed in his corpus.
- **Found but missed:**
  - The Statesman Q&A page above and Ballotpedia.
  - `sway.co` and `aaul.org` voting guides.
  - Candidate site: nothing found. Every `davethadani.com` / `thadaniforaustin.com` guess was a "Coming Soon" parked page.
- **Social:** `instagram.com` ×3 and `youtube.com` ×6, all `unknown` identity.

### 3.2 Zohaib "Zo" Qadri — D9 incumbent (4 sources, 33 quotes, 68 leads)

| channel | status | notes |
|---|---|---|
| campaign | ✓10 | Facebook, KXAN, a Reddit thread and Legistar items about Qadri's council actions. Own site not in campaign results. |
| questionnaire | ✓10 | **`zoforaustin.com/` (title "ZO FOR AUSTIN", `candidateMatch=unverified`)**, `bluevoterguide.org/district/TX/Austin_City_Council_District_9/…`, KUT guide, KXAN guide, wisevoter, and `ballotpedia.org/Endorsements_by_Salman_Bhojani` / `…Endorsements_by_John_Bucy_III` (wrong people). |
| debate | ✓10 | |
| contest_debate | ✓10 | shared with Thadani |
| forum | ✓9 | Facebook `ZoForAustin/posts/…reelection-at-stubbs`; Facebook "Austin council candidates skip 2026 candidate forum" (julie.k.oliver) |
| debate_video | ∅ (recorded as `error`) | |
| speech | ✓10 | |
| news | ✓9 | |

- **Pages fetched (4 `news`, no `candidateId`):**
  - `kut.org/…district-9-candidates-election-2026`: 10 quotes, 2 near name.
  - `statesman.com/news/article/rainey-street-austin-transformation-high-rise-22154183.php`: `published` 2026-06-15, 10 quotes, 0 near name.
  - `statesman.com/business/technology/article/austin-large-data-center-ban-rules-22390898.php`: `published` 2026-08-25, 8 quotes, 1 near name.
  - `statesman.com/business/technology/article/waymo-austin-6th-street-mass-shooting-ambulance-22227939.php`: `published` 2026-04-28, 5 quotes, 4 near name.
  - Three of these four are general city-news pages (Rainey Street, data centers, Waymo) carrying 23 of the 33 quote leads; only 7 of 33 quote leads are near his name.
- **Page errors (2):** the two Ballotpedia pages above were wasted page budget (Bhojani and Bucy are different people's endorsement lists) and then returned a WAF 202.
- **Found but missed:** `zoforaustin.com` (live, with an Issues page), listed in 4 channels but dropped because it is neither pinned nor on a news host.

### 3.3 Nan McRaven — ACC Trustee Place 3 (6 sources, 24 quotes, 38 leads)

| channel | status | notes |
|---|---|---|
| campaign | ✓10 | **`onyourballot.vote411.org/m/race-detail.do?id=73033659`** (Vote411 / League of Women Voters, rank 0 in both campaign and questionnaire), ACC newsroom, `electionssimplified.com`, Statesman and KUT. |
| questionnaire | ✓10 | Same Vote411 page, `offices.austincc.edu/…/candidates-for-the-acc-board-of-trustees-2026-election/`, Chronicle endorsements, `bluevoterguide.org`. |
| debate | ✗ | no snapshot |
| contest_debate | ✗ | no snapshot |
| forum | ✗ | no snapshot |
| debate_video | ✓19 | 10 kept in-window; all `eventDate` unknown; none about ACC (Arkansas CD-3 debate, Arizona LG debate, …) |
| speech | ✗ | no snapshot |
| news | ✓8 | |

- **Pages fetched (6 `news`, no `candidateId`):**
  - `kut.org/education/2026-10-16/austin-community-college-board-candidates-2026-election`.
  - Statesman: `…/nan-mcraven-acc-trustee-endorsement-22421115.php`, `…/acc-trustee-races-november-election-22473550.php`, `…/austin-community-college-november-2026-election-22401645.php`.
  - Two generic Statesman guides (`projects/2026/austin-texas-november-election-voting-endorsements/` and `…/texas-election-austin-november-voting-guide/`), `eventDate=unknown`, 0 quotes.
  - The last is a 46,545-char all-races guide that is also in Ortega Carter's corpus.
- **This is the only candidate that hit the 5/5 page cap, on the `news` channel.**
- **Best candidate-voice evidence, dropped:** the Vote411 race page, because `onyourballot.vote411.org` does not match `www.vote411.org` (`matchesHost`, `voice.ts:122-125`). It is also not in `allowedPageHosts`, so it would be rejected by `snapshot.ts:153` regardless.
- **Caveat on Vote411:** on 2026-10-25 a plain GET of that URL returned a "Voter Guide Toolkit: Program Error" Java stack trace. Its `robots.txt` has `Crawl-delay: 10`, so a live fetch also waits 10s (`voice.ts:426`). Even if reachable, the page can't be trusted without a content check, and the freezer would store the error page as a snapshot.
- **Opponent not in the ballot input:** ACC's own page says "Nan McRaven is running against Trevor Hale".

### 3.4 Andy Brown — Travis County Judge (5 sources, 19 quotes, 77 leads)

| channel | status | notes |
|---|---|---|
| campaign | ✓10 | The only own-account hit is `facebook.com/TravisCoJudge` (post), which is the official office page, not a verified campaign page. |
| questionnaire | ✓10 | KUT guide, Statesman guide, Ballotpedia county pages, `theballotbrief.com/zip/78738`, `ivoterguide.com`. |
| debate | ✓7 | |
| contest_debate | ✓10 | wrong contests (Harris County, Southeast Texas, …) plus a YouTube "Travis County Candidate Forum" |
| forum | ✓10 | PolitiFact (Kansas Senate, Iran) — unrelated, "Brown" word matches |
| debate_video | ✓20 (10 kept) | 10/10 name matches, but they are interviews or past items: "2021 Review ⏩ 2022 Preview", "sworn in", "State of the County Address 2026 30 April 2026" |
| speech | ✓10 | junk: `iowarfa.org` board book, `upload.wikimedia.org` Arbutus PDF, `issuu`, LinkedIn |
| news | ✓10 | |

- **Pages fetched (5 `news`):**
  - `statesman.com/news/local/article/travis-county-state-address-brown-takeaways-22236399.php`: 21 mentions, 10/10 quotes near his name. The best page in the whole corpus.
  - `statesman.com/news/article/state-of-county-travis-photos-2026-22235832.php`: 1 quote.
  - `kut.org/energy-environment/2026-06-12/…screwworm-travis-county-cases`: 3 quotes.
  - `kut.org/politics/2026-10-14/austin-tx-election-voter-guide-ballot-races`: 0 quotes.
  - `texastribune.org/2026/09/28/texas-lieutenant-governor-dan-patrick-vikki-goodwin/`: **wrong contest.** It mentions Brown once, in an endorsement list; 5 quotes are Dan Patrick/Goodwin race, 0 near his name.
- **Page errors (2):** Ballotpedia `Travis_County,_Texas,_elections,_2026` and `Municipal_elections_in_Travis_County,_Texas_(2026)`, both WAF 202.
- **Campaign site:** not found in any lead.

### 3.5 Dolores Ortega Carter — Travis County Treasurer (1 source, 0 quotes, 62 leads)

| channel | status | notes |
|---|---|---|
| campaign | ✓10 | Facebook (Travis County Democratic Party), `electionssimplified.com`, `decentballot.com/travis-county-tx/` |
| questionnaire | ✓10 | Statesman guide, Ballotpedia, `theballotbrief.com`, "Austin Young Democrats candidate questionnaire" (Facebook/Instagram) |
| debate | ✓10 | |
| contest_debate | ✓10 | all irrelevant (Florida/Idaho/etc.) |
| forum | ✗ | no snapshot |
| debate_video | ✓20 (10 kept) | "Travis County Candidate Forum" (YouTube) is a good lead; none name-matched |
| speech | ✓10 | Facebook posts from other candidates |
| news | ✓2 | |

- **Page fetched (1 `news`):** `statesman.com/projects/2026/texas-election-austin-november-voting-guide/`. A 46K-char all-races guide where she appears as "Democrat, Dolores Ortega Carter, Travis County treasurer ▪ Incumbent". 0 quotes.
- **Page errors (2):** Ballotpedia `Travis_County,_Texas,_elections,_2026` and `Endorsements_by_2026_CTX_Voter_Recommendations_(Sway…)`, both WAF 202.
- **Nothing to extract:** her corpus holds no statement by her or about her platform. Her only news hit count is 2.

### 3.6 Greg Abbott — Governor (2 sources, 17 quotes, 78 leads)

| channel | status | notes |
|---|---|---|
| campaign | ✓9 | **`gregabbott.com/about-texas-governor-greg-abbott/`**, `gov.texas.gov/news/post/…`, Texas Tribune guide, `ginafortexas.com/priority/data-centers/` (opponent's site) |
| questionnaire | ✓9 | Star-Telegram guide, iSideWith, TxValuesAction endorsements, Dallas Morning News, Houston Chronicle, UH Hobby poll PDF |
| debate | ✓10 | |
| contest_debate | ✓10 | |
| forum | ✓10 | **`abcnews.com/Politics/week-transcript-8-23-26-texas-gov-greg/story`** ("This Week" transcript: Abbott interview), TMZ, CNN |
| debate_video | ✓20 (10 kept) | 9/10 name matches; most are about the refused debate with Hinojosa; one (CW39 Sept. 30th 2022 debate) is an old event |
| speech | ✓10 | **`rev.com/transcripts/2026-republican-midterm-convention-night-two`** (convention transcript) |
| news | ✓10 | |

- **Pages fetched (2 `news`), both Texas Tribune:**
  - `/2026/09/25/texas-governor-2026-guide-abbott-hinojosa/`: 7 quotes, 1 near name.
  - `/2026/10/07/texas-debate-republicans-talarico-paxton-abbott-hinojosa-election/`: "Texas Republicans are refusing to debate", 10 quotes, 4 near name.
- **Zero errors, but the lowest page yield per lead for a high-profile candidate.** Nothing else was fetchable because:
  - `gregabbott.com`, `gov.texas.gov`, `abcnews.com`, `rev.com`, `fox7austin.com`, `kvue.com`, `nbcnews.com`, `texasstandard.org`, `houstonpublicmedia.org`, `star-telegram.com` and `c-span.org` are not allowed.
  - The campaign queue is empty.
  - 11 of the 78 leads are from approved hosts.
- **No debate exists to find:** three sources (Fox 7, KVUE, Texas Tribune) report that Abbott refused to debate Hinojosa. That is a real absence, but with no source the app would present it as "no data".

### 3.7 Montserrat Garibay — Texas House District 49 (3 sources, 13 quotes, 79 leads)

| channel | status | notes |
|---|---|---|
| campaign | ✓10 | **`montserratfortexas.com/issues`**, `x.com/MontserratforTX/status/…`, `facebook.com/MontserratForTX`, KUT, Statesman, Texas AFL-CIO |
| questionnaire | ✓10 | `ivoterguide.com/candidate/94467…` (candidate profile), Community Impact Q&A (`communityimpact.com/central-austin/election/qa-meet-the-candidates-running-for-…`), Ballotpedia endorsements page, `multistate.us` |
| debate | ✓10 | Instagram "TX Votes Special Event: HD 49 Public Forum"; YouTube runoff videos |
| contest_debate | marked `error`, 9 leads kept | 10 results cached; **aborted at `http://rules.house.gov/bill/119/PIH-FY2026-Homeland-Appropriations`** (bug B3) |
| forum | ✓10 | |
| debate_video | ✓20 (10 kept) | 3 are about her (primary runoff video, "Montserrat Garibay Candidate for Texas House District 49"); 7 are unrelated debates |
| speech | ✓10 | |
| news | ✓10 | |

- **Pages fetched (3 `news`, all from the May runoff, outside the general-election focus of PLAN §5):**
  - `kut.org/politics/2026-05-18/…montserrat-garibay-kathie-tovo-house-district-49-runoff`: 6 quotes.
  - `kut.org/politics/2026-05-26/…runoff-kathie-tovo-montserrat-garibay-texas-district-49`: 2 quotes.
  - `statesman.com/news/politics/article/runoff-texas-house-49-austin-runoff-democrat-22277388.php`: 5 quotes.
  - A newer KUT piece (2026-10-19, "Longtime education advocate faces UT Austin student…") was a campaign-channel lead but not fetched.
- **Page error (1):** Ballotpedia `Endorsements_by_New_Hope_Resistance_Voting_Guide_(Sway…)`.
- **Missed, available and rich:** `montserratfortexas.com/issues` is live and contains a full platform (I fetched it: education, healthcare, labor, housing, criminal justice, gun safety, voting rights — about 20 specific commitments, which is high-value Voice). `x.com/MontserratforTX` is the campaign's own handle.

### 3.8 Maggie Ellis — Chief Justice, TX Supreme Court (5 sources, 23 quotes, 71 leads)

| channel | status | notes |
|---|---|---|
| campaign | ✓10 | **`maggieforjustice.com/about`**, `wfaa.com/…/the-race-for-chief-justice-of-the-texas-supreme-court`, `law.com`, Texas Tribune guide, `facebook.com/maggieforjustice` |
| questionnaire | ✓10 | `dallasnews.com/projects/2026/dallas-texas-november-election-voter-guide/…tx-supreme-court-chief-justice`, `houstonvotersguide.org`, KRIS, `sanantonioreport.org/voter-guide-…`, Texas Tribune guide |
| debate | ✓10 | **WFAA "Inside Texas Politics: Democratic candidate Maggie Ellis on Texas Supreme Court…" (video + YouTube), and a Jimmy Blacklock counterpart** |
| contest_debate | ✓10 | Harris County judge debate (HoustonChronicle 2026-10-23) ranks high even though it is for another contest |
| forum | ✓10 | |
| debate_video | ✓1 | "Candidate Forum 2026 Recording" — unknown date, unknown speaker |
| speech | ✓10 | |
| news | ✓10 | |

- **Pages fetched (5 `news`):**
  - `texastribune.org/2026/10/01/2026-texas-supreme-court-elections-guide/`: 5 quotes, 1 near name.
  - `houstonchronicle.com/opinion/endorsements/article/supreme-court-texas-2026-22477833.php`: 6 quotes, 0 near name.
  - `dallasnews.com/opinion/we-recommend/article/we-recommend-race-texas-supreme-court-chief-22475474.php`: 1 quote.
  - `expressnews.com/opinion/editorial/article/texas-supreme-court-recommendations-democrats-22475728.php`: 2 quotes.
  - **Wrong contest:** `houstonchronicle.com/politics/houston/article/harris-county-judge-debate-five-takeaways-22466541.php`: 9 quotes, 0 mentions of Ellis; it is the Harris County Judge debate (Letitia Plummer vs. Orlando). Fetched from the `contest_debate` channel.
- **Missed:** `maggieforjustice.com/about` (live, biography only — which is expected for a judicial candidate; PLAN §3.13 forbids policy scoring for judges anyway), the WFAA interview, the Dallas Morning News guide page (`dallasnews.com` is allowed, but the guide appeared in `questionnaire` where only 4 hosts are allowed), and the opponent Blacklock is not in the input.

## 4. Silent failures and bugs

### B1. No campaign site is ever fetched (`voice.ts:244-247, 266`, `run.ts:118-123`)
- `campaignSites` is `[]` in `input.json` and hard-coded `[]` in `address-run.ts:95`.
- With no pins, `domains.campaign = []` and `queues.campaign = []`.
- Result: **`campaign` pages budget is `0/5` for all 8 candidates** (`voice.ts:541`), and no `campaign_site` Source exists.
- This is recorded as `status: "searched"`, and `run.ts:571-579` only turns `error/blocked/not_configured/needs_review` rows into gaps, so it is invisible.

### B2. `verifiedDocuments` is empty, so questionnaires and transcripts can never become Sources
- `voice.ts:456-470`: a page only gets type `questionnaire` or `debate_speech` through a reviewed mapping.
- Even without one, any questionnaire page on a non-news host is dropped as `needs_review`.
- On news hosts it becomes `news` and is not attributed, which is what happened to the two KUT/Statesman guides.
- The Statesman Q&A pages for D9 (`/projects/2026/…/austin-city-council-district-9/`) and the KUT D9 guide have candidate answers in unquoted prose.
- `quoteLeads` (`voice.ts:203`) only extracts text inside quotation marks of 30-1000 chars, so questionnaire answers produce 0 quotes (both guides: 0 quotes).

### B3. One bad link aborts the whole channel
- `publicWebUrl(item.link)` (`voice.ts:305, 351`) throws on any non-HTTPS link.
- That jumps to the `catch`, which pushes `status: "error"` for the channel but leaves the leads collected before the failure.
- Evidence: Garibay's `contest_debate` returned 10 results, one being `http://rules.house.gov/bill/119/PIH-FY2026-Homeland-Appropriations`. 9 leads were kept and the channel is `error`. Casar's identical query has the same bad link.
- Fix: skip the individual result (`try/catch` per item), keep the channel `searched`.

### B4. YouTube "no results" is treated as a failure (`voice.ts:300`)
- SerpAPI answers `{"error":"Youtube hasn't returned any results for this query."}` with HTTP 200.
- `body.error` throws "Invalid video search response", so Thadani and Qadri show `debate_video: error`.
- `Search failed or returned invalid data` is a misleading reason, and the empty-result case is not distinguished from a real failure.

### B5. YouTube dates never parse (`dates.ts:58`)
- All 101 returned `published_date` values are `3w ago`, `10d ago`, `Streamed 10d ago`, `2y ago`, `4h ago`.
- The regex `^(\d+|an?) (minute|hour|day|…)s? ago$` matches none of them.
- Every video lead is `eventDate=unknown`, and `inWindow` keeps undated items, so out-of-window videos stay: "2021 Review ⏩ 2022 Preview" (Brown), "CW39 Texas Governor's Debate Sept. 30th 2022" (Abbott), Arkansas and Arizona debates for McRaven/Garibay.

### B6. Queries lost without a trace (8 of 72, concentrated on three candidates)
- Missing from `web-cache` and not frozen as errors: Thadani (questionnaire, debate, forum), McRaven (debate, contest_debate, forum, speech), Ortega Carter (forum).
- Not quota or budget: `serpApiSummary` has no `stopped:` text, and the run shows `59 live, 13 cached` with key #1.
- Not HTTP errors: those would have been frozen with their status; all 63 cached SERP snapshots are 200.
- The coverage reason is the generic "Search failed or returned invalid data" at `voice.ts:386-391`. The real exception text (`snapshot.ts:242` "Network request failed", or the `AbortSignal.timeout(30_000)` at `:239`) is discarded.
- **Likely cause (not proven):** the 30-second timeout hit while the event loop was busy. The same run shows `TT: undefined function` PDF warnings, ~13 minutes between McRaven's start and end, and concurrency 3. Whichever candidate was running during heavy records work lost queries.
- This directly breaks symmetry (§5 below).

### B7. Ballotpedia is a frozen WAF challenge, reported as a generic page error
- All 9 Ballotpedia snapshots (8 pages, including 2 Casar-only pages, plus `robots.txt`) were frozen with **HTTP 202, empty body**. A plain curl today returns 403 from CloudFront.
- `voice.ts:412` treats `robots.status 202` with empty text as "robots OK" (`ok` is true, text empty), then `extractVoicePage` throws "Page has no extractable text", so coverage shows `page: error`.
- The 202 is frozen as evidence (`snapshot.ts` only avoids freezing quota responses). The reason string says nothing about a WAF, and the 7 failed pages for the saved candidates were mostly wasted budget on unrelated endorsement/county listing pages.
- In the questionnaire channel these consumed 2 of 5 slots (Qadri, Brown, Ortega Carter).

### B8. Host matching is exact and misses subdomains (`voice.ts:122-125` + `run.ts:439-444`)
- `questionnaireDomains` contains `www.vote411.org`. `matchesHost` accepts `host === domain || host.endsWith("." + domain)`, so `onyourballot.vote411.org` never matches.
- It is also not in `allowedPageHosts`, so even a manual queue entry would throw "Host is not approved for this run" (`snapshot.ts:153`). That error is swallowed into a generic `page: error`.

### B9. Cross-channel `seen` set (`voice.ts:395-402`)
- A URL fetched in one channel is skipped in later ones. The first channel that queues it decides the `type` (for example a KUT page fetched via `questionnaire` is typed `news`).
- The page budget `fetched++` counts errors, so wasted attempts reduce coverage.

### B10. `eventDate` for pages (`voice.ts:438, 471-476`)
- The window check applies to non-campaign pages only, which is correct. 0 pages were `outside_window`.
- The date used is the article's publish date (`published`), not the event date. For forum/debate coverage that is the report date, not the forum date.
- The two Statesman all-race guides have `eventDate=unknown`.

### B11. Generic phrases in gaps
- `run.ts:582` always appends "Debate captions/transcription and unreviewed speaker attribution remain unavailable". That is honest, but it makes real per-candidate gaps (campaign 0/5, questionnaire 0/5) look the same as the global limitation.

### B12. Not a bug but material: the Texas Tribune guide URL in `config/sources.yaml:17` is a 404
- `https://apps.texastribune.org/features/2026/texas-primary-voter-guide/` returns 404 (curl, 2026-10-25), and it is a primary guide while PLAN §5 asks for general-election guides.
- The real general-election pages found by search are `texastribune.org/2026/09/25/texas-governor-2026-guide-abbott-hinojosa/` and `…/2026/10/01/2026-texas-supreme-court-elections-guide/`.

## 5. Symmetry (PLAN §3.9)

District 9 is the only contest with two candidates in the input (ballot sources list five: Qadri, Thadani, Katie Kam, Rich Heyman, Kai Huang, per the KUT piece; the other three are missing from `input.json`).

| | Thadani | Qadri |
|---|---|---|
| Queries with results | 4 | 7 |
| Leads | 37 | 68 |
| Pages | 3 | 4 |
| Quote leads | 22 | 33 |
| Own site found in leads | no | yes (`zoforaustin.com`) |
| Quotes near own name | 1 | 7 |
| Shared page | KUT D9 | KUT D9 |

- **Same templates, same caps, same window, same allowlist** (this part of §3.9 holds).
- **Unequal outcome from transient failures**, not from design: Thadani lost 3 queries (questionnaire, debate, forum) that Qadri got.
- **Evidence content differs in kind.** Thadani's three pages include an editorial *endorsing his opponent* and an article that says he "did not respond to requests for an interview". Qadri's include three city-business pages unrelated to the election.
- **Nothing in the data is flagged as asymmetric.** The coverage rows for both read "searched / error" without comparison.
- **Only D9 allows a symmetry check at all.** Every other contest has one candidate (Abbott without Hinojosa, Brown without an opponent, Ellis without Blacklock, McRaven without Hale, Garibay without Papari/others), so the pilot can't demonstrate §3.9 elsewhere.

## 6. Where the real sources are (what a human finds)

| Candidate | Own site | Social | Questionnaire / voter guide | Debate / forum | Why missed |
|---|---|---|---|---|---|
| Abbott | `gregabbott.com` (SERP rank 5 in campaign) | not in leads | Star-Telegram, Dallas Morning News, Houston Chronicle, Texas Tribune guides | none held (he declined); ABC "This Week" transcript 2026-08-23, RNC convention transcript on rev.com | not pinned; `abcnews.com` / `rev.com` / `gregabbott.com` not allowed |
| Garibay | `montserratfortexas.com/issues` (fetched OK, full platform) | `x.com/MontserratforTX`, `facebook.com/MontserratForTX` | Community Impact Q&A, ivoterguide, Statesman | "HD 49 Public Forum" (Instagram), runoff videos | not pinned; `communityimpact.com`, `ivoterguide.com` not allowed |
| Ellis | `maggieforjustice.com` (fetched OK) | `facebook.com/maggieforjustice` | Dallas Morning News guide, Houston Voters Guide, San Antonio Report | WFAA interview (video + YouTube) | not pinned; `wfaa.com`, `law.com` not allowed |
| Qadri | `zoforaustin.com` (Issues, Press, Endorsements pages) | `facebook.com/ZoForAustin` | KUT, Statesman, KXAN, blue voter guide | forum ("skip 2026 candidate forum" item); LWV Austin D9 forum | not pinned, `candidateMatch=unverified` because title "ZO FOR AUSTIN" lacks "Zohaib Qadri" |
| Thadani | not found (parked domains only) | Instagram ×3, YouTube ×6 unverified | Statesman D9 Q&A (answers!), Ballotpedia, sway.co, aaul.org | LWV Austin D9 forum, Austin Environmental Forum (citizen.org) | Q&A page is on an approved host but only in the empty campaign queue |
| McRaven | not found | `facebook.com/statesman` posts only | **Vote411** `onyourballot.vote411.org/m/race-detail.do?id=73033659`, ACC candidate page, Chronicle endorsements, Community Impact Q&A | none | B8 (host); Chronicle and Community Impact not allowed |
| Brown | not found (Facebook `TravisCoJudge` is office page) | `facebook.com/TravisCoJudge` | KUT/Statesman guides, ivoterguide, theballotbrief | "Travis County Candidate Forum" (YouTube) | not pinned; videos not fetched; PolitiFact and Facebook noise |
| Ortega Carter | not found | none | Statesman guide, Austin Young Democrats questionnaire (FB/IG) | "Travis County Candidate Forum" (YouTube) | AYD questionnaire is Facebook; nothing on allowed hosts beyond the Statesman guide |

Missing from `config/sources.yaml` entirely (352 of 510 leads name the candidate, but only 59 are on allowed hosts; the most frequent name-matching non-allowed hosts after dropping social platforms are):
`ballotpedia.org` (7, in the questionnaire list but WAF-blocked), `kxan.com` (7), `austinchronicle.com` (6; its hits are weekly PDFs, which the HTML-only adapter rejects), `theballotbrief.com` (5), `thedailytexan.com` (4), `ivoterguide.com` (4), `fox7austin.com` (4), `communityimpact.com` (3), `politifact.com` (3), `houstonpublicmedia.org` (3), `theaustinbulldog.org` (2), `bluevoterguide.org` (2), `electionssimplified.com` (2), `thetexan.news` (2), `cbsaustin.com`, `kvue.com`, `nbcnews.com`, `wfaa.com`, `law.com`, `sanantonioreport.org`, `austincurrent.org`, `onyourballot.vote411.org`, `sites.austincc.edu`, `lwvaustin.org`, `citizen.org`.

Austin Chronicle and League of Women Voters Austin are named in the audit brief. Neither can be reached through the current design: Chronicle appears only as issue PDFs, and `lwvaustin.org` returned 403 to a plain curl.

## 7. Prioritized recommendations

**P0 — Make the web side produce candidate-attributed Voice**

1. **Pin verified campaign sites.** Fill `web.campaignSites` in `packages/pipeline/examples/ballot-pilot-westcampus.json` (schema `run.ts:118-123`, `verifiedVia` must be a URL). Each entry needs a reviewed link back to the candidate:
   - `gregabbott.com` for Abbott.
   - `montserratfortexas.com/issues` for Garibay.
   - `maggieforjustice.com/about` for Ellis.
   - `zoforaustin.com` for Qadri.
   - For Thadani, Brown, Ortega Carter and McRaven nothing was found, so research manually. Do not accept `davethadani.com`, which is a parked page.
   - Also add `address-run.ts:95` support so address runs inherit pins.
2. **Add reviewed `verifiedDocuments`.** Seed these as `questionnaire` with `candidateId` where the page has only that candidate, or `contestId` where multi-candidate:
   - Statesman D9 Q&A `…/austin-city-council-district-9/` (contest: D9).
   - Vote411 McRaven race page.
   - ivoterguide Garibay profile.
   - Community Impact HD-49 and ACC Q&As.
3. **Fix the host allowlist.** In `config/sources.yaml` add under `news:` (which feeds `newsDomains`, `speechDomains`, `allowedPageHosts` via `address-run.ts:225-245`):
   `kxan.com`, `austinchronicle.com`, `communityimpact.com`, `thedailytexan.com`, `austincurrent.org`, `theaustinbulldog.org`, `fox7austin.com`, `kvue.com`, `cbsaustin.com`, `wfaa.com`, `houstonpublicmedia.org`, `texasstandard.org`, `sanantonioreport.org`, `abcnews.com`, `nbcnews.com`.
   Under `questionnaires:` add: `onyourballot.vote411.org`, `ivoterguide.com`, `bluevoterguide.org`, `lwvaustin.org`, `offices.austincc.edu`.
   Also fix the 404 Tribune guide URL at `sources.yaml:17`.
4. **Fix `matchesHost` use and www-handling.** Normalize hosts (strip `www.`, accept subdomains) so `www.vote411.org` covers `onyourballot.vote411.org` (`voice.ts:122-125`, and the generated list in `address-run.ts:225-232`). Add the same normalization to `allowedHosts` (`snapshot.ts:150`).
5. **Make quote extraction work for questionnaires.** `quoteLeads` (`voice.ts:203`) needs a Q&A-aware mode for pages typed `questionnaire`, otherwise questionnaire answers always yield 0 quotes.

**P1 — Stop silent failures**

6. **Per-result error handling.** Wrap each result in its own `try/catch` in both loops (`voice.ts:302-322, 350-370`), skip `http://` links, and keep the channel `searched` (B3).
7. **Treat YouTube "hasn't returned any results" as zero results** (`voice.ts:300`), not an error (B4).
8. **Parse YouTube relative dates** (`dates.ts:58`): `Nh|Nd|Nw|Nmo|Ny ago`, optionally prefixed with `Streamed` (B5).
9. **Record the real error.** Replace the generic reason (`voice.ts:386-391`) with a sanitized message (class + HTTP status or "timeout"), and surface it in the run gaps (B6).
10. **Retry on network failure.** In `snapshot.ts:239-242`, retry timeouts/network failures at least once before giving up, and raise the 30s timeout or do the CPU-heavy records work off the voice event loop (B6).
11. **Add per-candidate completeness gating.** A candidate with < 8 completed queries should fail the run, or be flagged "incomplete" so symmetry can be judged (§3.9).
12. **Do not freeze WAF challenges as answers.** Treat HTTP 202 or an empty body from a non-API host as `blocked` in `snapshot.ts`, and record `waf_challenge` in coverage (B7). Remove Ballotpedia from `questionnaireDomains` until there's an approved way to read it.
13. **Validate fetched content.** Reject app error pages (e.g. Vote411's "Voter Guide Toolkit: Program Error") before extraction (`voice.ts:433-435`).
14. **Surface zero-yield channels as gaps.** In `run.ts:571-579`, add a gap for any channel whose `Page budget: 0/N` and no queue (e.g. `campaign: no pinned site`).

**P2 — Quality**

15. **Contest-relevance check.** Reject pages for `contest_debate` whose text does not mention the contest's office or district (Ellis's Harris County page, Brown's Lt. Gov article).
16. **Raise the identity match for `candidateMatch`.** Accept last name plus office context and common nicknames ("Zo Qadri"). Currently `"ZO FOR AUSTIN"` is `unverified`.
17. **Replace the `us tx` / slash noise in `searchContext`** (`run.ts:492`) with a human-readable place such as "Austin" or "Travis County".
18. **Add a PDF adapter** for Austin Chronicle issue PDFs and agenda documents (`voice.ts:429-432` currently rejects non-HTML).
19. **Add video transcripts as a real path.** `debate_video` leads are 10 per candidate at most, none fetched. Needed to satisfy PLAN §5 ("YouTube transcripts").
20. **Fill the contest rosters.** Add the missing opponents (Hinojosa, Blacklock, Hale, Kam/Heyman/Huang) so symmetry can be checked outside D9.

## 8. Reproducing

All numbers come from reading `candidate-checkpoints/*.json` and `web-cache/*.json`; scripts used were throwaway node snippets in `/tmp` (not committed). No repo source files were edited. The report is the only file written.
