BEGIN;

-- Keep every case UUID and all evaluation/aggregate links. Never merge or
-- delete historical cases if their new identifiers would collide.
LOCK TABLE public.video_cases IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.video_cases
    GROUP BY CASE
      WHEN nullif(btrim(order_number), '') IS NOT NULL AND nullif(btrim(subject_name), '') IS NOT NULL
      THEN public.normalize_video_case_key_part(order_number) || '-' || public.normalize_video_case_key_part(subject_name)
      ELSE case_key END
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Conflicting video case identities. Resolve duplicates explicitly before applying this migration.';
  END IF;
END;
$$;

UPDATE public.video_cases
SET case_key = public.normalize_video_case_key_part(order_number) || '-' || public.normalize_video_case_key_part(subject_name),
    short_code = NULL
WHERE nullif(btrim(order_number), '') IS NOT NULL
  AND nullif(btrim(subject_name), '') IS NOT NULL
  AND (short_code IS NOT NULL OR case_key IS DISTINCT FROM
    public.normalize_video_case_key_part(order_number) || '-' || public.normalize_video_case_key_part(subject_name));

-- Keep the old signature for callers that still send a suffix, but no longer
-- use that suffix to decide whether two submissions belong to the same case.
CREATE OR REPLACE FUNCTION public.build_video_case_key(p_order_number text, p_subject_name text, p_short_code text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_order text := public.normalize_video_case_key_part(p_order_number);
  v_subject text := public.normalize_video_case_key_part(p_subject_name);
BEGIN
  IF v_order = '' OR v_subject = '' THEN
    RAISE EXCEPTION 'Order number and subject name are required' USING ERRCODE = '22023';
  END IF;
  RETURN v_order || '-' || v_subject;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_video_case_by_identity(
  p_order_number text,
  p_subject_name text,
  p_video_case_id uuid DEFAULT NULL,
  p_case_title text DEFAULT NULL,
  p_source_file_name text DEFAULT NULL,
  p_video_object_key text DEFAULT NULL,
  p_member_role text DEFAULT 'member'
)
RETURNS public.video_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_key text;
  v_case public.video_cases;
  v_title text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_member_role IS NULL OR p_member_role NOT IN ('member', 'leader') THEN
    RAISE EXCEPTION 'Invalid member role' USING ERRCODE = '22023';
  END IF;
  v_key := public.build_video_case_key(p_order_number, p_subject_name, NULL);
  v_title := coalesce(nullif(btrim(p_case_title), ''), btrim(p_subject_name));

  -- Serialize identical submissions, including two first-time reviewers.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_key, 0));
  IF p_video_case_id IS NOT NULL THEN
    SELECT * INTO v_case FROM public.video_cases WHERE id = p_video_case_id FOR UPDATE;
    IF NOT FOUND OR NOT public.can_view_video_case(p_video_case_id) THEN
      RAISE EXCEPTION 'Video case not found or access denied' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT * INTO v_case FROM public.video_cases WHERE case_key = v_key FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.video_cases(case_key, title, case_title, order_number, subject_name, short_code, created_by)
      VALUES(v_key, v_title, v_title, btrim(p_order_number), btrim(p_subject_name), NULL, v_actor)
      RETURNING * INTO v_case;
    END IF;
  END IF;

  -- A-B + C and A + B-C have the same display key but are different pairs.
  -- Refuse that collision rather than silently putting reviews in the wrong case.
  IF public.normalize_video_case_key_part(v_case.order_number) <> public.normalize_video_case_key_part(p_order_number)
    OR public.normalize_video_case_key_part(v_case.subject_name) <> public.normalize_video_case_key_part(p_subject_name) THEN
    RAISE EXCEPTION 'Case identity does not match. Select the intended video case or use a different order number.' USING ERRCODE = '22023';
  END IF;

  -- Joining a case never resets the title, description or another reviewer's
  -- source video. Only its creator/admin may attach a new source object.
  IF nullif(btrim(p_video_object_key), '') IS NOT NULL
    AND (v_case.created_by = v_actor OR public.role_at_least('admin'::public.app_role)) THEN
    UPDATE public.video_cases
      SET source_file_name = nullif(btrim(p_source_file_name), ''), video_object_key = btrim(p_video_object_key)
      WHERE id = v_case.id RETURNING * INTO v_case;
  END IF;
  IF p_member_role = 'leader' AND EXISTS (
    SELECT 1 FROM public.video_case_members WHERE video_case_id = v_case.id AND member_role = 'leader' AND user_id <> v_actor
  ) THEN RAISE EXCEPTION 'Video case already has a leader' USING ERRCODE = '42501'; END IF;

  INSERT INTO public.video_case_members(video_case_id, user_id, member_role)
    VALUES(v_case.id, v_actor, p_member_role)
    ON CONFLICT(video_case_id, user_id) DO UPDATE
      SET member_role = CASE WHEN excluded.member_role = 'leader' THEN 'leader' ELSE public.video_case_members.member_role END;
  RETURN v_case;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_video_case_by_identity(text,text,uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_video_case_by_identity(text,text,uuid,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_video_case_membership(
  p_order_number text, p_subject_name text, p_short_code text,
  p_case_title text DEFAULT NULL, p_source_file_name text DEFAULT NULL,
  p_video_object_key text DEFAULT NULL, p_member_role text DEFAULT 'member'
)
RETURNS public.video_cases LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT public.resolve_video_case_by_identity(p_order_number, p_subject_name, NULL,
    p_case_title, p_source_file_name, p_video_object_key, p_member_role);
$$;
NOTIFY pgrst, 'reload schema';

-- Run inside a transaction after the migration, and always ROLLBACK.
DO $$
DECLARE
  actor uuid;
  reviewer uuid;
  first_case public.video_cases;
  second_case public.video_cases;
  selected_case public.video_cases;
  test_order text := 'IDENTITY-ROLLBACK-' || gen_random_uuid()::text;
BEGIN
  SELECT created_by INTO actor FROM public.video_cases ORDER BY created_at LIMIT 1;
  SELECT id INTO reviewer FROM auth.users WHERE id <> actor ORDER BY created_at LIMIT 1;
  IF actor IS NULL OR reviewer IS NULL THEN RAISE EXCEPTION 'Need two existing users for this rollback-only test'; END IF;
  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  first_case := public.resolve_video_case_by_identity(test_order, '  บทเรียน Test  ', NULL, 'Original title', NULL, NULL, 'leader');
  IF first_case.case_key <> lower(test_order) || '-บทเรียน-test' OR first_case.short_code IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected case key';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', reviewer::text, true);
  second_case := public.resolve_video_case_by_identity(lower(test_order), 'บทเรียน test', NULL, 'Must not overwrite', NULL, NULL, 'member');
  IF first_case.id <> second_case.id THEN RAISE EXCEPTION 'Repeated identity created another case'; END IF;
  IF second_case.case_title <> 'Original title' THEN RAISE EXCEPTION 'Joining overwrote case metadata'; END IF;
  selected_case := public.resolve_video_case_by_identity(test_order, 'บทเรียน TEST', first_case.id);
  IF selected_case.id <> first_case.id THEN RAISE EXCEPTION 'Explicit case id changed'; END IF;
  selected_case := public.resolve_video_case_membership(test_order, 'บทเรียน test', 'abcd', NULL, NULL, NULL, 'member');
  IF selected_case.id <> first_case.id THEN RAISE EXCEPTION 'Legacy caller created a suffixed case'; END IF;
  IF (SELECT count(*) FROM public.video_case_members WHERE video_case_id = first_case.id) <> 2 THEN
    RAISE EXCEPTION 'Expected two reviewers in one case';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.video_case_members WHERE video_case_id = first_case.id AND user_id = actor AND member_role = 'leader') THEN
    RAISE EXCEPTION 'Existing leader role changed';
  END IF;
  BEGIN
    PERFORM public.resolve_video_case_by_identity(' ', 'Subject');
    RAISE EXCEPTION 'Blank identity accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.resolve_video_case_by_identity(test_order, 'Different subject', first_case.id);
    RAISE EXCEPTION 'Mismatched explicit case accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.resolve_video_case_by_identity(test_order, 'Subject');
    RAISE EXCEPTION 'Anonymous actor accepted';
  EXCEPTION WHEN invalid_authorization_specification THEN NULL;
  END;
END;
$$;

ROLLBACK;