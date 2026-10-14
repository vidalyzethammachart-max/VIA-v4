-- One-time, explicitly requested merge of these three cases only.
-- Keep the selected case, all evaluation IDs, original answers and documents.
-- Duplicate case records remain recoverable in trash; no rows are deleted.
-- This file intentionally ROLLBACKs for rehearsal. The reviewed execution copy
-- replaces only the final ROLLBACK with COMMIT.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TEMP TABLE merge_case_before ON COMMIT DROP AS
SELECT * FROM public.video_cases WHERE false;
CREATE TEMP TABLE merge_evaluation_before ON COMMIT DROP AS
SELECT * FROM public.evaluations WHERE false;
DO $$
DECLARE
  target_id constant uuid := '95dc3f91-1003-4fe2-a59d-247fa771eaab';
  source_ids constant uuid[] := ARRAY['4b656203-ff17-4e85-912a-c32a5596cd8e','89232ecc-85f6-4767-8c7a-c0aca8171a04']::uuid[];
  all_ids uuid[] := source_ids || target_id;
  actor constant uuid := '9546a2e6-4245-4e91-b5f5-26a0ca6409af';
  source_id uuid;
BEGIN
  PERFORM id FROM public.video_cases WHERE id = ANY(all_ids) ORDER BY id FOR UPDATE;
  PERFORM id FROM public.evaluations WHERE video_case_id = ANY(all_ids) ORDER BY id FOR UPDATE;
  INSERT INTO merge_case_before SELECT * FROM public.video_cases WHERE id = ANY(all_ids);
  INSERT INTO merge_evaluation_before SELECT * FROM public.evaluations WHERE video_case_id = ANY(all_ids);
  IF (SELECT count(*) FROM merge_case_before) <> 3
    OR EXISTS (SELECT 1 FROM merge_case_before WHERE created_by <> actor OR deleted_at IS NOT NULL OR video_object_key IS NOT NULL OR source_file_name IS NOT NULL OR description IS NOT NULL)
    OR NOT EXISTS (SELECT 1 FROM merge_case_before WHERE id=target_id AND case_key='ทดสอบการประเมิน-2-141069' AND case_title='141069ทดสอบ')
    OR NOT EXISTS (SELECT 1 FROM merge_case_before WHERE id=source_ids[1] AND case_key='ทดสอบการประเมิน-1-141069')
    OR NOT EXISTS (SELECT 1 FROM merge_case_before WHERE id=source_ids[2] AND case_key='ทดสอบ-001-141069') THEN
    RAISE EXCEPTION 'Cases changed since review; stop and inspect again';
  END IF;
  IF (SELECT count(*) FROM merge_evaluation_before) <> 2
    OR NOT EXISTS (SELECT 1 FROM merge_evaluation_before WHERE id=240 AND video_case_id=source_ids[1] AND document_status='ready')
    OR NOT EXISTS (SELECT 1 FROM merge_evaluation_before WHERE id=241 AND video_case_id=target_id AND document_status='ready')
    OR EXISTS (SELECT 1 FROM public.video_case_aggregates WHERE video_case_id=ANY(all_ids))
    OR EXISTS (SELECT 1 FROM public.video_case_analysis_runs WHERE video_case_id=ANY(all_ids))
    OR EXISTS (SELECT 1 FROM public.video_case_aggregate_runs WHERE video_case_id=ANY(all_ids))
    OR (SELECT count(*) FROM public.video_case_members WHERE video_case_id=ANY(all_ids)) <> 3
    OR EXISTS (SELECT 1 FROM public.video_case_members WHERE video_case_id=ANY(all_ids) AND (user_id<>actor OR member_role<>'member')) THEN
    RAISE EXCEPTION 'Reviews, reports or membership changed since review; stop and inspect again';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  UPDATE public.evaluations SET video_case_id=target_id WHERE id=240 AND video_case_id=source_ids[1];
  FOREACH source_id IN ARRAY source_ids LOOP
    PERFORM public.set_video_case_trashed(source_id,true);
  END LOOP;
  -- Verify that only the parent link changed. Original form identity, scores,
  -- AI output and report paths must stay byte-for-byte equal as JSON values.
  IF EXISTS (
    SELECT 1 FROM merge_evaluation_before b LEFT JOIN public.evaluations e USING(id)
    WHERE e.id IS NULL OR e.video_case_id<>target_id
      OR (to_jsonb(e)-ARRAY['video_case_id','updated_at']) IS DISTINCT FROM (to_jsonb(b)-ARRAY['video_case_id','updated_at'])
  ) OR (SELECT count(*) FROM public.evaluations WHERE video_case_id=target_id) <> 2
    OR EXISTS (SELECT 1 FROM public.evaluations WHERE video_case_id=ANY(source_ids))
    OR (SELECT count(*) FROM public.video_cases WHERE id=ANY(all_ids) AND deleted_at IS NULL) <> 1
    OR EXISTS (
      SELECT 1 FROM merge_case_before b LEFT JOIN public.video_cases c USING(id)
      WHERE c.id IS NULL OR (to_jsonb(c)-ARRAY['deleted_at','deleted_by','updated_at']) IS DISTINCT FROM (to_jsonb(b)-ARRAY['deleted_at','deleted_by','updated_at'])
    ) THEN RAISE EXCEPTION 'Merge preservation assertions failed'; END IF;
END;
$$;
SELECT c.case_key,c.case_title,c.deleted_at IS NOT NULL AS in_trash,
  (SELECT array_agg(e.id ORDER BY e.id) FROM public.evaluations e WHERE e.video_case_id=c.id) AS evaluation_ids
FROM public.video_cases c
WHERE c.id IN ('95dc3f91-1003-4fe2-a59d-247fa771eaab','4b656203-ff17-4e85-912a-c32a5596cd8e','89232ecc-85f6-4767-8c7a-c0aca8171a04');
ROLLBACK;
