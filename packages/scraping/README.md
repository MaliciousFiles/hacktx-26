# Contemporary voice and context collection

`@ftb/scraping` collects campaign platforms, questionnaires, forum/speech pages,
news, and candidates' reviewed social accounts. This is an **offline publication
job that fetches the live web**, not a model or scraper running when a voter opens
the app. It does not produce stance scores, allegations, or finished profiles.

## Run

```sh
pnpm -F @ftb/scraping collect \
  --config examples/run.json \
  --cache .cache/my-run-id \
  --output output/my-run.json
```

Paths are relative to `packages/scraping` under `pnpm -F`. The example is explicitly
synthetic: replace its target list with the pipeline's verified ballot candidates.
Use **one shared window, limits, outlet policy and provider selection** for the
entire contest, not different budgets based on a candidate's prominence.

Credentials come from the root `.env`: `SERPAPI_API_KEY`, and optionally
`X_BEARER_TOKEN`. No key is needed for reviewed Bluesky accounts or campaign seeds.
Without SerpApi, discovery is reported `not_configured`; it is not a zero-result
search. News/questionnaire domains come from `config/sources.yaml`. The run config
supplies speech domains and an exact `allowedPageHosts` network allowlist (include
the actual `www`/subdomain variants). Search results **cannot expand** this list.

The config uses the same `CandidateResearchRequest` as records; `contestId` is
added by the pipeline. Optional `searchContext` should be a human-readable office
and place, e.g. `Texas House District 54`, rather than an opaque jurisdiction ID.
Eight fixed queries run for every target: platforms, questionnaires, candidate
debates, **contest-wide debates**, forums/town halls, YouTube debate recordings,
other speeches, and news. Contest-wide queries deliberately omit a candidate name
so a generically titled full-race forum is discoverable; their responses are
shared through the cache for opponents. Debate searches include the election
year. No templates target scandals, praise, or a preferred stance.

### Debates first

Look at `voice[].leads` with `priority: "debate_review"` first. These are pages or
recordings whose metadata mentions a debate/forum/town hall, **not verified
participation**. `candidateMatch` distinguishes a name appearing in metadata from
unverified identity; neither proves who spoke. Check the event date, office,
participants, moderator and whether the recording is complete before approving
transcript speaker spans. Video leads remain available even when no transcript
could be fetched. Unrelated search hits and old/undated recordings are never
silently presented as a verified current-election debate.

### Reviewed identity and document mappings

```json
{
  "campaignSites": [
    {
      "candidateId": "pipeline-person-id",
      "url": "https://campaign.example/",
      "verifiedVia": "https://evidence.example/candidate-profile"
    }
  ],
  "verifiedDocuments": [
    {
      "url": "https://forum.example/transcript",
      "type": "debate_speech",
      "verifiedVia": "https://forum.example/event"
    }
  ]
}
```

These are upstream **reviewed assertions**, not automatic URL verification. A
name match in search does not establish someone's campaign domain or account.
Campaign roots and one hop of same-origin issues/platform links are fetched within
the cap. Sources on another candidate's mapped domain are not assigned to them.
Account mappings similarly require an HTTPS `verifiedVia` evidence URL.

Query intent isn't document type: an article mentioning a forum stays `news`.
Only a reviewed `verifiedDocuments` entry makes a page `questionnaire` or
`debate_speech`. Other non-news pages stay frozen discovery leads pending review.
News and multi-speaker sources have **no automatic candidate attribution**.

## Determinism and artifacts

- `FrozenWebClient` saves original response bytes, hash, safe URL, HTTP status,
  content type, and the fixed snapshot date. Requests are throttled per host,
  timeout/byte bounded, and replayed rather than repeated. Auth headers and API
  query credentials are not written into request metadata.
- Use a **new cache directory per collection run**. There is no implicit refresh.
  Raw snapshots are private pipeline artifacts, not app payloads. Keep the same
  provider credentials for replay because request identities include their hash.
- Repeat with `--offline` to rebuild without any network calls. A missing or
  hash-mismatched snapshot fails closed. Offline replay tests compare full output.
- `voice-v1` deterministically extracts readable HTML text into immutable
  `Source.originalText`; `Source.contentHash` hashes that extracted text, **not
  HTML bytes**. The `provenance` sidecar links each Source to its raw response
  snapshot and extractor version. `Source.text` is a separate normalized copy.
- Real publication must also freeze this output, code revision, configuration and
  identity mappings in the pipeline's release manifest; this command isn't a
  replacement for publication validators.

The output contains voice `sources`, search `leads`, proposed `quotes`, per-channel
and per-page `coverage`, raw `snapshots`, plus social sources/platform reports.
Search snippets are leads, **not fetched articles or transcripts**. The existing
social finders explicitly distinguish `social_snippet` from full `social_post`.

Quote extraction uses punctuation rules and exact UTF-16 spans. Every lead is
marked `requiresAttributionReview`; it does **not** establish who said it or that
it is "notable." It catches some quotable passages cheaply without inventing
words. Selecting consequential quotes and approving speaker spans remains a
review/classification task before the pipeline's exact-quote publication gate.

`duplicateSources` groups identical normalized text while retaining each source's
provenance. Consume these groups as one evidence event. Near-identical wire copies,
an article about a speech, and a press release about the same speech still require
downstream event/syndication deduplication; raw mention count is never confidence.

## Dates and limitations

The window must end no later than fixed `fetchedAt` (usually the release's
`asOfDate`), even when the election is still in the future. Page publication
metadata and platform/search dates remain distinct from fetch time. An undated
campaign page is `page_observed`, **not a new statement made today**. Undated news
or speeches stay `unknown`; known out-of-window pages are excluded from this
contemporary pass. Historical research is a separate collection window.

Robots exclusions/unavailable robots policies, HTTP errors, redirects, oversized
pages and detected anti-bot challenges produce gaps. No browser execution,
paywall/login bypass, residential proxies, or automatic redirect following.
Hosts are operator-reviewed public destinations; this is an operator-run tool,
**not an API that accepts arbitrary user-supplied URLs**.

Speech discovery supports readable HTML transcripts and reporting. YouTube
discovery currently supplies channel title/description snippets, **not captions**;
audio transcription and caption retrieval aren't implemented. Restricted social
platforms rely on clearly labeled search snippets unless a supported API is
configured. Campaign/account identity discovery still needs reviewed mappings.

Budgets are explicit and coverage is never declared exhaustive. Exit `0` means
no acquisition/configuration errors, **not publishability or adequate evidence**;
`2` means acquisition gaps/review-needed pages (output still written), `1` invalid
configuration/fatal failure. All sources still pass pipeline publication gates.

## Tests

```sh
pnpm typecheck && pnpm test
```

Offline fixtures cover query symmetry, snapshots/replay, robots, budgets, exact
spans, attribution abstention, duplicate text, dates, and platform ownership.
Live checks are explicit CLI runs, never CI network calls.
