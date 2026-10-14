BEGIN;

ALTER TABLE public.video_cases
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- No DELETE or cascading changes: all source reviews, reports and files stay.
CREATE OR REPLACE FUNCTION public.guard_video_case_trash_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    IF auth.uid() IS NULL OR NOT (OLD.created_by = auth.uid() OR public.role_at_least('admin'::public.app_role)) THEN
      RAISE EXCEPTION 'เฉพาะผู้สร้างเคสหรือแอดมินเท่านั้นที่ย้ายเข้าถังขยะหรือกู้คืนได้' USING ERRCODE = '42501';
    END IF;
    NEW.deleted_by := CASE WHEN NEW.deleted_at IS NULL THEN NULL ELSE auth.uid() END;
  END IF;
  IF OLD.deleted_at IS NOT NULL AND
    (to_jsonb(NEW) - ARRAY['deleted_at','deleted_by','updated_at']) IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['deleted_at','deleted_by','updated_at']) THEN
    RAISE EXCEPTION 'เคสอยู่ในถังขยะ กรุณากู้คืนก่อนแก้ไข' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_video_case_trash_update BEFORE UPDATE ON public.video_cases
FOR EACH ROW EXECUTE FUNCTION public.guard_video_case_trash_update();

CREATE OR REPLACE FUNCTION public.set_video_case_trashed(p_video_case_id uuid, p_trashed boolean)
RETURNS public.video_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case public.video_cases;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_trashed IS NULL THEN RAISE EXCEPTION 'Trash state is required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_case FROM public.video_cases WHERE id = p_video_case_id FOR UPDATE;
  IF NOT FOUND OR NOT (v_case.created_by = auth.uid() OR public.role_at_least('admin'::public.app_role)) THEN
    RAISE EXCEPTION 'เฉพาะผู้สร้างเคสหรือแอดมินเท่านั้นที่ย้ายเข้าถังขยะหรือกู้คืนได้' USING ERRCODE = '42501';
  END IF;
  IF (v_case.deleted_at IS NOT NULL) IS DISTINCT FROM p_trashed THEN
    UPDATE public.video_cases SET deleted_at = CASE WHEN p_trashed THEN clock_timestamp() ELSE NULL END,
      deleted_by = CASE WHEN p_trashed THEN auth.uid() ELSE NULL END
      WHERE id = p_video_case_id RETURNING * INTO v_case;
  END IF;
  RETURN v_case;
