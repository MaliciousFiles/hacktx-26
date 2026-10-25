# West Campus (ZIP 78705) — derived roster, discrepancies, research notes

Address: "600 W 26th St., Austin, TX 78705" (not written to any artifact). Election Nov 3, 2026. Generated with
`pnpm -F @ftb/pipeline corpus --address "…" --dry-run --out dist/corpus-westcampus` (release `corpus-78705-2026-11-03-a44ca94c`).
The roster is derived from the county's countywide consolidated ballot and is NOT an official ballot style (`demo: true`).

## Files
- `ballot-westcampus-78705.derived.json` — the tool's output, unchanged except `records.exhaustive: true`. 49 contests, 91 candidates. Known to contain parser errors (below).
- `ballot-westcampus-78705.corrected.json` — derived + three parser fixes below. 53 contests, 95 candidates. Prefer this for runs.
- `ballot-pilot-westcampus.json` — 8 contests, 9 candidates.

## Districts resolved (county address index)
CD G37, TX House L49, TX Senate N14, SBOE B05, Austin Council CA9, Precinct 315 (split 315.2), Commissioner P03, JP/Constable J05, ISD S01 / ISDSMD T44, College ACC.

## Derived contests (49)
US Senate (3); US House 37 (2: Peña, Casar); Governor (3); Lt Gov (4); AG (3); Comptroller (4); GLO (3); Agriculture (3); Railroad (3); Supreme Court Chief + Places 2/7/8 (2 each); CCA Places 3/4/9; SBOE 5 (Arellano, Bush); **TX House 49 (Montserrat Garibay – Democrat; Arshia Papari – Green; no Republican)**; 15th COA (3 contests); 3rd COA Chief (Liu, Byrne); 10 district judges (147, 201, 250, 261, 299, 331, 403, 419, 455, 459; one candidate each); County Judge; CCL 2–7; Probate 1; District Clerk; County Clerk; County Treasurer; **JP Pct 5 (Tanisa Jeffers, unopposed)**; **Council D9 (Rich Heyman, Katie Kam, Zohaib "Zo" Qadri, Dave Thadani, Kai Huang)**; ACC Places 1 (2), 2 (1), 3 (2); AISD At-Large 9 (Soliz, Becker, Mathai).

TX Senate 14 is NOT in the derived roster and is not on the county consolidated ballot (only State Senator District 21 appears there). Texas Senate seats are staggered, so SD 14 is presumably not up in 2026; unverified against the SOS candidate list.

## Discrepancies vs the county consolidated ballot and 410A
1. **Todd Wong mis-assigned (parser bug).** In the consolidated text, "Judge, County Court at Law No. 1" is orphaned from its candidate by the two-column layout, so Todd Wong landed under County Judge. 410A prints Andy Brown alone for County Judge and Todd Wong for CCL No. 1. Derived config has Wong under County Judge and no CCL 1 contest. Fixed in `.corrected.json`.
2. **TCAD Board of Directors Places 1–3 missing** (4 candidates: Place 1 Skyler A. Korgel; Place 2 Brian Peña; Place 3 Yvonne Muñoz, Phil Gorman). They are countywide (on 410A and in the consolidated text) so they belong on the West Campus ballot. The nonpartisan title regex `NONPARTISAN_TITLE` does not match the consolidated text, where the title wraps ("Travis Central Appraisal District," / "Travis County, Board of"), so these were silently dropped (not even in `skipped`). Added in `.corrected.json`. Place 1/2 are unopposed.
3. **Austin ISD single-member seat skipped** (documented limitation). The county ISDSMD code T44 isn't mapped to a trustee district number; skipped: Districts 1, 4, 6, 7. Candidates (county consolidated ballot, confirmed by https://www.austinisd.org/board/elections): D1 Cheryl Bradley, Candace L. Hunter; D4 Edward M. Bradfield, Tricia Mitchell Kim, Jessica Neufeld; D6 Sarah Dille, Alex San Martin, Marie Lebron; D7 Jimmy Counihan, Laurie Solis. D7 is southwest Austin (https://communityimpact.com/southwest-austin-dripping-springs/election/qa-meet-the-candidates-for-austin-isd-district-7-ahead-of-nov-3-election/), D4 is "central and northwest Austin" (Anderson HS, Lamar MS, Gullett Elem.; https://austincurrent.org/2026/10/19/austin-austinisd-candidates-election-board/), D6 south Austin (https://austincurrent.org/2026/10/19/austin-austinisd-texas-district6-schoolboard-trustee/). **West Campus is most plausibly D4, but I could not verify it** from the trustee boundary map (https://www.austinisd.org/modules/custom/schools/maps/trustees.html?v9 is an interactive map). Not added to the config; confirm with the AISD boundary lookup before adding the 3 D4 candidates. At-Large 9 applies to everyone in AISD.
4. **Commissioner Pct 3 not up.** Only Pct 2 and 4 are on the 2026 county ballot, so West Campus (P03) correctly has no commissioner contest. Same pattern as 410A (Pct 4).
5. **JP Pct 5 on the ballot (Tanisa Jeffers, DEM, unopposed); Constable Pct 5 is not.** The only constable race is Precinct 4 (unexpired term, Gabriel Padilla), so the J05 address correctly has no constable contest.
6. **ACC Places 1–3 are districtwide** and match 410A. Candidate list per the county ballot: P1 Dana Walker, Gloria Gonzales-Dholakia; P2 Gigi Edwards Bryant; P3 Trevor Hale, Nan McRaven. Background: https://austincurrent.org/2026/10/16/austin-community-college-board-candidates-2026-election/ (not fetched in full).
7. **Differences vs 410A, as expected:** CD 37 and SBOE 5 are shared. TX House 49 (not 51), Council D9 (not D3), JP5 (not JP4), no Commissioner Pct 4, no Constable Pct 4 (410A has Gabriel Padilla). Statewide, judicial, countywide, ACC, and AISD At-Large 9 are the same.
8. Propositions (City of Austin A–J apply citywide, as on 410A) are not in the roster, as per the address-run.ts notes.

## Not verified
- Council D9 and TX House 49 candidate lists are taken from the county consolidated ballot only (https://votetravis.gov/wp-content/uploads/G26-Bedsheet-Ballot-Corrected-Final2.pdf); I did not cross-check them with the City Clerk or SOS.
- The West Campus AISD district number (see 3), and whether SD 14 is up in 2026.
- Incumbency: all candidates are `incumbent:false`/`recordInOffice:"none"` (unknown from the ballot).
