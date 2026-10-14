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
