-- Internal per-owner publication ordering, separate from conversation decisions.
CREATE TABLE artifacts.publication_counters (
  owner_id text PRIMARY KEY CHECK (length(owner_id) BETWEEN 1 AND 200),
  revision bigint NOT NULL CHECK (revision >= 0)
);
INSERT INTO artifacts.publication_counters(owner_id,revision)
  SELECT DISTINCT owner_id,0 FROM artifacts.versions;

-- Existing immutable content remains untouched; zero identifies pre-migration work.
ALTER TABLE artifacts.versions ADD COLUMN publication_revision bigint NOT NULL DEFAULT 0 CHECK (publication_revision >= 0);
ALTER TABLE artifacts.versions ALTER COLUMN publication_revision DROP DEFAULT;
ALTER TABLE artifacts.versions ADD CONSTRAINT versions_publication_owner
  FOREIGN KEY(owner_id) REFERENCES artifacts.publication_counters(owner_id);
CREATE INDEX versions_owned_publication ON artifacts.versions(owner_id,publication_revision);
REVOKE ALL ON artifacts.publication_counters FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON artifacts.publication_counters TO wp_serving;
