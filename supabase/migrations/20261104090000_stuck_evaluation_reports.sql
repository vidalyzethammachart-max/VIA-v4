-- Evaluations still pending 30 minutes after creation are treated as stuck.
-- The submitter can tell admins; admins see every stuck evaluation, reported or not.
-- This adds no retry path: resubmitting still follows docs/direct-document-dispatch.md.
CREATE TABLE public.evaluation_stuck_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id bigint NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  reported_by uuid NOT NULL REFERENCES auth.users(id),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id)
);
CREATE UNIQUE INDEX evaluation_stuck_reports_one_open
  ON public.evaluation_stuck_reports (evaluation_id) WHERE resolved_at IS NULL;
ALTER TABLE public.evaluation_stuck_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.evaluation_stuck_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.evaluation_stuck_reports TO service_role;

CREATE FUNCTION public.report_stuck_evaluation(p_evaluation_id bigint, p_note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor uuid := auth.uid(); owner_id uuid; status text; started timestamptz; existing_id uuid; new_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT user_id, document_status, created_at INTO owner_id, status, started
    FROM evaluations WHERE id = p_evaluation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found'; END IF;
  IF owner_id IS DISTINCT FROM actor AND NOT public.role_at_least('admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF status IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'Evaluation is not processing'; END IF;
  IF started > now() - interval '30 minutes' THEN
    RAISE EXCEPTION 'Evaluation has been processing for less than 30 minutes';
  END IF;
  SELECT id INTO existing_id FROM evaluation_stuck_reports
    WHERE evaluation_id = p_evaluation_id AND resolved_at IS NULL;
  IF FOUND THEN RETURN jsonb_build_object('created', false, 'id', existing_id); END IF;
  INSERT INTO evaluation_stuck_reports (evaluation_id, reported_by, note)
    VALUES (p_evaluation_id, actor, nullif(left(btrim(coalesce(p_note, '')), 500), ''))
    RETURNING id INTO new_id;
  RETURN jsonb_build_object('created', true, 'id', new_id);
END $$;

CREATE FUNCTION public.get_evaluation_stuck_report(p_evaluation_id bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE actor uuid := auth.uid(); owner_id uuid; reported timestamptz;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT user_id INTO owner_id FROM evaluations WHERE id = p_evaluation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found'; END IF;
  IF owner_id IS DISTINCT FROM actor AND NOT public.role_at_least('admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT created_at INTO reported FROM evaluation_stuck_reports
    WHERE evaluation_id = p_evaluation_id AND resolved_at IS NULL;
  RETURN jsonb_build_object('reported', reported IS NOT NULL, 'reported_at', reported);
END $$;

CREATE FUNCTION public.list_stuck_evaluations() RETURNS TABLE (
  evaluation_id bigint, order_number text, subject_name text, user_id uuid, owner_email text,
  document_status text, document_error text, created_at timestamptz,
  report_id uuid, reported_at timestamptz, report_note text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT coalesce(public.role_at_least('admin'::public.app_role), false) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT e.id, e.order_number, e.subject_name, e.user_id, u.email::text,
      e.document_status, e.document_error, e.created_at, r.id, r.created_at, r.note
    FROM evaluations e
    LEFT JOIN auth.users u ON u.id = e.user_id
    LEFT JOIN evaluation_stuck_reports r ON r.evaluation_id = e.id AND r.resolved_at IS NULL
    WHERE (e.document_status = 'pending' AND e.created_at <= now() - interval '30 minutes')
      OR r.id IS NOT NULL
    ORDER BY e.created_at ASC;
END $$;

CREATE FUNCTION public.resolve_stuck_evaluation_report(p_evaluation_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE changed integer;
BEGIN
  IF NOT coalesce(public.role_at_least('admin'::public.app_role), false) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE evaluation_stuck_reports SET resolved_at = now(), resolved_by = auth.uid()
    WHERE evaluation_id = p_evaluation_id AND resolved_at IS NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN jsonb_build_object('resolved', changed > 0);
END $$;

REVOKE ALL ON FUNCTION public.report_stuck_evaluation(bigint, text),
  public.get_evaluation_stuck_report(bigint), public.list_stuck_evaluations(),
  public.resolve_stuck_evaluation_report(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_stuck_evaluation(bigint, text),
  public.get_evaluation_stuck_report(bigint), public.list_stuck_evaluations(),
  public.resolve_stuck_evaluation_report(bigint) TO authenticated;
