-- Run inside a transaction and ROLLBACK. Uses only the approved synthetic E2E review #246.
DO $$
DECLARE actor uuid; j uuid; duplicate_id uuid; claimed public.ai_request_queue; second_count integer; old_count integer;
BEGIN
 SELECT user_id INTO actor FROM public.evaluations WHERE id=246;
 IF actor IS NULL THEN RAISE EXCEPTION 'Synthetic evaluation #246 required'; END IF;
 SELECT count(*) INTO old_count FROM public.evaluations WHERE id IN (244,245,246,247);
 UPDATE public.evaluations SET document_status='pending' WHERE id=246;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
 BEGIN
   PERFORM public.enqueue_ai_document('evaluation','246','{"evaluation_id":246}');
   RAISE EXCEPTION 'Unauthorized enqueue accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 j:=public.enqueue_ai_document('evaluation','246','{"evaluation_id":246}');
 duplicate_id:=public.enqueue_ai_document('evaluation','246','{"evaluation_id":246,"modified":true}');
 IF j<>duplicate_id OR (SELECT count(*) FROM public.ai_request_queue WHERE target_id='246')<>1 THEN RAISE EXCEPTION 'Duplicate request created'; END IF;
 IF (SELECT payload ? 'modified' FROM public.ai_request_queue WHERE id=j) THEN RAISE EXCEPTION 'Payload overwritten'; END IF;
 SELECT * INTO claimed FROM public.claim_ai_request();
 IF claimed.id<>j OR claimed.attempts<>1 THEN RAISE EXCEPTION 'Claim failed'; END IF;
 SELECT count(*) INTO second_count FROM public.claim_ai_request();
 IF second_count<>0 THEN RAISE EXCEPTION 'Concurrent dispatch allowed'; END IF;
 IF public.finish_ai_request(j,gen_random_uuid(),'completed') THEN RAISE EXCEPTION 'Stale token accepted'; END IF;
 PERFORM public.finish_ai_request(j,claimed.lease_token,'retry_wait',120,'Transient test');
 IF (SELECT state FROM public.ai_request_queue WHERE id=j)<>'retry_wait' THEN RAISE EXCEPTION 'Retry state missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.claim_ai_request()) THEN RAISE EXCEPTION 'Cooldown ignored'; END IF;
 UPDATE public.ai_queue_control SET next_dispatch_at=now()-interval '1 minute';
 UPDATE public.ai_request_queue SET available_at=now()-interval '1 minute' WHERE id=j;
 SELECT * INTO claimed FROM public.claim_ai_request();
 IF claimed.attempts<>2 THEN RAISE EXCEPTION 'Retry did not increment attempts'; END IF;
 UPDATE public.ai_request_queue SET lease_until=now()-interval '1 minute' WHERE id=j;
 PERFORM public.claim_ai_request();
 IF (SELECT state FROM public.ai_request_queue WHERE id=j)<>'attention' THEN RAISE EXCEPTION 'Ambiguous delivery replayed'; END IF;
 UPDATE public.evaluations SET document_status='ready',pdf_storage_path='queue-test/rollback.pdf' WHERE id=246;
 PERFORM public.claim_ai_request();
 IF (SELECT state FROM public.ai_request_queue WHERE id=j)<>'completed' THEN RAISE EXCEPTION 'Callback did not complete job'; END IF;
 PERFORM public.finish_ai_request(j,claimed.lease_token,'retry_wait',120,'Late failure');
 IF (SELECT state FROM public.ai_request_queue WHERE id=j)<>'completed' THEN RAISE EXCEPTION 'Ready callback overwritten'; END IF;
 IF (SELECT count(*) FROM public.evaluations WHERE id IN (244,245,246,247))<>old_count THEN RAISE EXCEPTION 'Source evaluations changed'; END IF;
END $$;
SELECT 'PASS: authorization, immutable idempotency, single lane, retry cooldown, lease fencing, ambiguous delivery and callback race' AS result;
