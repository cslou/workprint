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
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Selection revisions only advance' USING ERRCODE = '23514';
  END IF;
  IF NEW.owner_id <> OLD.owner_id OR NEW.conversation_id <> OLD.conversation_id OR NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'Selection revisions only advance' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION artifacts.advance_selection_revision() FROM PUBLIC;
CREATE TRIGGER monotonic_selection_revision BEFORE UPDATE OR DELETE ON artifacts.selection_revisions
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
