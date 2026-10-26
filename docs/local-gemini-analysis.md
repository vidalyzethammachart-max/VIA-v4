# Local Gemini analysis through ngrok Free

## Current state — 2026-10-25

The user confirmed that no additional hosting spend is allowed, then explicitly
approved a loopback backend through ngrok Free, including its data/header transit
and the need to keep this computer running. No Cloud Run build, deployment,
traffic update or inference test was performed.

The user subsequently replaced the parent workflow's disconnected
`Call Analyze Video` node with a directly connected HTTP `Analyze Video` node.
The saved parent `nl38M3CrQPQXpg0G` now calls:

`https://fossil-context-crown.ngrok-free.dev/api/analyze-video`

The video branch is `Has Video?1 (true) -> Analyze Video -> Merge (input 2)`;
the false branch still uses `Set Video Analysis Empty`. The normalized payload
also enters Merge input 1, preserving evaluation identifiers and human scores.

After the user's connection fix, the copied HTTP request still read the
sub-workflow's flattened `video_downloadUrl` and `video_fileName` fields. A
synthetic input through the exported Normalize Code node proved both values
rendered as the string `undefined`. Corrected only these expressions to
`$json.video.downloadUrl` and `$json.video.fileName`; the prompt and credential
were preserved. Saved parent export version:
`1002f34b-980c-4cb5-ac02-d73147ca9ee2`. Structural comparison with the user's
saved version found only `Analyze Video.parameters.jsonBody` and `versionId`
changed. The earlier sub-workflow URL remains configured, but the parent now
uses its own HTTP node rather than invoking that sub-workflow.

Before changing the endpoint, the live parent showed No active executions.
Its latest execution remained 3048; 3044 and 3048 were terminal errors.
No retry, evaluation submission, callback or database mutation occurred.

## Runtime

- `server/local-analysis.js` starts the existing analysis HTTP handler on
  `127.0.0.1:8081` only. It exposes only `POST /api/analyze-video`.
- It refuses startup unless Gemini, a service token, the selected
  `gemini-2.5-flash` model and safe media-source mode are configured.
- The token is the existing service token already referenced by n8n, stored
  only in the ignored local server environment. No n8n credential was changed.
- `n8n/local-analysis-tunnel-policy.json` denies every other method/path at
  ngrok's edge. It contains no credentials. The backend also rejects other routes.
- ngrok traffic inspection is disabled to avoid retaining request/response
  bodies and service headers in its local inspector. ngrok still transports the
  request, as authorized; this does not mean ngrok cannot process the traffic.
- There is no paid-provider fallback, automatic request retry, new queue,
  scheduled task or auto-start service. This PC and both processes must stay on.

## Start after reboot or process exit

The existing ignored `.env.local` is configured with the Gemini key, selected
provider/model, service token, port 8081, persistent local analysis cache, and
`VIDEO_ALLOW_LOCAL_TEST_URLS=false`. Do not put these secrets in Git or chat.

From the project directory, run the backend and tunnel in separate terminals:

```powershell
npm.cmd run start:analysis-local
```

```powershell
ngrok.exe http http://127.0.0.1:8081 --traffic-policy-file=n8n/local-analysis-tunnel-policy.json --inspect=false
```

The currently running copies were started with hidden windows. Process IDs are
stored in ignored `logs/local-analysis-server.pid` and
`logs/local-analysis-ngrok.pid`; logs use the same name prefix. Before stopping
any recorded PID, verify that it still belongs to the expected process, since
Windows can reuse PIDs. Do not start second copies over an active analysis.

The installed ngrok agent's own status confirmed account
`vidalyze.thammachart@gmail.com` on **Plan: Free**. Its HTTPS endpoint is the
account's assigned development domain. If the account/domain/config changes,
verify the new URL and update only the n8n HTTP node. Do not upgrade the plan or
add payment settings to bypass a limit. Check current free limits before relying
on it for production throughput.

