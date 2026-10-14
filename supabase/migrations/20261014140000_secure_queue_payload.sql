-- Bind the worker payload to the document authorized by the RPC, including
-- callers that bypass forward-to-n8n and invoke this function directly.
CREATE OR REPLACE FUNCTION public.enqueue_ai_document(p_kind text,p_id text,p_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  owner_id uuid;
  case_id uuid;
  ready boolean;
  job_id uuid;
  actor uuid := auth.uid();
  authorized_id text;
  secured_payload jsonb;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>2097152 THEN
    RAISE EXCEPTION 'Invalid queue payload';
  END IF;

  IF p_kind='evaluation' THEN
    SELECT id::text,user_id,video_case_id,document_status='ready'
      INTO authorized_id,owner_id,case_id,ready
      FROM evaluations WHERE id=p_id::bigint FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found'; END IF;
    IF owner_id IS DISTINCT FROM actor AND NOT public.role_at_least('admin'::public.app_role) THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
    END IF;
  ELSIF p_kind='aggregate' THEN
    SELECT id::text,requested_by,video_case_id,document_status='ready'
      INTO authorized_id,owner_id,case_id,ready
      FROM video_case_aggregates WHERE id=p_id::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Aggregate not found'; END IF;
    IF NOT coalesce(public.current_video_case_role(case_id)='leader' OR public.role_at_least('admin'::public.app_role),false) THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid target';
  END IF;

  IF case_id IS NOT NULL AND EXISTS(SELECT 1 FROM video_cases WHERE id=case_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Case is in trash';
  END IF;
  IF p_payload->>'hasVideo'='true' AND (coalesce(p_payload#>>'{video,objectKey}','') NOT LIKE 'video-submissions/'||actor::text||'/%') THEN
    RAISE EXCEPTION 'Video must belong to requester' USING ERRCODE='42501';
  END IF;

  -- The authorized row supplies the canonical ID, never a browser payload.
  -- Also discard delivery settings: only the server may choose those.
  secured_payload := (p_payload - ARRAY[
    'evaluation_id','aggregate_id','document_type','actor_user_id',
    'callback_url','callback_secret','document_callback_secret','documents_bucket'
  ]::text[]) || jsonb_build_object('actor_user_id',actor);
  IF p_kind='evaluation' THEN
    secured_payload := secured_payload || jsonb_build_object(
      'document_type','evaluation','evaluation_id',authorized_id::bigint);
  ELSE
    secured_payload := secured_payload || jsonb_build_object(
      'document_type','video_case_summary','aggregate_id',authorized_id);
  END IF;

  SELECT id INTO job_id FROM ai_request_queue WHERE target_kind=p_kind AND target_id=authorized_id;
  IF job_id IS NOT NULL THEN RETURN job_id; END IF;
  INSERT INTO ai_request_queue(target_kind,target_id,requested_by,video_case_id,payload,state)
    VALUES(p_kind,authorized_id,actor,case_id,secured_payload,CASE WHEN ready THEN 'completed' ELSE 'queued' END)
    RETURNING id INTO job_id;
  IF p_kind='evaluation' THEN
    UPDATE evaluations SET queue_status=CASE WHEN ready THEN 'completed' ELSE 'queued' END WHERE id=authorized_id::bigint;
  ELSE
    UPDATE video_case_aggregates SET queue_status=CASE WHEN ready THEN 'completed' ELSE 'queued' END WHERE id=authorized_id::uuid;
  END IF;
  RETURN job_id;
END $$;

REVOKE ALL ON FUNCTION public.enqueue_ai_document(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_ai_document(text,text,jsonb) TO authenticated;