END;
$$;
REVOKE ALL ON FUNCTION public.set_video_case_trashed(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_video_case_trashed(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.require_active_video_case()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted_at timestamptz;
BEGIN
  IF NEW.video_case_id IS NULL THEN RETURN NEW; END IF;
  -- Serialize new work with trash/restore. Updates to callback outputs are
  -- unaffected because these triggers only cover insert or case reassignment.
  SELECT deleted_at INTO v_deleted_at FROM public.video_cases WHERE id = NEW.video_case_id FOR SHARE;
  IF v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'เคสอยู่ในถังขยะ กรุณาให้ผู้สร้างเคสหรือแอดมินกู้คืนก่อนใช้งาน' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER require_active_case BEFORE INSERT OR UPDATE OF video_case_id ON public.evaluations
FOR EACH ROW EXECUTE FUNCTION public.require_active_video_case();
CREATE TRIGGER require_active_case BEFORE INSERT OR UPDATE OF video_case_id ON public.video_case_members
FOR EACH ROW EXECUTE FUNCTION public.require_active_video_case();
CREATE TRIGGER require_active_case BEFORE INSERT OR UPDATE OF video_case_id ON public.video_case_aggregates
FOR EACH ROW EXECUTE FUNCTION public.require_active_video_case();
CREATE TRIGGER require_active_case BEFORE INSERT OR UPDATE OF video_case_id ON public.video_case_analysis_runs
FOR EACH ROW EXECUTE FUNCTION public.require_active_video_case();
CREATE TRIGGER require_active_case BEFORE INSERT OR UPDATE OF video_case_id ON public.video_case_aggregate_runs
FOR EACH ROW EXECUTE FUNCTION public.require_active_video_case();

NOTIFY pgrst, 'reload schema';

-- Run inside a transaction and always ROLLBACK. Only synthetic rows are used.
DO $$
DECLARE
  actor uuid;
  reviewer uuid;
  admin_actor uuid;
  sample public.video_cases;
  restored public.video_cases;
  review_id bigint;
  test_aggregate_id uuid;
  test_order text := 'TRASH-ROLLBACK-' || gen_random_uuid()::text;
BEGIN
  SELECT u.id INTO actor FROM auth.users u
    JOIN public.user_information p ON p.auth_user_id::text = u.id::text WHERE p.role = 'user' LIMIT 1;
  SELECT u.id INTO reviewer FROM auth.users u
    JOIN public.user_information p ON p.auth_user_id::text = u.id::text WHERE p.role <> 'admin' AND u.id <> actor LIMIT 1;
  SELECT auth_user_id::uuid INTO admin_actor FROM public.user_information WHERE role = 'admin' LIMIT 1;
  IF actor IS NULL OR reviewer IS NULL OR admin_actor IS NULL THEN RAISE EXCEPTION 'Need creator, non-admin reviewer and admin for rollback test'; END IF;
  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  sample := public.resolve_video_case_by_identity(test_order, 'Trash test');
  INSERT INTO public.evaluations(order_number,subject_name,user_id,video_case_id,rubric)
    VALUES(test_order,'Trash test',actor,sample.id,'{}') RETURNING id INTO review_id;
  INSERT INTO public.video_case_aggregates(video_case_id,requested_by,source_evaluation_ids,source_count)
    VALUES(sample.id,actor,ARRAY[review_id::integer],1) RETURNING id INTO test_aggregate_id;
  PERFORM set_config('request.jwt.claim.sub', reviewer::text, true);
  PERFORM public.resolve_video_case_by_identity(test_order, 'Trash test', NULL, NULL, NULL, NULL, 'leader');
  BEGIN
    PERFORM public.set_video_case_trashed(sample.id,true);
    RAISE EXCEPTION 'Non-owner leader could trash case';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  restored := public.set_video_case_trashed(sample.id,true);
  IF restored.deleted_at IS NULL OR restored.deleted_by <> actor THEN RAISE EXCEPTION 'Trash state missing'; END IF;
  IF (public.set_video_case_trashed(sample.id,true)).deleted_at <> restored.deleted_at THEN RAISE EXCEPTION 'Repeated trash not idempotent'; END IF;
  BEGIN
    PERFORM public.resolve_video_case_by_identity(test_order,'Trash test');
    RAISE EXCEPTION 'Trashed case accepted new join';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  BEGIN
    UPDATE public.video_cases SET description = 'must fail' WHERE id = sample.id;
    RAISE EXCEPTION 'Trashed case accepted metadata edit';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  BEGIN
    INSERT INTO public.evaluations(order_number,subject_name,user_id,video_case_id)
      VALUES(test_order,'Trash test',actor,sample.id);
    RAISE EXCEPTION 'Trashed case accepted evaluation';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  BEGIN
    INSERT INTO public.video_case_aggregates(video_case_id,requested_by) VALUES(sample.id,actor);
    RAISE EXCEPTION 'Trashed case accepted aggregate';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN NULL; END;
  -- In-flight callbacks can finish after moving the case to trash.
  UPDATE public.evaluations SET document_status = 'ready',pdf_storage_path = 'rollback-test/report.pdf' WHERE id = review_id;
  UPDATE public.video_case_aggregates SET status = 'ready' WHERE id = test_aggregate_id;
  PERFORM set_config('request.jwt.claim.sub', reviewer::text, true);
  BEGIN
    PERFORM public.set_video_case_trashed(sample.id,false);
    RAISE EXCEPTION 'Non-owner leader could restore case';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub', admin_actor::text, true);
  restored := public.set_video_case_trashed(sample.id,false);
  IF restored.deleted_at IS NOT NULL OR restored.deleted_by IS NOT NULL OR restored.id <> sample.id OR restored.case_key <> sample.case_key THEN
    RAISE EXCEPTION 'Restore changed identity or retained trash state';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.evaluations WHERE id=review_id AND video_case_id=sample.id AND document_status='ready')
    OR NOT EXISTS (SELECT 1 FROM public.video_case_aggregates WHERE id=test_aggregate_id AND video_case_id=sample.id AND status='ready')
    OR (SELECT count(*) FROM public.video_case_members WHERE video_case_id=sample.id) <> 2
    OR NOT EXISTS (SELECT 1 FROM public.video_case_aggregate_sources WHERE evaluation_id=review_id AND video_case_aggregate_sources.aggregate_id=test_aggregate_id) THEN
    RAISE EXCEPTION 'Original reviews, membership or report links changed';
  END IF;
  PERFORM public.set_video_case_trashed(sample.id,true);
  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  PERFORM public.set_video_case_trashed(sample.id,false);
  restored := public.resolve_video_case_by_identity(test_order,'Trash test');
  IF restored.id <> sample.id THEN RAISE EXCEPTION 'Restore created duplicate case'; END IF;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.set_video_case_trashed(sample.id,true);
    RAISE EXCEPTION 'Anonymous trash allowed';
  EXCEPTION WHEN invalid_authorization_specification THEN NULL; END;
END;
$$;

ROLLBACK;