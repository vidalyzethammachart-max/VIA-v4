-- Real database regression check. All queue changes are rolled back; no AI dispatch.
BEGIN;
SELECT set_config('request.jwt.claim.sub',user_id::text,true)
FROM public.evaluations WHERE id=246;
SET LOCAL ROLE authenticated;
SELECT public.enqueue_ai_document('evaluation','246',jsonb_build_object(
  'evaluation_id',244,'aggregate_id','00000000-0000-4000-8000-000000000001',
  'document_type','video_case_summary','actor_user_id','00000000-0000-4000-8000-000000000001',
  'callback_url','https://untrusted.invalid','callback_secret','untrusted',
  'document_callback_secret','untrusted','documents_bucket','untrusted',
  'notes','Rollback-only security verification'));
RESET ROLE;
DO $$
DECLARE q public.ai_request_queue;
BEGIN
  SELECT * INTO STRICT q FROM public.ai_request_queue WHERE target_kind='evaluation' AND target_id='246';
  IF q.payload->>'evaluation_id'<>'246' OR q.payload->>'document_type'<>'evaluation'
     OR q.payload->>'actor_user_id' IS DISTINCT FROM auth.uid()::text THEN
    RAISE EXCEPTION 'Authorized identity not enforced';
  END IF;
  IF q.payload ?| ARRAY['aggregate_id','callback_url','callback_secret','document_callback_secret','documents_bucket'] THEN
    RAISE EXCEPTION 'Untrusted delivery or alternate identity survived';
  END IF;
END $$;
SELECT 'PASS: deployed RPC enforces authorized identity and strips browser delivery settings' AS result;
ROLLBACK;
