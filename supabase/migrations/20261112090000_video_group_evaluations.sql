-- Cross-case video group evaluations.
-- A group combines >= 2 ready evaluations (possibly from different video cases).
-- Writes happen only through create_video_group_evaluation (or service role).

CREATE TABLE IF NOT EXISTS public.video_group_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL CHECK (btrim(order_number) <> ''),
  group_type text NOT NULL
    CHECK (group_type IN ('group', 'round', 'year_end')),
  subject_name text NOT NULL CHECK (btrim(subject_name) <> ''),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by_name text NULL,
  requested_by_employee_number text NULL,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  combined_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  section_averages jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_count integer NOT NULL DEFAULT 0 CHECK (source_count >= 0),
  ai_model text NULL,
  ai_output jsonb NULL,
  ai_raw_text text NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'failed')),
  error text NULL,
  -- 'draft' = never sent; begin_document_dispatch moves it to 'pending'.
  document_status text NOT NULL DEFAULT 'draft'
    CHECK (document_status IN ('draft', 'pending', 'ready', 'failed')),
  document_error text NULL,
  source_doc_id text NULL,
  pdf_storage_path text NULL,
  docx_storage_path text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS video_group_evaluations_identity_idx
  ON public.video_group_evaluations (
    public.normalize_video_case_key_part(order_number),
    group_type,
    public.normalize_video_case_key_part(subject_name)
  );

CREATE INDEX IF NOT EXISTS idx_video_group_evaluations_created_at
  ON public.video_group_evaluations (created_at DESC);

CREATE TABLE IF NOT EXISTS public.video_group_evaluation_sources (
  group_id uuid NOT NULL
    REFERENCES public.video_group_evaluations(id) ON DELETE CASCADE,
  evaluation_id bigint NOT NULL
    REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  source_position integer NOT NULL CHECK (source_position > 0),
  video_case_id uuid NOT NULL
    REFERENCES public.video_cases(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, evaluation_id),
  UNIQUE (group_id, source_position)
);

CREATE INDEX IF NOT EXISTS idx_video_group_evaluation_sources_case
  ON public.video_group_evaluation_sources (video_case_id);

ALTER TABLE public.video_group_evaluations
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_group_evaluation_sources
  ENABLE ROW LEVEL SECURITY;

-- Single visibility rule shared by both tables' SELECT policies, so neither
-- policy references the other table's RLS.
CREATE OR REPLACE FUNCTION public.can_view_video_group(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    public.role_at_least('admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.video_group_evaluation_sources source
      WHERE source.group_id = p_group_id
        AND public.can_view_video_case(source.video_case_id)
    );
$$;

REVOKE ALL ON FUNCTION public.can_view_video_group(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_video_group(uuid) TO authenticated;

DROP POLICY IF EXISTS video_group_evaluations_select_visible
  ON public.video_group_evaluations;
DROP POLICY IF EXISTS video_group_evaluation_sources_select_visible
  ON public.video_group_evaluation_sources;

CREATE POLICY video_group_evaluations_select_visible
ON public.video_group_evaluations
FOR SELECT
TO authenticated
USING (public.can_view_video_group(id));

CREATE POLICY video_group_evaluation_sources_select_visible
ON public.video_group_evaluation_sources
FOR SELECT
TO authenticated
USING (public.can_view_video_group(group_id));

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

    IF NOT EXISTS (
      SELECT 1
      FROM public.evaluations evaluation
      WHERE evaluation.id = ANY (p_evaluation_ids)
        AND public.current_video_case_role(evaluation.video_case_id) = 'leader'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'Only an admin or a leader of a source case can create a group evaluation.';
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
