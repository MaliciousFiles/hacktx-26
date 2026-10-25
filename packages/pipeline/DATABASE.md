# Research storage and frozen app releases

Portable PostgreSQL (local, Tiger Data, or Supabase). No hosted instance has been
provisioned and no artifacts have been uploaded. `src/database/cli.ts` is the
offline importer; the API never calls models or reads research tables.

## Two boundaries

- `research`: versioned runs, exact input/configuration, issue-axis definitions,
  people, extracted sources, official actions, accepted evidence, rejected model
  attempts, review queue, coverage, immutable original response bytes, snapshots,
  and frozen model requests/responses. Research is private, including failed data.
- `app_data`: validated frozen ballot payloads and separate identity reveals.
  Publication is an explicit operation, not an import side effect. Experimental
  samples and research-only runs cannot publish. Each release currently covers
  **one official ballot style**; multi-style election manifests are not implemented.

JSONB retains full contract-shaped artifacts; indexed relational columns support
candidate/issue/action queries. Raw bytes are SHA-256-addressed and deduplicated.
The importer verifies input/source/cache hashes and exact accepted quote spans.
An archive hash binds the full inventory, including failures and raw snapshots.
Transactions prevent partial imports. Reimporting the identical archive is safe;
changed data requires a new run ID. UPDATE, DELETE, and TRUNCATE are rejected.

## Local development (no server or account required)

From the repository root:

```sh
pnpm -F @ftb/pipeline db migrate --local .cache/research-db
pnpm -F @ftb/pipeline db import --local .cache/research-db \
  --run dist/politician-reviews/politician-review-2026-10-24-v1
pnpm -F @ftb/pipeline db status --local .cache/research-db
```

Paths are relative to `packages/pipeline`. This uses PGlite (embedded PostgreSQL,
development dependency), not a network PostgreSQL server; the API cannot connect
to that embedded directory with a PostgreSQL URL. For API development use a local
PostgreSQL server, or retain the file-backed API. Do not open the same embedded
directory in concurrent processes. The current importer loads one bounded sample
archive into memory; large career crawls need streaming/object storage work.

Actual v1 local import: 1 run, 3 people, 19 sources (13 web + 6 action sources),
6 actions, 47 attempts, 52 snapshots, 130 model calls, **0 accepted evidence and
0 serving releases**. These are narrow manually configured experimental samples,
not complete careers or a successful political accuracy evaluation.

## PostgreSQL deployment and roles

Set `DATABASE_WRITE_URL` in the ignored root `.env`; run the same commands without
`--local`. Use a dedicated connected client for imports, not transaction-pooling
calls on different connections. Configure provider-required TLS through the URL;
never disable certificate verification. Do not expose database credentials to apps.

Run migrations using the schema owner. Provision separate non-owner login roles
using your provider's credential manager, then grant only what is necessary:

```sql
GRANT USAGE ON SCHEMA research, app_data TO pipeline_writer;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA research TO pipeline_writer;
GRANT SELECT, INSERT ON app_data.releases, app_data.reveals TO pipeline_writer;
GRANT USAGE ON SCHEMA app_data TO api_reader;
GRANT SELECT ON app_data.releases, app_data.reveals TO api_reader;
```

The API uses **only** `DATABASE_READ_URL` with `api_reader`. Do not use schema-owner,
Supabase service-role, or writer credentials. PUBLIC access is revoked in the
migration. Keep both schemas out of Supabase's exposed Data API schemas. Audit
provider-inherited role grants, backups, connection/access logs, and retention;
schema grants do not neutralize a provider's previously granted broad privileges.
No address, swipe history, picks, or user vectors belong in either schema.

## Explicit publication

First produce a nonexperimental, validated serving release from a reviewed run,
then import its research archive. A human review artifact must contain:

```json
{
  "decision": "publish",
  "reviewedBy": "reviewer identifier",
  "reviewedAt": "2026-10-24T00:00:00Z",
  "archiveHash": "64-character archive hash returned by import",
  "manifestHash": "64-character manifest hash in the release"
}
```

```sh
pnpm -F @ftb/pipeline db publish --run path/to/run --approval path/to/approval.json
```

This is a review audit record, **not a cryptographic signature or authentication
system**: restrict writer access and enforce review policy operationally. Hash,
identity, citation, evidence, and privacy gates supplement—not replace—accuracy,
bias, framing, coverage, and calibration review. Corrections create a new release;
clients continue requesting their pinned `releaseId`. The API keeps existing
`/ballot` and contest-scoped `/reveal/:contestId` contracts, never serves research,
and verifies the stored manifest before serving. No mobile UI changes are included.
