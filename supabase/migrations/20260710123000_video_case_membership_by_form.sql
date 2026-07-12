CREATE OR REPLACE FUNCTION public.resolve_video_case_membership(
  p_order_number TEXT,
  p_subject_name TEXT,
  p_short_code TEXT,
  p_case_title TEXT DEFAULT NULL,
  p_source_file_name TEXT DEFAULT NULL,
  p_video_object_key TEXT DEFAULT NULL,
  p_member_role TEXT DEFAULT 'member'
)
RETURNS public.video_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
  v_case_key TEXT;
  v_case public.video_cases;
  v_role TEXT;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  v_case_key := public.build_video_case_key(p_order_number, p_subject_name, p_short_code);

  IF p_member_role NOT IN ('member', 'leader') THEN
    RAISE EXCEPTION 'Invalid member role: %', p_member_role USING ERRCODE = '22023';
  END IF;

  v_role := p_member_role;

  SELECT *
  INTO v_case
  FROM public.video_cases
  WHERE case_key = v_case_key
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.video_cases (
      case_key,
      title,
      case_title,
      order_number,
      subject_name,
      short_code,
      source_file_name,
      video_object_key,
      created_by
    ) VALUES (
      v_case_key,
      COALESCE(NULLIF(trim(COALESCE(p_case_title, '')), ''), v_case_key),
      COALESCE(NULLIF(trim(COALESCE(p_case_title, '')), ''), v_case_key),
      NULLIF(trim(COALESCE(p_order_number, '')), ''),
      NULLIF(trim(COALESCE(p_subject_name, '')), ''),
      NULLIF(trim(COALESCE(p_short_code, '')), ''),
      NULLIF(trim(COALESCE(p_source_file_name, '')), ''),
      NULLIF(trim(COALESCE(p_video_object_key, '')), ''),
      v_actor
    )
    RETURNING * INTO v_case;
  ELSE
    IF (
      v_case.created_by = v_actor
      OR EXISTS (
        SELECT 1
        FROM public.video_case_members vcm
        WHERE vcm.video_case_id = v_case.id
          AND vcm.user_id = v_actor
      )
    ) THEN
      UPDATE public.video_cases
      SET
        title = COALESCE(NULLIF(trim(COALESCE(p_case_title, '')), ''), title),
        case_title = COALESCE(NULLIF(trim(COALESCE(p_case_title, '')), ''), case_title),
        source_file_name = COALESCE(NULLIF(trim(COALESCE(p_source_file_name, '')), ''), source_file_name),
        video_object_key = COALESCE(NULLIF(trim(COALESCE(p_video_object_key, '')), ''), video_object_key),
        updated_at = NOW()
      WHERE id = v_case.id
      RETURNING * INTO v_case;
    END IF;
  END IF;

  IF p_member_role = 'leader' THEN
    IF EXISTS (
      SELECT 1
      FROM public.video_case_members vcm
      WHERE vcm.video_case_id = v_case.id
          AND vcm.member_role = 'leader'
        AND vcm.user_id <> v_actor
    ) THEN
      RAISE EXCEPTION 'Video case already has a leader' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.video_case_members (
    video_case_id,
    user_id,
    member_role
  ) VALUES (
    v_case.id,
    v_actor,
    v_role
  )
  ON CONFLICT (video_case_id, user_id) DO UPDATE
  SET member_role = CASE
    WHEN EXCLUDED.member_role = 'leader' THEN 'leader'
    ELSE public.video_case_members.member_role
  END;

  RETURN v_case;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_video_case_membership(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
