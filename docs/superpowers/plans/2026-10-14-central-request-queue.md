# Central request queue

Approved intent: process normal reviews and case summaries through one durable queue, retain source evaluations, avoid duplicate submissions, and remain on the existing free AI tier.

Implementation in this session (native):
- Persist immutable document requests in Supabase. Authorize the target before enqueueing; one job per document target. Hide payloads from other users with RLS.
- Atomically claim only one job globally. A worker dispatches the existing n8n workflow and waits for completion, spaces jobs, and persists retry times. A lost/ambiguous execution is held for inspection rather than duplicated automatically.
- Route the form and summary submission to the authenticated enqueue function. Compute combine statistics without an extra Gemini call; AI runs when the combined report is submitted. Upload videos to R2 then analyze them within the queued workflow.
- Show queue state on Dashboard. Keep document readiness dependent on the existing artifact callback.
- Configure n8n webhook to respond after the last node. Keep credentials and workflow logic unchanged. A local worker must remain running; production requires hosting the same worker continuously.
- Test retry policy, authorization, idempotency, simultaneous claims, callback races, stale leases, source integrity, and build. Verify deployment and a bounded existing test request before claiming live success.

Limits: a queue cannot increase free quota. Do not infer a daily quota from a generic HTTP 500. Transient retry has a finite budget; transport ambiguity does not cause automatic replay. Existing failed test jobs are not automatically re-created. Deployment activation and worker readiness must precede switching ingress.
