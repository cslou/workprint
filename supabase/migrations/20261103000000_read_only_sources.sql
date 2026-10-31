-- Reserved immutable source namespace only; this migration inserts no examples.
ALTER TABLE artifacts.artifacts ADD COLUMN built_in boolean NOT NULL DEFAULT false;
ALTER TABLE artifacts.artifacts ADD COLUMN built_in_revision bigint;
ALTER TABLE artifacts.artifacts ADD CONSTRAINT builtin_source_namespace
  CHECK (NOT built_in OR (owner_id='workprint-built-in' AND built_in_revision IS NOT NULL AND built_in_revision>0));
CREATE UNIQUE INDEX artifact_public_identity ON artifacts.artifacts(artifact_id);
REVOKE INSERT ON artifacts.artifacts FROM wp_serving;
GRANT INSERT (owner_id,artifact_id,kind,created_at) ON artifacts.artifacts TO wp_serving;

CREATE FUNCTION artifacts.protect_builtin_content() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_TABLE_NAME='artifacts' THEN
    IF OLD.built_in THEN RAISE EXCEPTION 'Built-in content is immutable' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' AND NEW.built_in THEN
      INSERT INTO artifacts.publication_counters(owner_id,revision) VALUES(NEW.owner_id,1)
        ON CONFLICT(owner_id) DO UPDATE SET revision=artifacts.publication_counters.revision+1
        RETURNING revision INTO NEW.built_in_revision;
    END IF;
  ELSIF EXISTS(SELECT 1 FROM artifacts.artifacts a WHERE a.owner_id=NEW.owner_id AND a.artifact_id=NEW.artifact_id AND a.built_in) THEN
    RAISE EXCEPTION 'Built-in content is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION artifacts.protect_builtin_content() FROM PUBLIC;
CREATE TRIGGER sealed_builtin_artifact BEFORE UPDATE OR DELETE ON artifacts.artifacts
  FOR EACH ROW EXECUTE FUNCTION artifacts.protect_builtin_content();
CREATE TRIGGER sealed_builtin_version BEFORE INSERT ON artifacts.versions
  FOR EACH ROW EXECUTE FUNCTION artifacts.protect_builtin_content();

-- A human's use/dependency remains theirs; an immutable source is never copied.
ALTER TABLE artifacts.conversation_uses ADD COLUMN version_owner_id text;
UPDATE artifacts.conversation_uses SET version_owner_id=owner_id;
ALTER TABLE artifacts.conversation_uses ALTER COLUMN version_owner_id SET NOT NULL;
ALTER TABLE artifacts.conversation_uses DROP CONSTRAINT conversation_uses_owner_id_version_id_fkey;
ALTER TABLE artifacts.conversation_uses ADD FOREIGN KEY(version_owner_id,version_id)
  REFERENCES artifacts.versions(owner_id,version_id);
ALTER TABLE artifacts.version_dependencies ADD COLUMN dependency_owner_id text;
UPDATE artifacts.version_dependencies SET dependency_owner_id=owner_id;
ALTER TABLE artifacts.version_dependencies ALTER COLUMN dependency_owner_id SET NOT NULL;
ALTER TABLE artifacts.version_dependencies DROP CONSTRAINT version_dependencies_owner_id_dependency_id_fkey;
ALTER TABLE artifacts.version_dependencies ADD FOREIGN KEY(dependency_owner_id,dependency_id)
  REFERENCES artifacts.versions(owner_id,version_id);

CREATE FUNCTION artifacts.authorize_version_link() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE source_owner text; source_builtin boolean; target_id text;
BEGIN
  IF TG_TABLE_NAME='conversation_uses' THEN
    target_id:=NEW.version_id;
  ELSE
    IF EXISTS(SELECT 1 FROM artifacts.versions v JOIN artifacts.artifacts a USING(owner_id,artifact_id,kind)
      WHERE v.owner_id=NEW.owner_id AND v.version_id=NEW.version_id AND a.built_in) THEN
      RAISE EXCEPTION 'Built-in content is immutable' USING ERRCODE='23514';
    END IF;
    target_id:=NEW.dependency_id;
  END IF;
  SELECT v.owner_id,a.built_in INTO source_owner,source_builtin FROM artifacts.versions v
    JOIN artifacts.artifacts a USING(owner_id,artifact_id,kind) WHERE v.version_id=target_id;
  IF source_owner IS NULL OR (source_owner<>NEW.owner_id AND NOT source_builtin) THEN
    RAISE EXCEPTION 'Version link is not owned or read-only' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='conversation_uses' THEN NEW.version_owner_id:=source_owner;
  ELSE NEW.dependency_owner_id:=source_owner; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION artifacts.authorize_version_link() FROM PUBLIC;
CREATE TRIGGER owned_or_builtin_use BEFORE INSERT OR UPDATE ON artifacts.conversation_uses
  FOR EACH ROW EXECUTE FUNCTION artifacts.authorize_version_link();
CREATE TRIGGER owned_or_builtin_dependency BEFORE INSERT ON artifacts.version_dependencies
  FOR EACH ROW EXECUTE FUNCTION artifacts.authorize_version_link();
