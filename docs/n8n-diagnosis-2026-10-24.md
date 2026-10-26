# VIA V4 live diagnosis — 2026-10-24 (Asia/Bangkok)

## Outcome

Video analysis remains blocked by OpenAI API credit exhaustion. This session did
not call inference, retry an execution, submit an evaluation, change billing,
switch providers, or change Cloud Run traffic. A separate webhook acknowledgement
configuration problem was fixed in the live workflow.

## Live evidence

- Read VIA-v4 `nl38M3CrQPQXpg0G` through its authenticated browser session. The
  configured public API key returned 401; browser access remained available.
- Execution 3044 is terminal Error (1m 53.667s). Later executions 3045, 3046 and
  3048 also failed. The executions view showed **No active executions**; 3048
  started on October 23 at 19:55:09 Bangkok and failed after 1m 20.732s.
  A separate 3047 success lasting 82ms is not evidence of successful video analysis.
- Cloud Run logs for revision `via-v4-upload-api-00024-wul` show upstream
  `credit_balance_exhausted` for the four failed requests, including the latest
  failure at 2026-10-23 19:56:30 Bangkok. Their backend HTTP status was 502.
- The OpenAI Platform Billing page for the currently open **vidalyze** organization
  showed API credit balance **$0.00**, with auto-reload OFF. No billing setting was
  changed. This browser observation alone does not prove organization ownership
  of a key; deployed-revision logs independently establish its credit rejection.
- Supabase readback: evaluation 261 is failed, with no PDF or DOCX paths. No row
  with exact subject `TestWithVideo-Retest` was returned by the scoped read.
  This does not constitute submission or acceptance of form 003.

## Actual hosting, provider and endpoints

The current main workflow calls sub-workflow `i232U2Of39xjA1oP` (Analyze Video).
Its input mapping converts `video.downloadUrl` / `video.fileName` into
`video_downloadUrl` / `video_fileName`; the sub-workflow's HTTP node consumes those
flattened fields. These are consistent mappings, not a reason to change the JSON.

The HTTP node calls:

`https://openai-check---via-v4-upload-api-vvfjwpmlia-as.a.run.app/api/analyze-video`

It uses Header Auth credential **VIA Cloud Run analysis 2026-10-18**, a 600000ms
timeout, Retry On Fail OFF, and On Error = Stop Workflow. The sub-workflow is
inactive as a standalone trigger; that does not prevent the parent's Execute
Sub-workflow node from invoking it.

Cloud Run project is **via-v4**, region **asia-southeast1**, project number
909814604199. The main service URL has 100% traffic to revision **00022-ftj**;
the **openai-check** tag targets revision **00024-wul**. Therefore checking only
the primary URL or the local `.env` would inspect the wrong runtime for n8n.

Revision 00024 was created 2026-10-18. Image digest:

`sha256:230a9a6e0d3a27e05a0a22d90edb63e7c5fd7ec678c9e3e339c97296c9b5dbc5`

Its revision-linked Cloud Storage source archive was downloaded read-only and
inspected. Docker starts `server/cloud-run-upload.js`, not root `upload-api.js`.
The deployed core calls the OpenAI adapter directly; it has no Gemini/Qwen
selector. The revision environment contains:

- `OPENAI_MODEL=gpt-4.1-mini`
- `OPENAI_AUDIO_MODEL=gpt-audio-mini`
- configured OpenAI key and analysis service token (values never printed)

The actual adapter source sends audio first to
`https://api.openai.com/v1/chat/completions`, then sampled images plus audio
evidence to `https://api.openai.com/v1/responses`. There is no custom provider
base URL. Local Gemini/Qwen additions are not deployed to this revision.

Checks against the tagged backend and the key read in memory from its revision:

| Check | HTTP result | Meaning |
| --- | --- | --- |
| GET /health | 200 | Hosting reachable |
| POST /api/analyze-video without service token | 401 | Service auth enforced |
| Same endpoint with token, disallowed example.invalid URL | 422 | Token accepted; source validation enforced before download/inference |
| GET OpenAI /v1/models/gpt-4.1-mini | 200 | Deployed key can read vision model metadata |
| GET OpenAI /v1/models/gpt-audio-mini | 200 | Deployed key can read audio model metadata |

Model metadata access does not prove usable inference credit. These checks
performed no real media download or AI generation.

## Changes applied

**Live n8n:** fresh export before the fix had Webhook `responseMode=lastNode`,
confirmed as **When Last Node Finishes** in the UI. This conflicts with the Edge
Function's 20-second acknowledgement deadline. Changed it to **Immediately** and
saved the active workflow. Reloaded it from the server and downloaded a second
export. The new version is `5e4a290c-401c-41d9-9dd9-a6424bb8c240`; the default
`onReceived` mode is omitted from exported parameters. UI readback confirms
Immediately. Structural comparison confirms this was the only node change;
connections, workflow settings and pinData are unchanged. No webhook test was
sent, so real acknowledgement latency remains unmeasured.

**Local backend only:** `server/openAiAnalysis.js` now attaches sanitized machine
codes to distinguish billing, quota, rate limiting, authentication, model access,
and other rejection errors. Billing/quota/rate errors use backend HTTP 503;
auth/model/other rejection errors use 502. The video route already forwards
`error.status` and `error.code`, retaining the `{code,error}` response shape.
Success JSON, provider selection, caching and retry behavior are unchanged.
The generic rejection behavior for upstream 5xx is outside this narrow change.
Do not enable retries merely because an HTTP error is 503.

Regression tests failed before the implementation, then passed after it.
`node --test tests/openAiAnalysis.test.js`: 17 passed. `npm test`: 160 passed,
0 failed. `npm run lint` and `git diff --check`: passed (Git only reported normal
Windows line-ending notices).

The backend error-classification patch is **not deployed**. Deploying the current
checkout wholesale would also introduce the existing provider-selector and other
changes absent from revision 00024; it should not be presented as a credit fix.
No Edge Function, callback, evaluation, or database migration was changed.

## Recovery boundary

The owner must resolve credit/billing for the intended OpenAI API organization,
or explicitly choose and provision another provider. This session did neither.
Retrying a billing error cannot restore access; see
[official OpenAI error guidance](https://developers.openai.com/api/docs/guides/error-codes).

After access is restored, perform one fresh synthetic inference using the exact
deployed configuration; a model-list response or cached result is insufficient.
Before any real delivery, recheck original executions, target artifacts and
dispatch guards. Preserve the existing target and stored human scores. Do not
reset guards or submit form 003 just to test whether billing works. Confirm the
intended test target and current R2 signed-URL validity before a deliberate run.
Only an actual callback and downloadable PDF/DOCX establish full acceptance.

Local evidence is in ignored `logs/`: deployed source archive, before/after
workflow exports, and test output. Full exports can contain sensitive values;
do not commit or publish them.
