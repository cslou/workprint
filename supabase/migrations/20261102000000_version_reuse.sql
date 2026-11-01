-- Human exact-version decisions reuse immutable content; no native schema changes.
ALTER TABLE artifacts.commands DROP CONSTRAINT commands_command_kind_check;
ALTER TABLE artifacts.commands ADD CONSTRAINT commands_command_kind_check
  CHECK (command_kind IN ('manual_save', 'assistant_draft', 'use_version'));
