-- Artifacts-owned conversation metadata keyed by native identity; not a conversation store.
CREATE TABLE artifacts.selection_revisions (
  owner_id text NOT NULL,
  conversation_id text NOT NULL CHECK (length(conversation_id) BETWEEN 1 AND 200),
  revision bigint NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, conversation_id)
);
-- Monotonic: a revision may only advance by exactly one.
CREATE FUNCTION artifacts.advance_selection_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'INSERT' AND NEW.revision <> 1) THEN
    RAISE EXCEPTION 'Selection revisions only advance' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  IF NEW.owner_id <> OLD.owner_id OR NEW.conversation_id <> OLD.conversation_id OR NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'Selection revisions only advance' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION artifacts.advance_selection_revision() FROM PUBLIC;
CREATE TRIGGER monotonic_selection_revision BEFORE INSERT OR UPDATE OR DELETE ON artifacts.selection_revisions
  FOR EACH ROW EXECUTE FUNCTION artifacts.advance_selection_revision();
REVOKE ALL ON artifacts.selection_revisions FROM PUBLIC;
GRANT SELECT, INSERT ON artifacts.selection_revisions TO wp_serving;
GRANT UPDATE (revision, updated_at) ON artifacts.selection_revisions TO wp_serving;

-- Storyboard edits share command identity and the manual change journal.
ALTER TABLE artifacts.commands DROP CONSTRAINT commands_command_kind_check;
ALTER TABLE artifacts.commands ADD CONSTRAINT commands_command_kind_check
  CHECK (command_kind IN ('manual_save', 'assistant_draft', 'use_version', 'edit_storyboard'));
ALTER TABLE artifacts.manual_changes DROP CONSTRAINT manual_changes_command_kind_check;
ALTER TABLE artifacts.manual_changes ADD CONSTRAINT manual_changes_command_kind_check
  CHECK (command_kind IN ('manual_save', 'edit_storyboard'));
ALTER TABLE artifacts.manual_changes DROP CONSTRAINT manual_changes_owner_id_conversation_id_operation_id_key;
ALTER TABLE artifacts.manual_changes ADD CONSTRAINT manual_changes_command_identity
  UNIQUE (owner_id, conversation_id, command_kind, operation_id);
-- Exact downstream versions needing revalidation; retained, never consumed by reads.
ALTER TABLE artifacts.manual_changes ADD COLUMN affected_version_ids text[] NOT NULL DEFAULT '{}'
  CHECK (cardinality(affected_version_ids) <= 1000);
ALTER TABLE artifacts.manual_changes ADD COLUMN selection_revision bigint
  CHECK (selection_revision IS NULL OR selection_revision > 0);

-- Exact-use decisions journal what they replaced and which downstream work needs revalidation.
-- Version owners are recorded so test-only read-only sources keep exact foreign keys.
CREATE TABLE artifacts.use_changes (
  owner_id text NOT NULL,
  change_id text NOT NULL,
  conversation_id text NOT NULL,
  operation_id text NOT NULL,
  command_kind text NOT NULL DEFAULT 'use_version' CHECK (command_kind = 'use_version'),
  use_id text NOT NULL,
  previous_version_owner_id text,
  previous_version_id text,
  version_owner_id text NOT NULL,
  version_id text NOT NULL,
  affected_version_ids text[] NOT NULL DEFAULT '{}' CHECK (cardinality(affected_version_ids) <= 1000),
  selection_revision bigint CHECK (selection_revision IS NULL OR selection_revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, change_id),
  UNIQUE (owner_id, conversation_id, operation_id),
  FOREIGN KEY (owner_id, conversation_id, command_kind, operation_id)
    REFERENCES artifacts.commands(owner_id, conversation_id, command_kind, operation_id),
  FOREIGN KEY (owner_id, use_id) REFERENCES artifacts.conversation_uses(owner_id, use_id),
  FOREIGN KEY (previous_version_owner_id, previous_version_id) REFERENCES artifacts.versions(owner_id, version_id),
  FOREIGN KEY (version_owner_id, version_id) REFERENCES artifacts.versions(owner_id, version_id),
  CHECK ((previous_version_id IS NULL) = (previous_version_owner_id IS NULL))
);
CREATE TRIGGER immutable_use_change BEFORE UPDATE OR DELETE ON artifacts.use_changes
  FOR EACH ROW EXECUTE FUNCTION artifacts.reject_version_mutation();
REVOKE ALL ON artifacts.use_changes FROM PUBLIC;
GRANT SELECT, INSERT ON artifacts.use_changes TO wp_serving;
