# VIA V4: multi-user video processing on Cloud

Status: proposed design for user review; implementation and production activation have not started.

## Intended outcome

Serve several website users without depending on this Windows PC. Expected traffic is 5–10 video uploads per day, each no longer than 20 minutes. Preserve the existing review forms, shared video cases, individual analyses, separate leader-triggered aggregate reports, and n8n report workflow. Optimize for low cost, without promising a zero bill.

## Current evidence

- The browser uploads directly to R2 using the upload backend's presigned URL.
- `FormSubmit.tsx` already enqueues the report through `forward-to-n8n` after upload and save.
- Supabase `claim_ai_request()` already serializes document requests globally, uses a 15-minute lease, and reconciles completed document artifacts. Ambiguous deliveries hold the lane in `attention` instead of being replayed.
- `server/requestQueueWorker.js` currently polls continuously. The documented Windows scheduled task cannot process jobs while the PC is off.
- `RequestQueuePanel.tsx` already displays jobs, worker health, and inspected retry controls.
- `analyzeVideoFromUrl()` extracts sample frames and audio. It currently does not enforce a 20-minute duration limit. Twenty minutes of source media does not imply twenty minutes of server processing, and sample frames are not a frame-by-frame review of the entire video.
- Cloud Run logs inspected on 2026-10-15 show that requests fail because billing is disabled for project `via-v4`. Production operation remains blocked until billing is active.
- The queue payload canonicalization migration exists locally. Its remote deployment must be verified before enabling the hosted worker.

## Chosen approach and alternatives

Use the existing API service for video analysis and a separate private Cloud Run service for queue dispatch. A single Cloud Scheduler job invokes the private dispatcher once per minute using OIDC. Keep n8n Cloud unchanged initially.

This reuses the current database queue and avoids keeping an idle polling container alive. A continuously running Cloud Run polling worker would require different CPU/billing settings and would conflict with the intended scale-to-zero setup. Keeping the Windows worker would be simpler but would not meet the PC-independent requirement. Replacing n8n is deferred because it increases the scope and risks existing document behavior.

The private worker is separate from the existing browser-facing upload API so that Google IAM can protect the entire dispatch service without breaking browser uploads or n8n's existing analysis calls.

## Request and queue lifecycle

1. The signed-in user selects MP4/M4V. The browser reads metadata and rejects unreadable, non-finite, non-positive, or greater-than-1,200-second duration before requesting an upload URL. Exactly 1,200 seconds is accepted. Keep the existing 1 GiB file-size ceiling; do not silently reduce it.
2. The browser uploads to R2 and persists/enqueues through the existing authorized flow. Do not analyze in the form request. Existing records and IDs remain unchanged.
3. Scheduler calls `POST /internal/queue/tick` on the private dispatcher. Its body cannot choose a user, target, callback, or arbitrary workflow URL. Google IAM rejects unauthenticated callers before the container runs.
4. The handler refreshes queue health, claims at most one database job, and awaits the existing n8n request while maintaining a heartbeat. When no job is eligible it returns immediately. Scheduler overlap, retries, and a temporarily overlapping local worker remain protected by the database claim and lease token, not just container concurrency.
5. A successful webhook acknowledgement is only `awaiting_callback`. A stored PDF/DOCX artifact is required for completion. Preserve the existing 90-second gap and the minimum 60-second cooldown.
6. Unknown network outcomes remain `attention`. Keep the current finite retry policy for known transient HTTP failures. Scheduler retries only wake the dispatcher; they never bypass database claiming or reset a running job.

Refactor the worker's reusable claim/execute/heartbeat operations into a side-effect-free module. The current command-line worker remains a thin polling entry point for local development; the hosted HTTP handler calls the same operations once. Do not import the existing endless loop into an HTTP server.

## Video duration and resource controls

Client metadata validation is an early usability check, not the authority. After downloading media, the analysis backend independently probes the actual container duration before frame extraction, audio extraction, or Gemini calls. Reject invalid metadata and clips over 20 minutes with a structured validation error. Keep temporary-file cleanup on every exit path.

Bound the downloaded bytes and the metadata probe's execution time so a missing Content-Length or malformed media cannot consume unlimited memory/time. Validate the actual downloaded bytes against the existing size limit. Support videos without an audio track as today.

Return a permanent validation status (HTTP 422) for invalid/overlong media; n8n must surface a terminal validation failure rather than retry the same invalid clip. Preserve existing retry handling for transient upstream errors. Capture this distinction in mocked integration tests before updating the workflow.

