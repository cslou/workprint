-- Images filed under a script subject (Sprint 010): the subject id sits on the video's use, not the version,
-- because a subject belongs to this video's script. A next version on the same use keeps it unless refiled.
ALTER TABLE artifacts.conversation_uses ADD COLUMN subject_id text CHECK (length(subject_id) BETWEEN 1 AND 200);
GRANT UPDATE (subject_id) ON artifacts.conversation_uses TO wp_serving;
