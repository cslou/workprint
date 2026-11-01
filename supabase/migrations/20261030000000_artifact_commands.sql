-- Application command effects only; native conversation storage remains native-owned.
CREATE TABLE artifacts.commands (
  owner_id text NOT NULL,
  conversation_id text NOT NULL CHECK (length(conversation_id) BETWEEN 1 AND 200),
  command_kind text NOT NULL CHECK (command_kind IN ('manual_save', 'assistant_draft')),
  operation_id text NOT NULL CHECK (length(operation_id) BETWEEN 1 AND 200),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, conversation_id, command_kind, operation_id)
);
CREATE TABLE artifacts.manual_changes (
  owner_id text NOT NULL,
  change_id text NOT NULL,
  conversation_id text NOT NULL,
  operation_id text NOT NULL,
  command_kind text NOT NULL DEFAULT 'manual_save' CHECK (command_kind = 'manual_save'),
  previous_version_id text NOT NULL,
  version_id text NOT NULL,
  use_id text,
  previous_use_version_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (owner_id, change_id),
  UNIQUE (owner_id, conversation_id, operation_id),
  FOREIGN KEY (owner_id, conversation_id, command_kind, operation_id)
    REFERENCES artifacts.commands(owner_id, conversation_id, command_kind, operation_id),
  FOREIGN KEY (owner_id, previous_version_id) REFERENCES artifacts.versions(owner_id, version_id),
  FOREIGN KEY (owner_id, version_id) REFERENCES artifacts.versions(owner_id, version_id),
  FOREIGN KEY (owner_id, use_id) REFERENCES artifacts.conversation_uses(owner_id, use_id),
  FOREIGN KEY (owner_id, previous_use_version_id) REFERENCES artifacts.versions(owner_id, version_id),
  CHECK ((use_id IS NULL) = (previous_use_version_id IS NULL))
);
CREATE TRIGGER immutable_command BEFORE UPDATE OR DELETE ON artifacts.commands
  FOR EACH ROW EXECUTE FUNCTION artifacts.reject_version_mutation();
CREATE TRIGGER immutable_manual_change BEFORE UPDATE OR DELETE ON artifacts.manual_changes
  FOR EACH ROW EXECUTE FUNCTION artifacts.reject_version_mutation();
REVOKE ALL ON artifacts.commands, artifacts.manual_changes FROM PUBLIC;
GRANT SELECT, INSERT ON artifacts.commands, artifacts.manual_changes TO wp_serving;
GRANT UPDATE (version_id, state) ON artifacts.conversation_uses TO wp_serving;
