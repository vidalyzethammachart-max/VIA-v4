-- Editors may now combine evaluations into a group, like admins and case leaders.
-- Non-admins (editors included) must still be able to view every source case.
-- Same signature, so the existing grants and callers are unchanged.
CREATE OR REPLACE FUNCTION public.create_video_group_evaluation(
  p_order_number text,
  p_group_type text,
  p_subject_name text,
  p_evaluation_ids bigint[],
  p_source_snapshot jsonb,
  p_combined_scores jsonb,
  p_section_averages jsonb
)
RETURNS public.video_group_evaluations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_is_admin boolean;
  caller_is_editor boolean;
  requester_name text;
  requester_employee_number text;
  found_count integer;
  inserted_count integer;
  result public.video_group_evaluations;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '28000',
      MESSAGE = 'Authentication is required.';
  END IF;

  IF p_evaluation_ids IS NULL OR cardinality(p_evaluation_ids) < 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'A group evaluation needs at least 2 source evaluations.';
  END IF;

  IF cardinality(p_evaluation_ids) <> (
    SELECT count(DISTINCT source.evaluation_id)::integer
    FROM unnest(p_evaluation_ids) AS source(evaluation_id)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Source evaluation IDs must be unique.';
  END IF;

  caller_is_admin := public.role_at_least('admin'::public.app_role);
  caller_is_editor := public.role_at_least('editor'::public.app_role);

  -- Lock the sources so they cannot be deleted or switched away from 'ready'
  -- (e.g. begin_evaluation_retry) between validation and the sources insert.
  PERFORM 1
  FROM public.evaluations
  WHERE id = ANY (p_evaluation_ids)
  FOR SHARE;

  SELECT count(*)::integer
  INTO found_count
  FROM public.evaluations evaluation
  WHERE evaluation.id = ANY (p_evaluation_ids)
    AND evaluation.video_case_id IS NOT NULL;

  IF found_count <> cardinality(p_evaluation_ids) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Source evaluations must exist and belong to a video case.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.evaluations evaluation
    WHERE evaluation.id = ANY (p_evaluation_ids)
      AND evaluation.document_status <> 'ready'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Source evaluations must have a ready document.';
  END IF;

  IF NOT caller_is_admin THEN
    IF EXISTS (
      SELECT 1
      FROM public.evaluations evaluation
      WHERE evaluation.id = ANY (p_evaluation_ids)
        AND NOT public.can_view_video_case(evaluation.video_case_id)
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'You cannot access one or more source evaluations.';
    END IF;

    IF NOT caller_is_editor AND NOT EXISTS (
      SELECT 1
      FROM public.evaluations evaluation
      WHERE evaluation.id = ANY (p_evaluation_ids)
        AND public.current_video_case_role(evaluation.video_case_id) = 'leader'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'Only an editor, an admin or a leader of a source case can create a group evaluation.';
    END IF;
  END IF;

  SELECT
    NULLIF(trim(profile.full_name), ''),
    NULLIF(trim(profile.employee_number), '')
  INTO requester_name, requester_employee_number
  FROM public.user_information profile
  WHERE profile.auth_user_id::text = caller_id::text
  LIMIT 1;

  -- A duplicate identity raises unique_violation on
  -- video_group_evaluations_identity_idx; the whole call is rolled back.
  INSERT INTO public.video_group_evaluations (
    order_number,
    group_type,
    subject_name,
    requested_by,
    requested_by_name,
    requested_by_employee_number,
    source_snapshot,
    combined_scores,
    section_averages,
    source_count
  )
  VALUES (
    btrim(p_order_number),
    p_group_type,
    btrim(p_subject_name),
    caller_id,
    requester_name,
    requester_employee_number,
    COALESCE(p_source_snapshot, '{}'::jsonb),
    COALESCE(p_combined_scores, '{}'::jsonb),
    COALESCE(p_section_averages, '{}'::jsonb),
    cardinality(p_evaluation_ids)
  )
  RETURNING * INTO result;

  INSERT INTO public.video_group_evaluation_sources (
    group_id,
    evaluation_id,
    source_position,
    video_case_id
  )
  SELECT
    result.id,
    source.evaluation_id,
    source.position::integer,
    evaluation.video_case_id
  FROM unnest(p_evaluation_ids) WITH ORDINALITY AS source(evaluation_id, position)
  JOIN public.evaluations evaluation ON evaluation.id = source.evaluation_id;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count <> cardinality(p_evaluation_ids) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Not every source evaluation could be linked to the group.';
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL
ON FUNCTION public.create_video_group_evaluation(
  text, text, text, bigint[], jsonb, jsonb, jsonb
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.create_video_group_evaluation(
  text, text, text, bigint[], jsonb, jsonb, jsonb
)
TO authenticated;

