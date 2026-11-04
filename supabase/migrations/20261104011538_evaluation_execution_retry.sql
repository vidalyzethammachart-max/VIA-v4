-- n8n failures reported back by the VIA error workflow, and admin retries of them.
-- Only the Edge Functions (service role) write here; browsers read through
-- list_stuck_evaluations(). A retry reruns the same n8n execution with the
-- currently saved workflow, and only after a quota (HTTP 429) failure.
CREATE TABLE public.evaluation_execution_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id bigint NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  execution_id bigint NOT NULL UNIQUE,
  workflow_id text,
  failed_node text,
  error_message text,
  http_status integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  retry_claimed_at timestamptz,
  retried_by uuid REFERENCES auth.users(id),
  retry_execution_id bigint,
  retry_error text
);
CREATE INDEX evaluation_execution_failures_evaluation_idx
  ON public.evaluation_execution_failures (evaluation_id, created_at DESC);
ALTER TABLE public.evaluation_execution_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.evaluation_execution_failures FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.evaluation_execution_failures TO service_role;

CREATE FUNCTION public.record_evaluation_execution_failure(
  p_evaluation_id bigint, p_execution_id bigint, p_workflow_id text,
  p_failed_node text, p_error_message text, p_http_status integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE status text; finished boolean; inserted uuid;
BEGIN
  SELECT document_status, document_status = 'ready' AND (pdf_storage_path IS NOT NULL OR docx_storage_path IS NOT NULL)
    INTO status, finished FROM evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found'; END IF;
  -- A late error never overrides a document that was already delivered.
  IF finished OR status = 'ready' THEN RETURN jsonb_build_object('recorded', false, 'reason', 'ready'); END IF;
  INSERT INTO evaluation_execution_failures
    (evaluation_id, execution_id, workflow_id, failed_node, error_message, http_status)
    VALUES (p_evaluation_id, p_execution_id, left(p_workflow_id, 100), left(p_failed_node, 200),
            left(p_error_message, 1000), p_http_status)
    ON CONFLICT (execution_id) DO NOTHING
    RETURNING id INTO inserted;
  IF inserted IS NULL THEN RETURN jsonb_build_object('recorded', false, 'reason', 'duplicate'); END IF;
  UPDATE evaluations SET document_status = 'failed',
    document_error = left(format('n8n execution %s failed at %s%s: %s', p_execution_id,
      coalesce(p_failed_node, 'unknown node'),
      CASE WHEN p_http_status IS NULL THEN '' ELSE format(' (HTTP %s)', p_http_status) END,
      coalesce(p_error_message, 'no message')), 1000)
    WHERE id = p_evaluation_id;
  RETURN jsonb_build_object('recorded', true, 'id', inserted);
END $$;

CREATE FUNCTION public.begin_evaluation_retry(p_evaluation_id bigint, p_execution_id bigint, p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE failure evaluation_execution_failures; status text;
BEGIN
  SELECT document_status INTO status FROM evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found'; END IF;
  IF status = 'ready' THEN RAISE EXCEPTION 'Evaluation document is already ready'; END IF;
  SELECT * INTO failure FROM evaluation_execution_failures
    WHERE execution_id = p_execution_id AND evaluation_id = p_evaluation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No recorded failure for this execution'; END IF;
  IF failure.http_status IS DISTINCT FROM 429 THEN
    RAISE EXCEPTION 'Retry is allowed only for quota (429) failures';
  END IF;
  IF failure.retry_execution_id IS NOT NULL OR failure.retry_claimed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This execution was already retried' USING ERRCODE = '55000';
  END IF;
  UPDATE evaluation_execution_failures SET retry_claimed_at = now(), retried_by = p_actor, retry_error = NULL
    WHERE id = failure.id;
  RETURN jsonb_build_object('ok', true, 'failure_id', failure.id);
END $$;

CREATE FUNCTION public.finish_evaluation_retry(
  p_execution_id bigint, p_new_execution_id bigint, p_ok boolean, p_error text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE failure evaluation_execution_failures;
BEGIN
  SELECT * INTO failure FROM evaluation_execution_failures WHERE execution_id = p_execution_id FOR UPDATE;
  IF NOT FOUND OR failure.retry_claimed_at IS NULL THEN RAISE EXCEPTION 'No retry in progress'; END IF;
  IF p_ok THEN
    UPDATE evaluation_execution_failures SET retry_execution_id = p_new_execution_id WHERE id = failure.id;
    UPDATE evaluations SET document_status = 'pending', document_error = NULL
      WHERE id = failure.evaluation_id AND document_status <> 'ready';
  ELSE
    -- n8n refused the retry: release the claim so an admin can try again later.
    UPDATE evaluation_execution_failures
      SET retry_claimed_at = NULL, retried_by = NULL, retry_error = left(p_error, 1000)
      WHERE id = failure.id;
  END IF;
  RETURN jsonb_build_object('ok', p_ok);
END $$;

REVOKE ALL ON FUNCTION public.record_evaluation_execution_failure(bigint, bigint, text, text, text, integer),
  public.begin_evaluation_retry(bigint, bigint, uuid),
  public.finish_evaluation_retry(bigint, bigint, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_evaluation_execution_failure(bigint, bigint, text, text, text, integer),
  public.begin_evaluation_retry(bigint, bigint, uuid),
  public.finish_evaluation_retry(bigint, bigint, boolean, text) TO service_role;

-- The admin stuck list now also shows evaluations that failed in n8n and the
-- latest failed execution, so a 429 can be retried from the web. A new name avoids
-- dropping list_stuck_evaluations(), which the previous frontend still calls.
CREATE FUNCTION public.list_stuck_evaluations_v2() RETURNS TABLE (
  evaluation_id bigint, order_number text, subject_name text, user_id uuid, owner_email text,
  document_status text, document_error text, created_at timestamptz,
  report_id uuid, reported_at timestamptz, report_note text,
  failure_execution_id bigint, failure_http_status integer, failure_node text,
  retry_claimed_at timestamptz, retry_execution_id bigint, retry_error text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT coalesce(public.role_at_least('admin'::public.app_role), false) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT e.id, e.order_number, e.subject_name, e.user_id, u.email::text,
      e.document_status, e.document_error, e.created_at, r.id, r.created_at, r.note,
      f.execution_id, f.http_status, f.failed_node, f.retry_claimed_at, f.retry_execution_id, f.retry_error
    FROM evaluations e
    LEFT JOIN auth.users u ON u.id = e.user_id
    LEFT JOIN evaluation_stuck_reports r ON r.evaluation_id = e.id AND r.resolved_at IS NULL
    LEFT JOIN LATERAL (
      SELECT * FROM evaluation_execution_failures x WHERE x.evaluation_id = e.id
      ORDER BY x.created_at DESC LIMIT 1
    ) f ON true
    WHERE (e.document_status = 'pending' AND e.created_at <= now() - interval '30 minutes')
      OR (e.document_status = 'failed' AND f.id IS NOT NULL)
      OR r.id IS NOT NULL
    ORDER BY e.created_at ASC;
END $$;
REVOKE ALL ON FUNCTION public.list_stuck_evaluations_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_stuck_evaluations_v2() TO authenticated;
