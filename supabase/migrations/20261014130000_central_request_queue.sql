-- Durable, single-lane document/AI queue. No public payload access or public worker RPCs.
CREATE TABLE public.ai_request_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_kind text NOT NULL CHECK (target_kind IN ('evaluation','aggregate')),
  target_id text NOT NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  video_case_id uuid REFERENCES public.video_cases(id),
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','awaiting_callback','retry_wait','completed','failed','attention')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_kind,target_id)
);
CREATE UNIQUE INDEX ai_request_queue_single_active ON public.ai_request_queue ((true)) WHERE state IN ('running','awaiting_callback','attention');
CREATE INDEX ai_request_queue_due ON public.ai_request_queue(available_at,created_at) WHERE state IN ('queued','retry_wait');
ALTER TABLE public.ai_request_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_request_queue FROM anon,authenticated;
GRANT SELECT(id,target_kind,target_id,requested_by,video_case_id,state,attempts,available_at,last_error,created_at,updated_at) ON public.ai_request_queue TO authenticated;
CREATE POLICY queue_read_owner ON public.ai_request_queue FOR SELECT TO authenticated
 USING (requested_by=auth.uid() OR public.role_at_least('admin'::public.app_role));
CREATE TABLE public.ai_queue_control (id boolean PRIMARY KEY DEFAULT true CHECK(id), next_dispatch_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.ai_queue_control(id) VALUES(true);
ALTER TABLE public.ai_queue_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_queue_control FROM anon,authenticated;
ALTER TABLE public.evaluations ADD COLUMN queue_status text;
ALTER TABLE public.video_case_aggregates ADD COLUMN queue_status text;

CREATE FUNCTION public.enqueue_ai_document(p_kind text,p_id text,p_payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE owner_id uuid; case_id uuid; ready boolean; job_id uuid; actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>2097152 THEN RAISE EXCEPTION 'Invalid queue payload'; END IF;
 IF p_kind='evaluation' THEN
   SELECT user_id,video_case_id,document_status='ready' INTO owner_id,case_id,ready FROM evaluations WHERE id=p_id::bigint FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found'; END IF;
   IF owner_id IS DISTINCT FROM actor AND NOT public.role_at_least('admin'::public.app_role) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 ELSIF p_kind='aggregate' THEN
   SELECT requested_by,video_case_id,document_status='ready' INTO owner_id,case_id,ready FROM video_case_aggregates WHERE id=p_id::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Aggregate not found'; END IF;
   IF NOT coalesce(public.current_video_case_role(case_id)='leader' OR public.role_at_least('admin'::public.app_role),false) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 ELSE RAISE EXCEPTION 'Invalid target'; END IF;
 IF case_id IS NOT NULL AND EXISTS(SELECT 1 FROM video_cases WHERE id=case_id AND deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'Case is in trash'; END IF;
 IF p_payload->>'hasVideo'='true' AND (coalesce(p_payload#>>'{video,objectKey}','') NOT LIKE 'video-submissions/'||actor::text||'/%') THEN RAISE EXCEPTION 'Video must belong to requester' USING ERRCODE='42501'; END IF;
 SELECT id INTO job_id FROM ai_request_queue WHERE target_kind=p_kind AND target_id=p_id;
 IF job_id IS NOT NULL THEN RETURN job_id; END IF;
 INSERT INTO ai_request_queue(target_kind,target_id,requested_by,video_case_id,payload,state)
 VALUES(p_kind,p_id,actor,case_id,p_payload,CASE WHEN ready THEN 'completed' ELSE 'queued' END) RETURNING id INTO job_id;
 IF p_kind='evaluation' THEN UPDATE evaluations SET queue_status=CASE WHEN ready THEN 'completed' ELSE 'queued' END WHERE id=p_id::bigint;
 ELSE UPDATE video_case_aggregates SET queue_status=CASE WHEN ready THEN 'completed' ELSE 'queued' END WHERE id=p_id::uuid; END IF;
 RETURN job_id;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_ai_document(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_ai_document(text,text,jsonb) TO authenticated;

CREATE FUNCTION public.claim_ai_request() RETURNS SETOF public.ai_request_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.ai_request_queue; next_at timestamptz;
BEGIN
 SELECT next_dispatch_at INTO next_at FROM ai_queue_control WHERE id=true FOR UPDATE;
 UPDATE ai_request_queue q SET state='completed',last_error=NULL,updated_at=now()
 WHERE state<>'completed' AND ((target_kind='evaluation' AND EXISTS(SELECT 1 FROM evaluations e WHERE e.id::text=q.target_id AND e.document_status='ready' AND (e.pdf_storage_path IS NOT NULL OR e.docx_storage_path IS NOT NULL)))
 OR (target_kind='aggregate' AND EXISTS(SELECT 1 FROM video_case_aggregates a WHERE a.id::text=q.target_id AND a.document_status='ready' AND (a.pdf_storage_path IS NOT NULL OR a.docx_storage_path IS NOT NULL))));
 IF EXISTS(SELECT 1 FROM ai_request_queue WHERE state='completed' AND updated_at>now()-interval '90 seconds') THEN RETURN; END IF;
 -- A crashed worker may have delivered a request. Never blindly replay it.
 UPDATE ai_request_queue SET state='attention',last_error='Worker lease expired; inspect n8n before retrying.',updated_at=now()
 WHERE state IN ('running','awaiting_callback') AND lease_until<now();
 IF next_at>now() OR EXISTS(SELECT 1 FROM ai_request_queue WHERE state IN ('running','awaiting_callback','attention')) THEN RETURN; END IF;
 UPDATE ai_request_queue q SET state='failed',last_error='Case moved to trash',updated_at=now()
 WHERE state IN ('queued','retry_wait') AND EXISTS(SELECT 1 FROM video_cases c WHERE c.id=q.video_case_id AND c.deleted_at IS NOT NULL);
 SELECT * INTO j FROM ai_request_queue WHERE state IN ('queued','retry_wait') AND available_at<=now() ORDER BY created_at,id LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 RETURN QUERY UPDATE ai_request_queue SET state='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '15 minutes',updated_at=now() WHERE id=j.id RETURNING *;
END $$;

CREATE FUNCTION public.finish_ai_request(p_id uuid,p_token uuid,p_state text,p_delay_seconds integer DEFAULT 60,p_error text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.ai_request_queue;
BEGIN
 PERFORM 1 FROM ai_queue_control WHERE id=true FOR UPDATE;
 SELECT * INTO j FROM ai_request_queue WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF j.state='completed' THEN RETURN true; END IF; -- A callback can win the race.
 IF j.lease_token IS DISTINCT FROM p_token OR j.state NOT IN ('running','awaiting_callback') THEN RETURN false; END IF;
 IF p_state NOT IN ('awaiting_callback','retry_wait','completed','failed','attention') THEN RAISE EXCEPTION 'Invalid transition'; END IF;
 UPDATE ai_request_queue SET state=p_state,last_error=left(p_error,1000),updated_at=now(),
   available_at=now()+make_interval(secs=>greatest(60,least(p_delay_seconds,604800))) WHERE id=p_id;
 UPDATE ai_queue_control SET next_dispatch_at=now()+make_interval(secs=>greatest(60,least(p_delay_seconds,604800))) WHERE id=true;
 RETURN true;
END $$;

CREATE FUNCTION public.sync_ai_queue_target() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.target_kind='evaluation' THEN
   UPDATE evaluations SET queue_status=NEW.state WHERE id=NEW.target_id::bigint;
 ELSE UPDATE video_case_aggregates SET queue_status=NEW.state WHERE id=NEW.target_id::uuid; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_ai_queue_target AFTER UPDATE OF state ON public.ai_request_queue FOR EACH ROW EXECUTE FUNCTION public.sync_ai_queue_target();
REVOKE ALL ON FUNCTION public.claim_ai_request(),public.finish_ai_request(uuid,uuid,text,integer,text),public.sync_ai_queue_target() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_ai_request(),public.finish_ai_request(uuid,uuid,text,integer,text) TO service_role;
GRANT ALL ON public.ai_request_queue,public.ai_queue_control TO service_role;

CREATE FUNCTION public.retry_ai_request(p_id uuid,p_delivery_checked boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.ai_request_queue;
BEGIN
 PERFORM 1 FROM ai_queue_control WHERE id=true FOR UPDATE;
 SELECT * INTO j FROM ai_request_queue WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT coalesce(j.requested_by=auth.uid() OR public.role_at_least('admin'::public.app_role),false) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF j.state NOT IN ('failed','attention') THEN RAISE EXCEPTION 'Only failed or inspected jobs can be retried'; END IF;
 IF j.state='attention' AND NOT p_delivery_checked THEN RAISE EXCEPTION 'Confirm the original execution has stopped before retrying'; END IF;
 UPDATE ai_request_queue SET state='queued',attempts=0,available_at=now(),lease_token=NULL,lease_until=NULL,last_error=NULL,updated_at=now() WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.retry_ai_request(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retry_ai_request(uuid,boolean) TO authenticated;
