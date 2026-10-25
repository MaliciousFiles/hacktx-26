# ballot-410A.sample.json — transcription notes

Source: user-supplied `410A.pdf` (Travis County Nov 3, 2026 sample ballot, style 410A, 4 pages, 2 sheets).
**410A is NOT the West Campus ballot.** It is a south-Austin style (CD 37, TX House 51, SBOE 5, Council D3, Commissioner/JP/Constable Pct 4, AISD At-Large 9, ACC 1–3) used only as a coverage reference. Config is `demo: true`, research-only; run with `--research-only`.

Counts: 55 contests, 97 candidates (all ballot candidates transcribed; no write-ins).

## Transcription
- Names, order, and party tags were read from the page images and cross-checked against the (right-truncated) extracted text. Party tags are mapped REP/DEM/LIB/GRN to Republican/Democrat/Libertarian/Green; nonpartisan contests (TCAD, Council, ACC, AISD) have no party.
- Nicknames in quotes become aliases, following `cleanName` in `packages/records/src/ballot/roster.ts`: `Maria Luisa "Lulu" Flores` → name `Maria Luisa Flores`, aliases `[Maria Luisa "Lulu" Flores, Lulu Flores]`; `Eduardo "Lalito" Romero` likewise.
- Contest ids/offices/officeKind/districtType/jurisdiction/level follow roster.ts slugs (`us_house`, `tx_house`, `tx_sboe`, `tx_supreme_court`, `tx_district_judge`, `county_court_at_law_judge`, `appraisal_district_director`, `city_council`, `college_trustee`, `school_board`, ...). Ids with identical 40-char title prefixes get a numeric suffix, as roster.ts does.
- Contest titles are the printed English titles (e.g. "Judge, Court of Criminal Appeals, Place 3"), with the comma kept.
- `incumbent: false`, `recordInOffice: "none"` for everyone, as in the derived configs: the ballot does not say who holds office.
- `web`/`records` settings are copied from the West Campus derived config; `records.exhaustive: true`, `since: 2003-01-01`.

## Caveats
- The page-1 text layer is clipped at the right edge, so all of page 1's third column was verified from the image only (SBOE 5, TX House 51, CCA Place 9, 15th/3rd Courts of Appeals, district judges). Names read clearly; none are unreadable.
- The sample page carries a diagonal "SAMPLE BALLOT" watermark that overlaps some names (e.g. Allison Bush, Jessica Martinez, Maria Luisa "Lulu" Flores, Okey Anyiam). Spellings were confirmed against the county consolidated ballot (`dist/ballot-discovery-2026-11-03/consolidated-*.txt`).
- Single-candidate partisan contests (all judges, county offices) are transcribed as-is; no opponents are printed on this style. Write-in lines are not candidates and are omitted.
- Provenance URL is the county election page (`https://votetravis.gov/current-election-information/current-election/`), because the user's PDF has no public URL. `verifiedBy` documents that the content came from manual transcription.
- Uncertain: "Chief Justice, 3rd Court of Appeals District" is printed this way (no "Place"); the config office is `tx_3rd_court_of_appeals` with districtType `court_of_appeals`, districtId `3`, as in roster.ts.

## Propositions A–J (omitted — measures, not candidates)
`ballotRunSchema` accepts `officeKind: "measure"` with `candidates: []` (see `ballot-run.demo.json`), but measures have no one to research, and `address-run.ts` excludes them from rosters. They are listed here instead:
- City of Austin Bond Election: **A** $260,000,000 parks/recreation/aquatic/open-space bonds (tax increase); **B** $35,000,000 library facilities bonds (tax increase).
- City of Austin Special Election (charter amendments): **C** Independent Citizens Redistricting Commission (independence from Council, review after boundary changes, student-member exceptions, effective date, larger appointee pool, vacancy timing, staff communication); **D** delete weekly-Council-meeting requirement; **E** delete requirement that Council set rules/order of business by ordinance; **F** clarify "election" and set campaign contribution/expenditure limit adjustment by Jan 1 each year; **G** initiative and petitioned charter-amendment elections held at next available even-year November date; **H** Council appoints and removes the City Attorney; **I** require an Independent Affordability and Efficiency Initiative before tax-rate-increase elections; **J** non-substantive corrections and removal of moot/superseded language.
