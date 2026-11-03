-- A video job made for a storyboard Shot (Sprint 011) carries that Shot, so a resumed or restarted job still saves
-- its clip to the Shot. The target is part of the job's identity: it is set once, when the job is saved.
ALTER TABLE generation.requests ADD COLUMN target jsonb
  -- Exactly {"shotId": <id>}.
  CHECK (target IS NULL OR (jsonb_typeof(target->'shotId') = 'string' AND length(target->>'shotId') BETWEEN 1 AND 200
    AND target = jsonb_build_object('shotId', target->'shotId')));

CREATE OR REPLACE FUNCTION generation.check_request_transition() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.request_id IS DISTINCT FROM OLD.request_id
    OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR NEW.purpose IS DISTINCT FROM OLD.purpose
    OR NEW.prompt_sha256 IS DISTINCT FROM OLD.prompt_sha256 OR NEW.inputs IS DISTINCT FROM OLD.inputs
    OR NEW.target IS DISTINCT FROM OLD.target
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR (OLD.task_id IS NOT NULL AND NEW.task_id IS DISTINCT FROM OLD.task_id) THEN
    RAISE EXCEPTION 'generation request identity is immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (
    (OLD.status = 'submitting' AND NEW.status = 'running' AND NEW.task_id IS NOT NULL)
    OR (OLD.status = 'submitting' AND NEW.status = 'failed' AND NEW.failure_reason IN ('invalid_input', 'provider_error', 'outcome_unknown'))
    OR (OLD.status = 'running' AND NEW.status IN ('succeeded', 'interrupted'))
    OR (OLD.status = 'running' AND NEW.status = 'failed' AND NEW.failure_reason IN ('provider_error', 'check_refused', 'expired'))
    OR (OLD.status = 'interrupted' AND NEW.status = 'running')
    OR (OLD.status = 'interrupted' AND NEW.status = 'failed' AND NEW.failure_reason = 'expired')
  ) OR NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'generation request transition refused' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION generation.check_request_transition() FROM PUBLIC;

GRANT INSERT (target) ON generation.requests TO wp_serving;
