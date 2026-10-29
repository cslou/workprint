-- Native schemas are exclusively initialized by the supported native runtime.
CREATE SCHEMA artifacts;
REVOKE ALL ON SCHEMA artifacts FROM PUBLIC;
GRANT USAGE ON SCHEMA artifacts TO wp_serving;

CREATE TABLE artifacts.artifacts (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  artifact_id text NOT NULL CHECK (length(artifact_id) BETWEEN 1 AND 200),
  kind text NOT NULL CHECK (kind IN ('script', 'reference', 'storyboard')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, artifact_id),
  UNIQUE (owner_id, artifact_id, kind)
);

CREATE TABLE artifacts.versions (
  owner_id text NOT NULL,
  version_id text NOT NULL CHECK (length(version_id) BETWEEN 1 AND 200),
  artifact_id text NOT NULL,
  kind text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  schema_version integer NOT NULL CHECK (schema_version = 1),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object' AND content @> '{"schemaVersion":1}'::jsonb),
  origin_conversation_id text NOT NULL CHECK (length(origin_conversation_id) BETWEEN 1 AND 200),
  created_by text NOT NULL CHECK (created_by IN ('human', 'assistant')),
  provenance text NOT NULL CHECK (provenance IN ('test_setup', 'manual', 'assistant')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, version_id),
  UNIQUE (version_id),
  UNIQUE (owner_id, artifact_id, revision),
  FOREIGN KEY (owner_id, artifact_id, kind) REFERENCES artifacts.artifacts(owner_id, artifact_id, kind),
  CHECK (provenance <> 'assistant' OR created_by = 'assistant')
);

CREATE TABLE artifacts.version_dependencies (
  owner_id text NOT NULL,
  version_id text NOT NULL,
  dependency_id text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (owner_id, version_id, dependency_id),
  UNIQUE (owner_id, version_id, position),
  FOREIGN KEY (owner_id, version_id) REFERENCES artifacts.versions(owner_id, version_id),
  FOREIGN KEY (owner_id, dependency_id) REFERENCES artifacts.versions(owner_id, version_id),
  CHECK (version_id <> dependency_id)
);

CREATE TABLE artifacts.conversation_uses (
  owner_id text NOT NULL,
  conversation_id text NOT NULL CHECK (length(conversation_id) BETWEEN 1 AND 200),
  use_id text NOT NULL CHECK (length(use_id) BETWEEN 1 AND 200),
  version_id text NOT NULL,
  binding jsonb NOT NULL CHECK (jsonb_typeof(binding) = 'object'),
  purpose text NOT NULL CHECK (purpose IN ('script', 'reference', 'storyboard')),
  state text NOT NULL CHECK (state IN ('draft', 'approved')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, use_id),
  UNIQUE (owner_id, conversation_id, version_id, binding),
  FOREIGN KEY (owner_id, version_id) REFERENCES artifacts.versions(owner_id, version_id),
  CHECK (COALESCE(binding ->> 'purpose' = purpose, false))
);
CREATE UNIQUE INDEX conversation_single_work ON artifacts.conversation_uses(owner_id, conversation_id, purpose) WHERE purpose IN ('script', 'storyboard');
CREATE INDEX versions_owned_history ON artifacts.versions(owner_id, artifact_id, revision DESC);
CREATE INDEX versions_owned_library ON artifacts.versions(owner_id, created_at DESC, version_id DESC);
CREATE INDEX uses_owned_workspace ON artifacts.conversation_uses(owner_id, conversation_id);

CREATE FUNCTION artifacts.reject_version_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Saved versions and dependencies are immutable' USING ERRCODE = '23514';
END;
$$;
REVOKE ALL ON FUNCTION artifacts.reject_version_mutation() FROM PUBLIC;
CREATE TRIGGER immutable_version BEFORE UPDATE OR DELETE ON artifacts.versions
  FOR EACH ROW EXECUTE FUNCTION artifacts.reject_version_mutation();
CREATE TRIGGER immutable_dependency BEFORE UPDATE OR DELETE ON artifacts.version_dependencies
  FOR EACH ROW EXECUTE FUNCTION artifacts.reject_version_mutation();

REVOKE ALL ON ALL TABLES IN SCHEMA artifacts FROM PUBLIC;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA artifacts TO wp_serving;
