# 78705 discovery follow-up (2026-10-25)

## Newly wired source paths

Texas history plans now include `acc-board-minutes`, `aisd-board-minutes`, and
`travis-office-records` alongside appellate opinions and commissioners' votes.
The factory registers all three. Their document budgets come from the same
per-candidate history policy; failures, unreadable inputs and unfinished work
remain partial coverage rather than empty success.

- **ACC:** current roster identity → current/archived official schedule tables →
  labeled minutes PDFs (including official links hosted on Google Drive).
  Date comes from the meeting inventory, not the download timestamp.
- **AISD:** current roster identity → public Diligent year inventories → published
  meeting-document lists → public minutes only, preferring adopted HTML. Agendas,
  non-public flags and closed document types are never substituted for minutes.
  The earlier BoardDocs public archive is checked separately; live access currently
  returns 403. Its legacy Lotus minutes traversal remains unverified; no denial,
  CAPTCHA or authentication bypass is used.
- **County offices/trial courts:** official current profiles establish office
  context, followed by linked reports and court-rule PDFs. This covers the county
  clerk, district clerk, treasurer and directory-discovered trial/JP courts. The
  adapter intentionally emits no personal actions from an office report or shared
  court rules. It does not collect case parties, juvenile, sealed or authenticated
  case records. Historical personal decisions are not inferred from office context.

Native minutes can produce explicitly named votes through the existing deterministic
minutes extractor with model fallback disabled. Private `ResearchDocument` records
are carried separately through the collector and pipeline's research/checkpoint
artifacts. They never become scoring Sources. These are records-package and private
pipeline extensions; the shared `packages/types/src/index.ts` contract is unchanged.

Image-only PDFs can now be explicitly retained as immutable original snapshots.
Local macOS PDFKit/Vision OCR produces a separately hashed, frozen derivative with
per-page text/confidence, OS and script version. OCR is serialized across workers,
bounded to 30 pages/180 seconds per document, and never replaces native snapshot
text. The derivative is also included in private research JSON for offline/database
archive review. Native-text evidence readers still reject empty PDFs by default.
On unsupported platforms or missing offline derivatives, the original remains
archived and the missing OCR is reported; there is no hidden cloud/model fallback.
**OCR remains unreviewed and does not automatically produce votes or exact quotes.**

Narrow live probes (not a full corpus):

| Candidate | Probe result |
| --- | --- |
| Julie Ann Nitsch | 8 in-window ACC minutes discovered; 2 sampled PDFs archived and OCR'd; 6 beyond the two-document probe budget; no accepted votes |
| Arati Singh | 13 published Diligent meetings listed; first 2 inspected had no public minutes; 11 beyond the probe budget; BoardDocs denied public access |
| Velva Price | 45 linked report PDFs discovered; 2 sampled reports archived; 43 beyond the probe budget; office context only |

The live probe windows and budgets were intentionally narrow adapter diagnostics,
not asymmetric production candidate budgets or an assertion of complete coverage.
The earlier observations below describe the investigation before these adapters
were connected; their former "not wired" status is superseded by this section.

These are bounded adapter checks, not a completed ballot-wide run or proof of
career-complete coverage. No new serving release was published.

## Appellate courts

`tx-court-opinions` is registered and included in Texas history plans without an
office-tenure configuration. Identity comes from an exact full-name match on an
official current appellate roster, with unique-surname attribution on release
pages. Panel membership alone never creates an action. This does not establish
historical tenure or cover former courts or trial courts.

Live checks for [2026-01-01, 2026-11-01):

| Candidate | Court | Release days scanned | Attributed written opinions |
| --- | --- | ---: | ---: |
| Scott Brister | 15th Court of Appeals | 109 | 31 |
| Jimmy Blacklock | Supreme Court | 23 | 7 |
| Maggie Ellis | 3rd Court of Appeals | 173 | 96 |

A separate Kevin Patrick Yeary check for October 2026 matched Judge Kevin Yeary
but found zero listed release days. That does not establish an empty judicial
record. CCA `Original by JUDGE ...` and dissent/concurrence labels are covered by
parser tests, but those fixture tests do not replace live CCA validation.

Records are docket metadata, not full opinion text or political policy positions.
Failed quarter/day requests, missing/mismatched printed day headings, and day or
action budgets are disclosed. Results remain partial even with no transport errors.

## Travis County Commissioners Court

The county's current official pages link to
<https://traviscotx.portal.civicclerk.com/>:

- <https://www.traviscountytx.gov/commissioners-court>
- <https://countyclerk.traviscountytx.gov/departments/commissioners-court/>

The portal uses `https://traviscotx.api.civicclerk.com/v1`. Its `/Events` and
`/Meetings/{agendaId}` endpoints match the existing structured CivicClerk adapter.
Texas history plans now attempt this source for every candidate, attributing only
explicit named votes, not item sponsors, attendance, or presumed unanimous votes.

An Andy Brown check for [2026-10-01, 2026-10-25) inspected three events and found
28 named votes across 28 motions. One event had no structured minutes motions;
the result is partial. These are raw source counts, not policy evidence counts.
The legacy IQM2 calendar returned no meeting listings in the inspected response;
it should not be used as evidence that meetings did not occur.

## Remaining blockers before the next complete corpus pass

- **ACC:** the official meeting schedule and archive publish minutes links:
  <https://offices.austincc.edu/board-of-trustees/board-meetings/> and its
  `meeting-archives/` child. Current minutes are linked Google Drive PDFs. The
  first two inspected current minutes PDFs produced no extractable text with the
  existing PDF reader. They need a verified OCR path (with original bytes,
  page provenance, and extraction checks), not invented named votes. This is a
  two-document observation, not a claim about the entire archive.
- **AISD:** <https://www.austinisd.org/board/meetings> links past BoardDocs records
  and a new Diligent portal. The district says meetings from July 2026 move to
  <https://austin-isd.community.diligentoneplatform.com/portal/>. Both histories
  still need automatic minutes discovery and explicit named-vote extraction.
- **Other county offices/trial courts:** county clerk, district clerk, treasurer,
  justice of the peace, and trial judges need office-appropriate official records.
  Lack of commissioners' votes or published appellate opinions says nothing
  about their performance or activity.
- **History:** current-roster identity, configured start dates, budgets, called
  sessions, prior courts, and incomplete inventories remain coverage limits.
- **Contracts:** earlier shared `@ftb/types` edits still require owner sign-off.

The corpus has not been relaunched by this follow-up. Finish source edits and run
`pnpm typecheck && pnpm test` before freezing the next implementation hash. Preserve
the existing `.old-code` archive and caches; do not overwrite a frozen run in place.
