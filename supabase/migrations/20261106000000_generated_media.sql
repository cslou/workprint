-- Assistant-made media is stored without an upload: its own object record replaces the upload chain.
CREATE TABLE artifacts.generated_objects (
  owner_id text NOT NULL,
  object_key text NOT NULL CHECK (object_key ~ '^published/[a-f0-9-]+/[a-f0-9-]+$'),
  version_id text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  content_type text NOT NULL CHECK (content_type IN ('image/png','image/jpeg')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id,object_key),
  UNIQUE (object_key),
  FOREIGN KEY (owner_id,version_id) REFERENCES artifacts.versions(owner_id,version_id)
);
CREATE TRIGGER immutable_generated_object BEFORE UPDATE OR DELETE ON artifacts.generated_objects FOR EACH ROW EXECUTE FUNCTION artifacts.reject_version_mutation();

-- Exactly one source per media row: an upload object or a generated object. Generated media has no poster.
ALTER TABLE artifacts.media_objects ALTER COLUMN object_key DROP NOT NULL;
ALTER TABLE artifacts.media_objects ADD COLUMN generated_key text;
ALTER TABLE artifacts.media_objects ADD FOREIGN KEY (owner_id,generated_key) REFERENCES artifacts.generated_objects(owner_id,object_key);
ALTER TABLE artifacts.media_objects ADD CONSTRAINT media_objects_one_source CHECK ((object_key IS NULL) <> (generated_key IS NULL));
ALTER TABLE artifacts.media_objects ADD CONSTRAINT generated_media_has_no_poster CHECK (generated_key IS NULL OR poster_key IS NULL);

REVOKE ALL ON artifacts.generated_objects FROM PUBLIC;
GRANT SELECT,INSERT ON artifacts.generated_objects TO wp_serving;