## Verification

Fresh Google API readbacks on October 25 identified the same Gemini key project
`gen-lang-client-0749209595`, with `billingEnabled=false`. Effective free limits
for gemini-2.5-flash were 5 requests/minute, 20 requests/day and 250000 input
tokens/minute. These are configured limits, not a remaining-quota measurement.

One synthetic HTTP request through the real local Express analysis route passed:

- Unauthorized probe: HTTP 401.
- Authorized generated video: HTTP 200, status analyzed, provider gemini,
  model and audioModel gemini-2.5-flash, 6 frames, 72940 MP3 bytes.
- Valid `analysis.evaluation`; visionHit/audioHit both false.
- Provider usage included actual TEXT, IMAGE and AUDIO input.
- Only generated green frames and a synthetic tone were used, not user media.

This synthetic fixture used an isolated, short-lived loopback test process with
local-source testing enabled. That process closed after the check. The serving
tunnel backend rejects local test source URLs.

Public HTTPS tunnel checks, with no inference:

| Request | Result |
| --- | --- |
| GET /health | 403 (edge deny) |
| POST /api/upload-video | 403 (edge deny) |
| POST /api/analyze-video without token | 401 |
| Same route with token and disallowed example.invalid source | 422 |

The public validation check establishes reachability and service-token handling;
it is not a successful n8n execution or document-generation acceptance test.
No Cloud Run analysis call was needed for these checks.

Local test suite: 164 passed, 0 failed; lint passed. The earlier fresh workflow
Code node contract tests passed 12/12. Full runtime evidence and unredacted
workflow backups stay under ignored `logs/`; do not publish them.

After the parent mapping correction, 14/14 targeted tests passed: the 12 Code
node contracts ran against the newly saved parent export, plus two local
listener tests. Fresh local and public tunnel probes returned 401 without a
token and 422 (`invalid_video`) with a valid token and a disallowed synthetic
source URL. These probes did not call AI or create reports. The parent execution
list still showed no active executions and latest execution 3048 as a terminal
error before the correction. No old execution was retried.

## Remaining acceptance boundary

The n8n configuration now points at the local Gemini service. A complete real
workflow including PDF/DOCX has not been run in this migration session.
Before such a test, identify the intended evaluation, check its execution,
dispatch guard, existing artifacts and current signed R2 URL. Do not reset a
guard, replay an old job or create a replacement evaluation automatically.

Both downstream report nodes select `models/gemini-2.5-flash` and the existing
`Google Gemini(PaLM) Api account 2` credential. The user confirmed on October 25
that this credential belongs to `gen-lang-client-0749209595` with billing off.
This association is user-confirmed; no n8n secret was exported or changed.
The separate backend aggregation endpoints still use OpenAI and are not exposed
through this tunnel.

The previous local browser test URL `http://localhost:5173/form-submit` refused
connections during the follow-up check. No form was submitted or reconstructed.
Before a real acceptance submission, restore the intended test UI and inspect
the evaluation/dispatch state and upload configuration as described above.

Free Gemini's data-use terms must be considered before sending real media.
Keeping Analyze Video local avoids new Cloud Run analysis usage; it does not
remove existing storage, hosting or subscription costs elsewhere in VIA V4.

## Rollback

If needed, restore only the sub-workflow URL from ignored
`logs/n8n-local-before-20261025.local.json`. The previous endpoint was the
Cloud Run `openai-check` tag and still has its OpenAI credit limitation.
Restoring it is not a reason to retry a document or enable billing. Inspect
active work before stopping the local server/tunnel or changing endpoints.

## Security note

The old ignored tunnel policy contained a legacy Basic Auth test password; it
was inadvertently exposed in a diagnostic tool result. That password is not
used by the new tunnel, and the old Basic Auth policy was not loaded. Do not
reuse the legacy password if that older setup is revived. The new tracked
policy has no inline credentials.
