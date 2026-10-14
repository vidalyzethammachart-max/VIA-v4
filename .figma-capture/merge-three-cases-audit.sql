SELECT c.id,c.case_key,c.case_title,c.order_number,c.subject_name,c.description,c.created_by,c.deleted_at,c.source_file_name,c.video_object_key,
  (SELECT jsonb_agg(jsonb_build_object('id',e.id,'kind',e.analysis_kind,'user_id',e.user_id,'document_status',e.document_status)) FROM public.evaluations e WHERE e.video_case_id=c.id) evaluations,
  (SELECT jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.member_role)) FROM public.video_case_members m WHERE m.video_case_id=c.id) members,
  (SELECT count(*) FROM public.video_case_aggregates a WHERE a.video_case_id=c.id) aggregates,
  (SELECT count(*) FROM public.video_case_analysis_runs a WHERE a.video_case_id=c.id) analysis_runs,
  (SELECT count(*) FROM public.video_case_aggregate_runs a WHERE a.video_case_id=c.id) aggregate_runs
FROM public.video_cases c WHERE c.case_key IN ('ทดสอบการประเมิน-2-141069','ทดสอบการประเมิน-1-141069','ทดสอบ-001-141069');
