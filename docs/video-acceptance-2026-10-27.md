# Video acceptance test - 2026-10-27

## Scope and preparation

The user authorized continuing fixes and submitting one evaluation with video.
Keep the existing no-additional-spend constraint: no billing activation, Cloud
Run build/deployment/traffic change, or paid-provider fallback.

- Main workflow: VIA-v4, `nl38M3CrQPQXpg0G`, active and saved.
- Fresh pre-test export: version `1002f34b-980c-4cb5-ac02-d73147ca9ee2`.
- Video branch: Has Video?1 true -> Analyze Video -> Merge input 2.
- Request uses `video.downloadUrl` and `video.fileName`; JSON parses correctly.
- Endpoint: `https://fossil-context-crown.ngrok-free.dev/api/analyze-video`.
- HTTP Header Auth retained; retries disabled; webhook responds on receipt.
- Live execution list showed no active executions. Latest was execution 3076,
  a terminal error from October 26; it was not retried. The execution detail
  canvas remained loading, so its failing node was not established.
- The saved local n8n public API credential returned 401 on a read-only request;
  authenticated browser access works. This is separate from backend token auth.
- My Forms had 19 records and no matching `TestWithVideo-Retest` entry.
- Read-only Cloud Billing lookup again returned `False` for billingEnabled on
  `gen-lang-client-0749209595`.

## Local runtime

Restarted the existing restricted Gemini listener on 127.0.0.1:8081 and ngrok
Free with the existing route policy and inspection disabled. Public and local
probes returned 401 without a token, and 422 invalid_video with a valid token
and disallowed synthetic URL. These probes did not invoke AI.

For this acceptance session, Vite runs on 127.0.0.1:5173 with the process-only
`VITE_UPLOAD_VIDEO_API_URL=http://127.0.0.1:8082/api/upload-video` override. An
ignored temporary helper delegates only POST/OPTIONS `/api/r2-presign-upload`
to the existing handler on loopback port 8082, accepting only origin
`http://localhost:5173`. Signing URLs is local; uploads still go directly to R2.
The helper is not exposed through ngrok. No tracked frontend setting changed.

Prepared a generated MP4: moving 320x240 test pattern plus synthetic sine tone,
12 seconds, 241673 bytes. No user video or personal data is included in it.
The fixture is for pipeline acceptance, not evaluation-quality validation.

## Submission and result

The user enabled Allow access to file URLs in the ChatGPT Chrome extension.
The browser security policy had rejected opening chrome://extensions through
automation; the user made the setting change manually.

Clicked Send once for order `003`, title `TestWithVideo-Retest`, with all 45
scores set to 3, an explicit synthetic-test note, and the generated MP4 attached.
R2 upload and direct dispatch created evaluation **291** and execution **3077**
at 20:03:42 Bangkok on October 27.

3077 terminated in 1.778 seconds with HTTP 502 and code `EACCES`. The analysis
process had been launched inside the agent's network-restricted environment:
it could receive n8n requests but could not fetch R2. This was a local process
network problem, not another OpenAI-credit or Gemini-authentication failure.

After confirming 3077 was terminal and evaluation 291 had no ready artifacts,
restarted only the verified analysis process with approved network access.
The same R2 object downloaded successfully (HTTP 200, 241673 bytes). Retried
3077 once from its failed node using its original workflow, without another form
submission, database guard reset, or replacement evaluation.

Execution **3078** started at 20:07:20 and **succeeded in 1m 1.812s**. The real
callback made both evaluation 291 download links available. Downloaded files:

- PDF: 438958 bytes, valid PDF header and end marker.
- DOCX: 404780 bytes, valid document XML, 327 paragraphs, one table, expected
  evaluation title, and no unresolved double-brace template placeholders.

Gemini 2.5 Flash returned the six required evaluation categories. Usage included
TEXT, IMAGE and AUDIO inputs, with 2799 prompt and 4007 total tokens. Human
scores remained separate, with overall average 3.00. This synthetic-media test
validates transport and execution, not real teaching-video assessment quality.

## Additional report-evidence defect

Review of the generated report exposed a second issue. Calculate Evaluation
Stats adds an empty `videoAnalysis` object, while the real provider result is
in `videoEvaluation`. The context node's truthy `||` chain chose the empty
object and hid the video evidence from the final report prompt.

Changed only Assemble Final Evaluation Context to prefer canonical evidence
and skip empty alias objects. Saved workflow version:
`574cc7af-99d4-49ba-972f-546d30c059ef`. Export comparison confirmed only that
node's jsCode and versionId changed. Credentials, routing and pinData stayed
unchanged in the saved workflow.

Two regression tests failed before the fix and passed after it. Replayed the
actual exported Transform and Calculate Code nodes locally: the old context
dropped the cached Gemini result, while the corrected context retained it and
kept human average 3.00. A manual execution of the corrected context against
evaluation 291's imported run data also returned all six evidence categories.
The final report node then generated text that reflected the supplied video
limitations, and its parse step was exercised. The initial PDF/DOCX downloads
were archived; those initial artifacts predate this context correction.

On October 28 the user authorized pushing, merging into main and testing on
the production site. That production acceptance result must be recorded
separately; the initial 3078 success alone does not validate the corrected
report all the way through a fresh document generation.

## Verification

Before submission, 14/14 targeted tests passed. After the context fix, all
166 tests and lint passed. All 14 Code-node contract tests also passed against
the newly saved workflow export. These include both new empty-alias cases.

All raw exports, local helper files, fixture and runtime logs remain under
ignored `logs/`; do not publish secrets or signed storage URLs.
