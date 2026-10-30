-- Upload policy and coordination are application-owned, never native conversation state.
ALTER TABLE artifacts.artifacts DROP CONSTRAINT artifacts_kind_check;
ALTER TABLE artifacts.artifacts ADD CONSTRAINT artifacts_kind_check CHECK (kind IN ('script','reference','storyboard','image','video'));
ALTER TABLE artifacts.versions DROP CONSTRAINT versions_provenance_check;
ALTER TABLE artifacts.versions ADD CONSTRAINT versions_provenance_check CHECK (provenance IN ('test_setup','manual','assistant','upload'));
ALTER TABLE artifacts.versions ADD CONSTRAINT upload_is_human CHECK (provenance <> 'upload' OR created_by = 'human');
ALTER TABLE artifacts.conversation_uses DROP CONSTRAINT conversation_uses_purpose_check;
ALTER TABLE artifacts.conversation_uses ADD CONSTRAINT conversation_uses_purpose_check CHECK (purpose IN ('script','reference','storyboard','panel_image','shot_video'));

CREATE TABLE artifacts.uploads (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  upload_id text NOT NULL CHECK (length(upload_id) BETWEEN 1 AND 200),
  conversation_id text NOT NULL CHECK (length(conversation_id) BETWEEN 1 AND 200),
  request_operation_id text NOT NULL CHECK (length(request_operation_id) BETWEEN 1 AND 200),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  kind text NOT NULL CHECK (kind IN ('image','video')),
  content_type text NOT NULL CHECK (content_type IN ('image/png','image/jpeg','video/mp4')),
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 67108864),
  intended_use jsonb,
  target_version_id text,
  staging_key text NOT NULL UNIQUE CHECK (staging_key ~ '^staging/[a-f0-9-]+/[a-f0-9-]+$'),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '5 minutes'),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','confirmed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 10),
  lease_token text,
  lease_expires_at timestamptz,
  cleanup_token text,
  cleanup_expires_at timestamptz,
  confirmed_result jsonb,
  PRIMARY KEY (owner_id,upload_id),
  UNIQUE (owner_id,conversation_id,request_operation_id),
  UNIQUE (owner_id,upload_id,conversation_id),
  FOREIGN KEY (owner_id,target_version_id) REFERENCES artifacts.versions(owner_id,version_id),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
  CHECK ((cleanup_token IS NULL) = (cleanup_expires_at IS NULL)),
  CHECK ((state = 'confirmed') = (confirmed_result IS NOT NULL)),
  CHECK ((kind = 'image' AND content_type IN ('image/png','image/jpeg') AND byte_size <= 10485760) OR (kind = 'video' AND content_type = 'video/mp4'))
);
CREATE TABLE artifacts.upload_confirmations (
  owner_id text NOT NULL,
  conversation_id text NOT NULL,
  operation_id text NOT NULL CHECK (length(operation_id) BETWEEN 1 AND 200),
  upload_id text NOT NULL,
  PRIMARY KEY (owner_id,conversation_id,operation_id),
  FOREIGN KEY (owner_id,upload_id,conversation_id) REFERENCES artifacts.uploads(owner_id,upload_id,conversation_id)
);
CREATE TABLE artifacts.upload_objects (
  owner_id text NOT NULL,
  object_key text NOT NULL CHECK (object_key ~ '^(staging|published|posters)/[a-f0-9-]+/[a-f0-9-]+$'),
  upload_id text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('staging','candidate','poster')),
  protected_version_id text,
  last_cleanup_at timestamptz,
  cleanup_failures integer NOT NULL DEFAULT 0 CHECK (cleanup_failures >= 0),
  PRIMARY KEY (owner_id,object_key),
  UNIQUE (object_key),
  FOREIGN KEY (owner_id,upload_id) REFERENCES artifacts.uploads(owner_id,upload_id),
  FOREIGN KEY (owner_id,protected_version_id) REFERENCES artifacts.versions(owner_id,version_id)
);
CREATE TABLE artifacts.media_objects (
  owner_id text NOT NULL,
  version_id text NOT NULL,
  object_key text NOT NULL,
  poster_key text,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  poster_sha256 text CHECK (poster_sha256 ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (owner_id,version_id),
  FOREIGN KEY (owner_id,version_id) REFERENCES artifacts.versions(owner_id,version_id),
  FOREIGN KEY (owner_id,object_key) REFERENCES artifacts.upload_objects(owner_id,object_key),
  FOREIGN KEY (owner_id,poster_key) REFERENCES artifacts.upload_objects(owner_id,object_key),
  CHECK ((poster_key IS NULL) = (poster_sha256 IS NULL))
);
CREATE INDEX upload_objects_cleanup ON artifacts.upload_objects(owner_id,upload_id) WHERE protected_version_id IS NULL;
CREATE TRIGGER immutable_upload_result BEFORE UPDATE ON artifacts.uploads FOR EACH ROW WHEN (OLD.confirmed_result IS NOT NULL AND (NEW.confirmed_result IS DISTINCT FROM OLD.confirmed_result OR NEW.state <> 'confirmed')) EXECUTE FUNCTION artifacts.reject_version_mutation();
CREATE TRIGGER immutable_published_object_reference BEFORE UPDATE OF protected_version_id ON artifacts.upload_objects FOR EACH ROW WHEN (OLD.protected_version_id IS NOT NULL AND NEW.protected_version_id IS DISTINCT FROM OLD.protected_version_id) EXECUTE FUNCTION artifacts.reject_version_mutation();
CREATE TRIGGER immutable_upload_confirmation BEFORE UPDATE OR DELETE ON artifacts.upload_confirmations FOR EACH ROW EXECUTE FUNCTION artifacts.reject_version_mutation();
CREATE TRIGGER immutable_media_object BEFORE UPDATE OR DELETE ON artifacts.media_objects FOR EACH ROW EXECUTE FUNCTION artifacts.reject_version_mutation();
REVOKE ALL ON artifacts.uploads,artifacts.upload_confirmations,artifacts.upload_objects,artifacts.media_objects FROM PUBLIC;
GRANT SELECT,INSERT ON artifacts.uploads,artifacts.upload_confirmations,artifacts.upload_objects,artifacts.media_objects TO wp_serving;
GRANT UPDATE (state,attempt_count,lease_token,lease_expires_at,cleanup_token,cleanup_expires_at,confirmed_result) ON artifacts.uploads TO wp_serving;
GRANT UPDATE (protected_version_id,last_cleanup_at,cleanup_failures) ON artifacts.upload_objects TO wp_serving;
