# Cloud Run activation checkpoint — 2026-10-18

## Verified

- Google Cloud CLI is authenticated as the VIA project owner and can read/deploy the existing service in `via-v4`, `asia-southeast1`.
- The existing production revision was `via-v4-upload-api-00022-ftj`, built from commit `71bcc435ae2182de2ab0581b2f9c541e3bdb0bc3`; it still used Gemini.
- The 11:28:39 Cloud Run request log attributed HTTP 429 to no available instance, before application inference.
- Deployed OpenAI backend revision `via-v4-upload-api-00024-wul` from commit `8788668` plus a health-route correction. It serves **0% production traffic**, tagged `openai-check`.
- Test revision URL: https://openai-check---via-v4-upload-api-vvfjwpmlia-as.a.run.app
- Added `/` and `/health` aliases for the existing health handler after `/healthz` and `/health` initially returned HTTP 404 in the deployed smoke check.
- Final live smoke checks: `/health` HTTP 200 with `ok: true`; unauthenticated analysis HTTP 401; authenticated untrusted-source analysis HTTP 422. These checks did not invoke an AI model or upload video.
- `npm.cmd test`: 110 passed, zero failures after the route correction.
- The default Cloud Run traffic allocation has not been switched. n8n has now been updated to call the tested `openai-check` tagged URL directly; real executions through this workflow therefore use the new backend even while the default URL remains on the old revision.

## n8n connection completed

- The user replaced `N8N_API_KEY` in `.env.local`; a fresh workflow read returned HTTP 200.
- Backed up the live workflow locally before updating it. No running execution was reported at the time of the update.
- Created a Header Auth credential for the analysis token and assigned it to the existing workflow's team project. The secret is held in n8n credentials, not workflow parameters or source files.
- Updated only `Analyze Video`, `Transform VIA Payload`, and `Assemble Final Evaluation Context`. The other 14 nodes, all connections, existing settings, and active state were verified unchanged.
- The active/published workflow version is `9f762e25-44ff-452e-9148-c0b7415708d4`; `Analyze Video` uses the tagged OpenAI backend URL, matching Header Auth, timeout 600 seconds, and no automatic retry.
- The n8n 1.123 public API rejected UI-only `timeSavedMode` in the first update attempt. Omitting this unsupported request field retained the existing `fixed` setting on readback. No workflow changes occurred on the rejected request.
- A proposed switch of the default Cloud Run URL to 100% revision `via-v4-upload-api-00024-wul` was rejected by automatic approval review because it changes production routing and can affect availability or paid inference. No traffic-switch command was executed. Obtain specific user approval before retrying that action; do not work around the rejection.

## Remaining work

1. If authorized explicitly, route the default Cloud Run URL to the tested revision, verify the default URL with non-inference checks, and then update the n8n URL to the canonical service URL. The tagged URL currently works and has been configured in n8n.
2. Review direct aggregate callers separately; never expose the service token in frontend code.
4. OpenAI inference credit is **not verified** in this deployment. Prior inference checks failed due to exhausted API credit. Restoring Google Cloud billing does not establish OpenAI credit.
5. An actual paid video inference and the website → n8n → callback → document flow remain unverified. Inspect existing failed jobs and signed URL expiry before replaying one authorized test.

Deployment configuration backups, source context, workflow backups, and secret-bearing environment files are stored under ignored `logs/`. Never add those files to Git. The agent did not change `.env` or `.env.local`; the user updated the n8n API key. The disk cache is ephemeral and does not guarantee reuse across Cloud Run instances. No paid inference or production execution replay was performed.
