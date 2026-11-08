-- Resubmitting a case whose earlier evaluation never finished used to insert a second
-- evaluation row (new #), leaving the first one pending forever. This lets the owner
-- reopen that unfinished row instead, so the evaluation keeps its number.
-- Only the caller's own failed rows, or pending rows older than 30 minutes (the same
-- limit as list_stuck_evaluations), qualify; a job that is still within its window is
-- never taken over, and ready rows are never touched.
CREATE FUNCTION public.reopen_unfinished_evaluation(
  p_video_case_id uuid,
  p_order_number text,
  p_subject_name text,
  p_overall_suggestion text,
  p_rubric jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  caller uuid := auth.uid();
  target bigint;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_video_case_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT e.id INTO target
  FROM evaluations e
  WHERE e.user_id = caller
    AND e.video_case_id = p_video_case_id
    AND (e.document_status = 'failed'
         OR (e.document_status = 'pending' AND e.created_at <= now() - interval '30 minutes'))
  ORDER BY e.created_at DESC, e.id DESC
  LIMIT 1
  FOR UPDATE;

  IF target IS NULL THEN
    RETURN NULL;
  END IF;

  -- created_at restarts so the 30-minute stuck clock counts from this resubmission.
  UPDATE evaluations SET
    order_number = p_order_number,
    subject_name = p_subject_name,
    overall_suggestion = p_overall_suggestion,
    rubric = p_rubric,
    document_status = 'pending',
    document_error = NULL,
    pdf_storage_path = NULL,
    docx_storage_path = NULL,
    created_at = now()
  WHERE id = target;

  UPDATE evaluation_stuck_reports
    SET resolved_at = now(), resolved_by = caller
    WHERE evaluation_id = target AND resolved_at IS NULL;

  RETURN target;
END $$;

REVOKE ALL ON FUNCTION public.reopen_unfinished_evaluation(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_unfinished_evaluation(uuid, text, text, text, jsonb) TO authenticated;
