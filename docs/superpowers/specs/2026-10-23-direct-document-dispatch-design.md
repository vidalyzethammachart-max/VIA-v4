# Direct document dispatch — proposed design

Status: approved by the user on 2026-10-23 ("เปลี่ยนเลย").

## Intent

New evaluation and summary submissions must start their n8n workflow immediately,
without a queue, a global waiting lane, or a worker running on a personal computer.
This applies to data-only and video submissions. Video still uploads directly to
R2 before workflow dispatch. Processing remains asynchronous: an accepted request
is not a completed analysis or a downloadable document.

## Approaches

Recommended: retain the authenticated Supabase `forward-to-n8n` Edge Function as
the server-side boundary, but have it send the authorized payload directly to n8n.
n8n acknowledges receipt promptly and completes the existing callback pipeline.
This fits the existing clients and keeps workflow settings and secrets server-side.

Sending from the browser straight to n8n would expose the workflow endpoint and
remove the existing authorization boundary. Waiting for the entire AI/document
pipeline inside a browser request would couple submission to long-running work
and request timeouts. Neither approach is recommended.

## Proposed behavior

- Save the evaluation or aggregate, upload video when present, and invoke
  `forward-to-n8n` once. Forward immediately; do not call `enqueue_ai_document`.
- Preserve owner/admin checks for evaluations and leader/admin checks for
  aggregates, reject trashed cases, and validate video ownership. Canonicalize
  document identifiers and supply callback destinations only on the server.
- Prevent concurrent dispatch of the same document using an atomic per-document
  dispatch record. This is duplicate prevention, not a scheduler: different
  documents dispatch independently and no process polls for work.
- Return acceptance only after the webhook acknowledges it. Only a successful
  callback with stored artifacts makes the document ready. A callback that wins
  a race must not be overwritten by a later dispatch response or failure handler.
- Report rejected delivery clearly. An ambiguous network timeout must not
  automatically replay a workflow that might already have started.
- Remove the queue panel and worker-offline warning. Show document processing,
  ready, and failed states using document/dispatch status rather than legacy
  `queue_status`.
- Retire the worker startup path and document the direct flow. Preserve historical
  migrations and queue records. A migration disables legacy enqueue/claim/retry
  entry points so an old worker cannot later dispatch historical jobs unexpectedly.
- Existing queued jobs are not automatically replayed or deleted. Their handling
  is separate from the new submission path and requires checking delivery history.

## Verification and rollout

Behavior tests cover immediate dispatch, authorization, canonical target identity,
duplicate suppression, webhook rejection, ambiguous delivery, and callback races.
Run the complete test suite, lint, and production build.

Local frontend changes alone do not change the hosted Edge Function. Rollout
requires applying the database migration and deploying `forward-to-n8n`, confirming
its server-side webhook configuration and prompt n8n acknowledgement, and then
testing one authorized submission through its real callback. Do not call a live
workflow or replay an old job just to simulate successful verification.
