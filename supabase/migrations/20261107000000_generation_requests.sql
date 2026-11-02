-- Saved generation jobs (Sprint 009). One row per paid provider task, written before the paid call.
-- The generation domain owns this schema; it references saved versions but never writes them.
CREATE SCHEMA generation;
REVOKE ALL ON SCHEMA generation FROM PUBLIC;
GRANT USAGE ON SCHEMA generation TO wp_serving;

CREATE TABLE generation.requests (
  owner_id text NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 200),
  request_id text NOT NULL CHECK (length(request_id) BETWEEN 1 AND 200),
  conversation_id text NOT NULL CHECK (length(conversation_id) BETWEEN 1 AND 200),
  purpose text NOT NULL CHECK (purpose IN ('video')),
  prompt_sha256 text NOT NULL CHECK (prompt_sha256 ~ '^[a-f0-9]{64}$'),
  -- Exact saved image versions sent as frames, in order.
  inputs text[] NOT NULL DEFAULT '{}' CHECK (cardinality(inputs) <= 2 AND array_position(inputs, NULL) IS NULL),
  status text NOT NULL CHECK (status IN ('submitting', 'running', 'interrupted', 'succeeded', 'failed')),
  task_id text CHECK (task_id IS NULL OR length(task_id) BETWEEN 1 AND 200),
  failure_reason text CHECK (failure_reason IS NULL OR failure_reason IN ('invalid_input', 'provider_error', 'outcome_unknown', 'expired', 'check_refused')),
  result_version_id text,
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (owner_id, request_id),
  UNIQUE (request_id),
  FOREIGN KEY (owner_id, result_version_id) REFERENCES artifacts.versions(owner_id, version_id),
  -- A waiting or finished task always keeps its id; only a failed or submitting job may lack one.
  CHECK (task_id IS NOT NULL OR status IN ('submitting', 'failed')),
  CHECK ((status = 'failed') = (failure_reason IS NOT NULL)),
  CHECK ((status = 'succeeded') = (result_version_id IS NOT NULL))
);
CREATE INDEX requests_by_conversation ON generation.requests (owner_id, conversation_id, submitted_at DESC, request_id DESC);

-- The closed transitions, checked on every update so a stale writer can't move a finished job.
CREATE FUNCTION generation.check_request_transition() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.request_id IS DISTINCT FROM OLD.request_id
    OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR NEW.purpose IS DISTINCT FROM OLD.purpose
    OR NEW.prompt_sha256 IS DISTINCT FROM OLD.prompt_sha256 OR NEW.inputs IS DISTINCT FROM OLD.inputs
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
CREATE TRIGGER request_transition BEFORE UPDATE ON generation.requests FOR EACH ROW EXECUTE FUNCTION generation.check_request_transition();

REVOKE ALL ON FUNCTION generation.check_request_transition() FROM PUBLIC;
REVOKE ALL ON generation.requests FROM PUBLIC;
-- No DELETE: a job is never removed, only moved to a final state.
GRANT SELECT, INSERT, UPDATE ON generation.requests TO wp_serving;
