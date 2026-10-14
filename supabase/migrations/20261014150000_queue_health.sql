ALTER TABLE public.ai_queue_control ADD COLUMN last_heartbeat_at timestamptz;

CREATE FUNCTION public.heartbeat_ai_queue() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  UPDATE public.ai_queue_control SET last_heartbeat_at=clock_timestamp() WHERE id=true;
$$;
REVOKE ALL ON FUNCTION public.heartbeat_ai_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat_ai_queue() TO service_role;

-- Only global health booleans are shared; queue rows and payloads retain RLS.
CREATE FUNCTION public.get_ai_queue_health() RETURNS TABLE(worker_online boolean,paused boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce(last_heartbeat_at>now()-interval '90 seconds',false),
    EXISTS(SELECT 1 FROM public.ai_request_queue WHERE state='attention')
  FROM public.ai_queue_control WHERE id=true;
$$;
REVOKE ALL ON FUNCTION public.get_ai_queue_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ai_queue_health() TO authenticated,service_role;
