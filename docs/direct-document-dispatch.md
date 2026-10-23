# Direct document dispatch

New requests go from the browser to the authenticated `forward-to-n8n` Edge
Function, then straight to n8n. Video uploads go to R2 first. There is no queue,
global dispatch interval, queue polling, or worker process. Different documents
can start concurrently. The existing callback stores artifact paths and confirms
readiness; webhook acceptance does not mean a report is downloadable yet.

## Deploy

1. Apply `supabase/migrations/20261023090000_direct_document_dispatch.sql` to the
   same project used by `VITE_SUPABASE_URL`. Inspect outstanding deliveries first.
   This disables old enqueue/retry entry points and makes `claim_ai_request()`
   return no work. Historical queue rows and document records are preserved.
2. Set `N8N_WEBHOOK_URL` as a server-side Supabase Edge Function secret. Hosted
   functions already receive Supabase URL/anon/service credentials. The optional
   `DOCUMENTS_BUCKET` defaults to `evaluation-documents`.
3. Deploy `forward-to-n8n` and `document-generation-callback` to that project.
   The former imports `_shared/directForward.js` and `_shared/documentTarget.js`.
4. Confirm the main n8n webhook responds immediately on receipt (within the
   dispatch handler's 20-second acknowledgement limit), while the remaining
   workflow continues. Keep the existing authenticated callback and R2 payload
   contract. Do not wait for the final AI/document node to send acknowledgement.
5. Deploy the frontend. Remove any obsolete Windows scheduled worker task or host
   service separately; stale workers cannot claim more jobs after the migration.
6. Verify one authorized submission: R2 upload when applicable, HTTP 202 from
   forwarding, correct n8n target identity, real callback, PDF/DOCX download.

Roll out database, functions, and frontend together. A local frontend reload does
not deploy hosted functions. Do not infer production success from unit tests.

## Delivery status and recovery

`document_dispatches` is a private per-document duplicate guard, not a work queue.
It stores identity, state, and a token, not a payload for later polling. The target
row is locked atomically while authorizing a dispatch, so repeated calls cannot
start the same document twice. Only the server can finish a dispatch. A callback
that has stored a PDF/DOCX wins over a late HTTP error or timeout.

- `dispatching`: delivery has started; concurrent repeat requests are rejected.
- `accepted`: n8n acknowledged it; the document remains pending until callback.
- `completed`: a callback has supplied an artifact path.
- `unknown`: the network/5xx outcome is ambiguous; keep pending and inspect n8n.
- `rejected` / `failed`: explicit delivery refusal or failed processing.

There are no automatic retries, including after a crash between the atomic guard
and the outbound request. Inspect the target ID in n8n and the document artifacts
first. Do not delete a guard or create a replacement evaluation to blindly retry.
An operator may remove a guard only after establishing that no execution is
active and no delivery or document was completed, then resubmit the same target
through authenticated forwarding. There is intentionally no public retry endpoint.

Legacy queued targets are rejected by direct dispatch until their prior delivery
history is reviewed. This rollout does not migrate, delete, or replay them.

## Operational limits

R2 download URLs are signed before the browser upload starts. Keep the GET URL
TTL long enough for the upload and workflow (the default is 24 hours). Unlike the
retired worker, the direct Edge Function does not regenerate a GET signature.
A deliberately shorter TTL requires a separate server-side refresh capability.

Supabase may expose a generic non-2xx transport error in the submission UI. Check
the saved evaluation preview and `document_error`, or inspect the aggregate's
record/execution, for the recorded delivery outcome before any retry.
