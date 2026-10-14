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
COMMIT;
