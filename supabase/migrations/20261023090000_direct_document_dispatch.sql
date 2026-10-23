-- Immediate dispatch with a per-document duplicate guard, never a scheduler.
CREATE TABLE public.document_dispatches (
  target_kind text NOT NULL CHECK (target_kind IN ('evaluation','aggregate')),
  target_id text NOT NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  state text NOT NULL CHECK (state IN ('dispatching','accepted','unknown','rejected','completed','failed')),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_kind,target_id)
);
ALTER TABLE public.document_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_dispatches FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.document_dispatches TO service_role;

CREATE FUNCTION public.begin_document_dispatch(p_kind text,p_id text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  actor uuid := auth.uid(); owner_id uuid; case_id uuid; canonical_id text;
  ready boolean; secured jsonb; existing public.document_dispatches; dispatch_token uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>2097152 THEN
    RAISE EXCEPTION 'Invalid document payload';
  END IF;
  -- Lock only this document: unrelated submissions never wait for each other.
  IF p_kind='evaluation' THEN
    SELECT id::text,user_id,video_case_id,
      document_status='ready' AND (pdf_storage_path IS NOT NULL OR docx_storage_path IS NOT NULL)
    INTO canonical_id,owner_id,case_id,ready FROM evaluations WHERE id=p_id::bigint FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found'; END IF;
    IF owner_id IS DISTINCT FROM actor AND NOT public.role_at_least('admin'::public.app_role) THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
    END IF;
  ELSIF p_kind='aggregate' THEN
    SELECT id::text,requested_by,video_case_id,
      document_status='ready' AND (pdf_storage_path IS NOT NULL OR docx_storage_path IS NOT NULL)
    INTO canonical_id,owner_id,case_id,ready FROM video_case_aggregates WHERE id=p_id::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Aggregate not found'; END IF;
    IF NOT coalesce(public.current_video_case_role(case_id)='leader' OR public.role_at_least('admin'::public.app_role),false) THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
    END IF;
  ELSE RAISE EXCEPTION 'Invalid document target'; END IF;

  IF case_id IS NOT NULL AND EXISTS(SELECT 1 FROM video_cases WHERE id=case_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Case is in trash';
  END IF;
  IF p_payload->>'hasVideo'='true' OR p_payload->'video' IS NOT NULL AND p_payload->'video'<>'null'::jsonb THEN
    IF coalesce(p_payload#>>'{video,objectKey}','') NOT LIKE 'video-submissions/'||actor::text||'/%'
      OR position('..' in p_payload#>>'{video,objectKey}')>0 THEN
      RAISE EXCEPTION 'Video must belong to requester' USING ERRCODE='42501';
    END IF;
  END IF;
  IF ready THEN RETURN jsonb_build_object('dispatch',false,'status','ready'); END IF;
  IF EXISTS(SELECT 1 FROM ai_request_queue WHERE target_kind=p_kind AND target_id=canonical_id) THEN
    RAISE EXCEPTION 'Legacy request exists; inspect its previous delivery before resubmitting' USING ERRCODE='55000';
  END IF;
  SELECT * INTO existing FROM document_dispatches WHERE target_kind=p_kind AND target_id=canonical_id;
  IF FOUND THEN
    RETURN jsonb_build_object('dispatch',false,'status',CASE existing.state
      WHEN 'completed' THEN 'ready' WHEN 'rejected' THEN 'failed' WHEN 'failed' THEN 'failed'
      WHEN 'unknown' THEN 'unknown' WHEN 'dispatching' THEN 'dispatching' ELSE 'pending' END);
  END IF;
  secured := (p_payload - ARRAY['evaluation_id','aggregate_id','document_type','actor_user_id',
    'callback_url','callback_secret','document_callback_secret','documents_bucket']::text[])
    || jsonb_build_object('actor_user_id',actor);
  IF secured ? 'created_by' THEN secured := secured || jsonb_build_object('created_by',actor); END IF;
  IF secured ? 'user_id' THEN secured := secured || jsonb_build_object('user_id',actor); END IF;
  IF p_kind='evaluation' THEN
    secured := secured || jsonb_build_object('document_type','evaluation','evaluation_id',canonical_id::bigint);
    UPDATE evaluations SET document_status='pending',document_error=NULL WHERE id=canonical_id::bigint;
  ELSE
    secured := secured || jsonb_build_object('document_type','video_case_summary','aggregate_id',canonical_id);
    UPDATE video_case_aggregates SET document_status='pending',document_error=NULL WHERE id=canonical_id::uuid;
  END IF;
  INSERT INTO document_dispatches(target_kind,target_id,requested_by,state)
    VALUES(p_kind,canonical_id,actor,'dispatching') RETURNING token INTO dispatch_token;
  RETURN jsonb_build_object('dispatch',true,'status','pending','token',dispatch_token,'payload',secured);
END $$;

CREATE FUNCTION public.finish_document_dispatch(p_kind text,p_id text,p_token uuid,p_state text,p_error text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE canonical_id text; current_status text; ready boolean; existing public.document_dispatches;
BEGIN
  IF p_state NOT IN ('accepted','unknown','rejected') THEN RAISE EXCEPTION 'Invalid dispatch result'; END IF;
  IF p_kind='evaluation' THEN
    SELECT id::text,document_status,document_status='ready' AND (pdf_storage_path IS NOT NULL OR docx_storage_path IS NOT NULL)
      INTO canonical_id,current_status,ready FROM evaluations WHERE id=p_id::bigint FOR UPDATE;
  ELSIF p_kind='aggregate' THEN
    SELECT id::text,document_status,document_status='ready' AND (pdf_storage_path IS NOT NULL OR docx_storage_path IS NOT NULL)
      INTO canonical_id,current_status,ready FROM video_case_aggregates WHERE id=p_id::uuid FOR UPDATE;
  ELSE RAISE EXCEPTION 'Invalid document target'; END IF;
  IF canonical_id IS NULL THEN RAISE EXCEPTION 'Document target not found'; END IF;
  SELECT * INTO existing FROM document_dispatches WHERE target_kind=p_kind AND target_id=canonical_id FOR UPDATE;
  IF NOT FOUND OR existing.token IS DISTINCT FROM p_token THEN RAISE EXCEPTION 'Invalid dispatch token'; END IF;
  IF ready OR existing.state='completed' THEN RETURN jsonb_build_object('status','ready'); END IF;
  IF existing.state='failed' THEN RETURN jsonb_build_object('status','failed'); END IF;
  IF existing.state<>'dispatching' THEN
    RETURN jsonb_build_object('status',CASE existing.state WHEN 'rejected' THEN 'failed' WHEN 'unknown' THEN 'unknown' ELSE 'pending' END);
  END IF;
  UPDATE document_dispatches SET state=p_state,last_error=left(p_error,1000),updated_at=now()
    WHERE target_kind=p_kind AND target_id=canonical_id;
  IF p_kind='evaluation' THEN
    UPDATE evaluations SET document_status=CASE WHEN p_state='rejected' THEN 'failed' ELSE 'pending' END,
      document_error=CASE WHEN p_state='accepted' THEN NULL ELSE left(p_error,1000) END WHERE id=canonical_id::bigint;
  ELSE
    UPDATE video_case_aggregates SET document_status=CASE WHEN p_state='rejected' THEN 'failed' ELSE 'pending' END,
      document_error=CASE WHEN p_state='accepted' THEN NULL ELSE left(p_error,1000) END WHERE id=canonical_id::uuid;
  END IF;
  RETURN jsonb_build_object('status',CASE WHEN p_state='rejected' THEN 'failed' WHEN p_state='unknown' THEN 'unknown' ELSE 'pending' END);
END $$;

CREATE FUNCTION public.sync_document_dispatch_callback() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.document_status='ready' AND (NEW.pdf_storage_path IS NOT NULL OR NEW.docx_storage_path IS NOT NULL) THEN
    UPDATE document_dispatches SET state='completed',last_error=NULL,updated_at=now()
      WHERE target_kind=TG_ARGV[0] AND target_id=NEW.id::text;
  ELSIF NEW.document_status='failed' THEN
    UPDATE document_dispatches SET state='failed',last_error=left(NEW.document_error,1000),updated_at=now()
      WHERE target_kind=TG_ARGV[0] AND target_id=NEW.id::text AND state NOT IN ('completed','rejected');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sync_evaluation_dispatch_callback AFTER UPDATE OF document_status,pdf_storage_path,docx_storage_path
  ON public.evaluations FOR EACH ROW EXECUTE FUNCTION public.sync_document_dispatch_callback('evaluation');
CREATE TRIGGER sync_aggregate_dispatch_callback AFTER UPDATE OF document_status,pdf_storage_path,docx_storage_path
  ON public.video_case_aggregates FOR EACH ROW EXECUTE FUNCTION public.sync_document_dispatch_callback('aggregate');
REVOKE ALL ON FUNCTION public.begin_document_dispatch(text,text,jsonb),
  public.finish_document_dispatch(text,text,uuid,text,text),public.sync_document_dispatch_callback() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_document_dispatch(text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_document_dispatch(text,text,uuid,text,text) TO service_role;

-- Keep historical rows; an old worker gets no work even if restarted later.
CREATE OR REPLACE FUNCTION public.claim_ai_request() RETURNS SETOF public.ai_request_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN RETURN; END $$;
REVOKE EXECUTE ON FUNCTION public.enqueue_ai_document(text,text,jsonb),public.retry_ai_request(uuid,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