Start the analysis service with request-based billing, minimum instances 0, maximum instances 1, concurrency 1, 1 vCPU, and 2 GiB RAM as a trial configuration. Start the lightweight private dispatcher at minimum 0, maximum 1, concurrency 1, 1 vCPU, and 512 MiB RAM. These are proposed initial settings, not measured capacity guarantees or spending caps.

Use a 900-second Cloud Run request timeout and Scheduler attempt deadline; retain the worker's 600-second webhook timeout and 900-second database lease. The handler must not acknowledge early and continue dispatching in the background. A representative 20-minute clip must complete within this envelope before production acceptance; if not, revisit the workflow rather than silently extending overlapping leases.

## Security, configuration, and cost boundaries

- Use a dedicated Scheduler identity with invoker access only to the private worker. Keep the worker service private. IAM grants are an explicit deployment review item.
- Store Supabase service-role, R2, Gemini, and n8n configuration in server-side secrets. Do not bake `.env*` into images or copy credentials into scripts, logs, frontend variables, or design artifacts.
- Add an explicit container build exclusion file before producing deployment images. The current Dockerfile only copies server files; use the same principle for the worker.
- Verify upload issuance is restricted to authenticated users and prevent arbitrary remote video downloads through a publicly callable analysis route before public release. These are acceptance requirements; a public website with an unrestricted presign/analysis endpoint cannot provide meaningful cost control.
- Keep existing user/editor/admin roles, case-scoped leader authority, queue RLS, payload canonicalization, and authenticated callbacks.
- Daily volume is a forecast, not an approved hard quota. Do not invent a per-user daily allowance in this change. Obtain the intended allowance before implementing a new usage policy.
- Do not automatically delete videos or reports. A retention policy needs a separate explicit user decision. Document accumulating R2 storage in the cost report.
- Keep the current Gemini model initially and measure its usage; do not silently switch model quality or billing tier. n8n Cloud remains a separate possible subscription cost.
- Billing alerts are notifications, not a hard cap. Account-wide free allowances may be shared with other projects. Check Vercel plan eligibility for the site's use before choosing a free plan.

## Delivery sequence

1. After this spec is approved, write and review the implementation plan, then implement the local changes and tests: reusable worker, private HTTP adapter, media limits, frontend validation, deployment configuration, and operational documentation.
2. Run tests, lint, typecheck/build, and container checks available locally. Prepare a deployment diff with the exact service names, IAM grants, secret references, resource settings, Scheduler job, and frontend origin. Do not activate cloud resources during local preparation.
3. Ask the user to restore Billing through the normal Google Cloud billing flow. Do not accept financial agreements or modify payment details on their behalf.
4. Review and authorize the concrete production deployment. Verify the required database migrations and functions remotely before activating the dispatcher. Initially deploy Scheduler paused.
5. Run a controlled video request with an authorized test record. Verify the queue, n8n execution, callback, and actual PDF/DOCX. Record elapsed time, resource usage, Gemini usage, and storage growth.
6. Pause the local scheduled worker only when the lane is idle, enable Scheduler, and verify PC-independent delivery. Repeated wakeups must keep health truthful without claiming service availability based only on deployment status.

## Verification and acceptance

- Video limits: accept 20:00, reject 20:00 plus a measurable increment, reject unreadable metadata, enforce backend duration even when browser data is forged, enforce streaming byte limits, and clean temporary files after rejection.
- Queue: simultaneous ticks dispatch once; a late callback wins safely; an ambiguous delivery is not replayed; idle ticks do not call n8n; heartbeats stop on handler completion; the CLI and HTTP adapters share the same delivery logic.
- Access: private worker rejects unauthenticated invocation; users cannot claim jobs or read other users' payloads; no credentials appear in image context or frontend bundles.
- Regression: individual evaluations remain intact, aggregates use `aggregate_id`, and only the case leader/admin can trigger aggregation under existing rules.
- Live: two authorized submissions overlap but run serially; at least one representative long clip completes through n8n, callback, and a downloadable artifact. Use only approved V4 test records and do not delete user data.
- Report each flow as PASS, FAIL, or BLOCKED. Local tests, health responses, and deployment success do not establish production E2E acceptance.

## Rollback

Pause Scheduler first and allow any active n8n execution to finish. Preserve queue rows, artifacts, and lease state. Revert service traffic to the preceding known-good revision. Restart the Windows worker only after inspecting the lane and ambiguous deliveries; never automatically reset `attention` jobs or replay them to make the dashboard look healthy.

## Primary references checked 2026-10-15

- Cloud Scheduler to private Cloud Run using OIDC: https://docs.cloud.google.com/run/docs/triggering/using-scheduler
- Scheduler pricing and shared free allowance: https://cloud.google.com/scheduler/pricing
- Cloud Run pricing: https://cloud.google.com/run/pricing
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
