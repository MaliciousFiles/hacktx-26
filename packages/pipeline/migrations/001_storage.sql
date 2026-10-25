-- Portable PostgreSQL: no Timescale/Supabase-specific extensions required.
-- Research is never a direct mobile API. App traffic reads app_data only.
CREATE SCHEMA IF NOT EXISTS research;
CREATE SCHEMA IF NOT EXISTS app_data;
REVOKE ALL ON SCHEMA research FROM PUBLIC;
REVOKE ALL ON SCHEMA app_data FROM PUBLIC;

CREATE TABLE IF NOT EXISTS research.runs (
  run_id text PRIMARY KEY,
  input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  archive_hash text NOT NULL CHECK (archive_hash ~ '^[a-f0-9]{64}$'),
  experimental boolean NOT NULL,
  analysis_evaluated boolean NOT NULL,
  as_of_date date NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS research.objects (
  content_hash text PRIMARY KEY CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  bytes bytea NOT NULL
);
CREATE TABLE IF NOT EXISTS research.artifacts (
  run_id text NOT NULL REFERENCES research.runs(run_id),
  kind text NOT NULL,
  content_hash text NOT NULL REFERENCES research.objects(content_hash),
  data jsonb NOT NULL,
  PRIMARY KEY (run_id, kind)
);
CREATE TABLE IF NOT EXISTS research.people (
  run_id text NOT NULL REFERENCES research.runs(run_id),
  candidate_id text NOT NULL,
  contest_id text NOT NULL,
  name text NOT NULL,
  analysis jsonb NOT NULL,
  coverage jsonb NOT NULL,
  PRIMARY KEY (run_id, candidate_id)
);
CREATE TABLE IF NOT EXISTS research.issues (
  run_id text NOT NULL REFERENCES research.runs(run_id),
  issue_id text NOT NULL,
  definition jsonb NOT NULL,
  PRIMARY KEY (run_id, issue_id)
);
CREATE TABLE IF NOT EXISTS research.sources (
  run_id text NOT NULL REFERENCES research.runs(run_id),
  source_id text NOT NULL,
  candidate_id text,
  contest_id text NOT NULL,
  source_type text NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  data jsonb NOT NULL,
  PRIMARY KEY (run_id, source_id),
  FOREIGN KEY (run_id, candidate_id) REFERENCES research.people(run_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS sources_candidate ON research.sources(run_id, candidate_id, source_type);
CREATE TABLE IF NOT EXISTS research.actions (
  run_id text NOT NULL,
  action_id text NOT NULL,
  actor_id text NOT NULL,
  action_date date NOT NULL,
  action_type text NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (run_id, action_id),
  FOREIGN KEY (run_id, actor_id) REFERENCES research.people(run_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS actions_actor_date ON research.actions(run_id, actor_id, action_date);
CREATE TABLE IF NOT EXISTS research.evidence (
  run_id text NOT NULL,
  evidence_id text NOT NULL,
  candidate_id text NOT NULL,
  source_id text NOT NULL,
  issue_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('action', 'voice')),
  data jsonb NOT NULL,
  PRIMARY KEY (run_id, evidence_id),
  FOREIGN KEY (run_id, source_id) REFERENCES research.sources(run_id, source_id),
  FOREIGN KEY (run_id, candidate_id) REFERENCES research.people(run_id, candidate_id),
  FOREIGN KEY (run_id, issue_id) REFERENCES research.issues(run_id, issue_id)
);
CREATE INDEX IF NOT EXISTS evidence_candidate_issue ON research.evidence(run_id, candidate_id, issue_id, kind);
CREATE TABLE IF NOT EXISTS research.classification_attempts (
  run_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  candidate_id text NOT NULL,
  source_id text NOT NULL,
  issue_id text NOT NULL,
  data jsonb NOT NULL,
  PRIMARY KEY (run_id, ordinal),
  FOREIGN KEY (run_id, source_id) REFERENCES research.sources(run_id, source_id),
  FOREIGN KEY (run_id, candidate_id) REFERENCES research.people(run_id, candidate_id),
  FOREIGN KEY (run_id, issue_id) REFERENCES research.issues(run_id, issue_id)
);
CREATE TABLE IF NOT EXISTS research.review_items (
  run_id text NOT NULL REFERENCES research.runs(run_id),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  data jsonb NOT NULL,
  PRIMARY KEY (run_id, ordinal)
);
CREATE TABLE IF NOT EXISTS research.snapshots (
  run_id text NOT NULL REFERENCES research.runs(run_id),
  snapshot_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('web', 'records')),
  content_hash text NOT NULL REFERENCES research.objects(content_hash),
  metadata jsonb NOT NULL,
  PRIMARY KEY (run_id, kind, snapshot_id)
);
CREATE TABLE IF NOT EXISTS research.model_calls (
  run_id text NOT NULL REFERENCES research.runs(run_id),
  cache_key text NOT NULL CHECK (cache_key ~ '^[a-f0-9]{64}$'),
  content_hash text NOT NULL REFERENCES research.objects(content_hash),
  data jsonb NOT NULL,
  PRIMARY KEY (run_id, cache_key)
);

-- Serving snapshots: payload is exactly the pre-reveal contract, NOT a join
-- over mutable research tables. Each release currently covers one official style.
CREATE TABLE IF NOT EXISTS app_data.releases (
  release_id text PRIMARY KEY,
  research_run_id text NOT NULL REFERENCES research.runs(run_id),
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[a-f0-9]{64}$'),
  bundle_hash text NOT NULL CHECK (bundle_hash ~ '^[a-f0-9]{64}$'),
  ballot_style_id text NOT NULL,
  as_of_date date NOT NULL,
  payload jsonb NOT NULL,
  approval jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_data.reveals (
  release_id text PRIMARY KEY REFERENCES app_data.releases(release_id),
  payload jsonb NOT NULL
);

-- Corrections are new rows/releases, never UPDATE/DELETE of existing evidence.
CREATE OR REPLACE FUNCTION research.reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Immutable artifact: import corrected data under a new run/release ID';
END;
$$;
DO $$
DECLARE target record;
BEGIN
  FOR target IN SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname IN ('research', 'app_data') LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = format('%I.%I', target.schemaname, target.tablename)::regclass AND tgname = 'immutable_artifact') THEN
      EXECUTE format('CREATE TRIGGER immutable_artifact BEFORE UPDATE OR DELETE OR TRUNCATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION research.reject_mutation()', target.schemaname, target.tablename);
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON ALL TABLES IN SCHEMA research FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA app_data FROM PUBLIC;
