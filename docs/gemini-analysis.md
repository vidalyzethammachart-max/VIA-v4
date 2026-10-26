# Gemini for Analyze Video

User selected Gemini on 2026-10-23. Only video analysis changes providers. Existing R2 upload, ffmpeg extraction, manual scores, aggregation, direct n8n forwarding, report-generation nodes and callbacks are preserved. The existing OpenAI and Qwen adapters remain available via explicit video-provider settings; no fallback or automatic retry occurs.

## Setup

Use the desired Google account at [Google AI Studio API keys](https://aistudio.google.com/apikey). It need not match the account used for this app or n8n. The key's Google project owns model permissions, quota and any charges. Do not assume an existing Gemini chat subscription or n8n credential establishes API quota. Check Free Tier availability for the selected model before enabling paid billing.

Set only server-side values:

```dotenv
VIDEO_ANALYSIS_PROVIDER=gemini
GEMINI_API_KEY=<key from the intended account/project>
GEMINI_MODEL=gemini-2.5-flash
```

No VITE-prefixed key. Keep it in ignored `.env` locally and secrets/environment on the deployed analysis backend. Existing n8n credentials are neither copied nor changed. Choose another compatible model explicitly through GEMINI_MODEL if this one is unavailable; do not cycle providers/models automatically after errors.

`node scripts/check-gemini.mjs` checks local config without calling Google. `node scripts/check-gemini.mjs --generate` explicitly sends a synthetic text request, subject to quota/charges. It creates no evaluation. A cache hit is not fresh evidence of provider availability. Media acceptance still requires an actual image/audio check.

The adapter sends sampled JPEGs and extracted MP3 together in one generateContent request, using a JSON Schema and authoritative system instruction. It validates finish reason, all six categories, integer ratings 1–5 or null, and nonempty explanations before caching. Thought text is excluded. Missing audio requires null audio and script_narration ratings; missing images require null camera_angles and graphics ratings. With no media all ratings must be null. Invalid results are rejected, never repaired with invented scores. Usage under `usage.vision` is the single combined request's total usage; `usage.audio` is null to avoid double counting.

The HTTP success envelope remains unchanged, with the structured result at `analysis.evaluation`. Categories are script_narration, camera_angles, audio, content_sequencing, graphics (rating/comment), and overall_impression (rating/summary). Human rubric scores remain separate. The default core prompt and OpenAI/Qwen adapters stay unchanged; the Gemini system instruction and schema enforce this provider's output format even for a supplied legacy prompt.

Errors keep the existing `{code,error}` response shape: `ai_auth_failed` maps provider 401/403 to backend 502, `ai_billing_required` and `ai_quota_exceeded` map 402/429 to backend 503, `ai_timeout` uses 504, `ai_delivery_unknown` uses 503, and `invalid_ai_response` uses 502. Timeout/network/5xx/broken-body outcomes retain the duplicate guard. Do not enable n8n retries based solely on these status codes.

## Hotfix verification, 2026-10-23

The latest screenshot identifies VIA-v4 (`via-v4-512506`), showing Tier 1 / Prepay. It does not establish that the local key belongs to the separate VIDA project mentioned in the task, nor prove a usable prepaid balance or free quota. A single deliberate synthetic recheck after that screenshot again returned HTTP 402; no media was sent and billing was not changed. Do not keep retrying inference until the owner verifies the intended project's billing and quota.

Historical model checked on 2026-10-23: gemini-3.8-flash. That earlier project's HTTP 402 result does not describe the separate Free Tier project verified below. Costs may include Cloud Run CPU/RAM and network, build/image storage and secret access in addition to Gemini. No assumption of a free deployment is made.

Run `node --test tests/geminiAnalysis.test.js tests/geminiEndpoint.test.js tests/n8nVideoCaseContract.test.js` and then `npm test`, `npm run lint`, `npm run build`. The endpoint test uses actual generated MP4/JPEG/MP3 with external inference mocked. It checks both audio and silent clips, service authentication and billing errors. The n8n contract test executes repository Code node scripts; it does not establish that a live published workflow has identical code or that its report-generation model produces the intended report. A fresh read-only workflow export is still needed for live parity.

The server app is importable for local endpoint verification; direct execution through the existing Docker command still starts its listener. No production n8n change, deployment or real video inference was performed for this hotfix.

## Deployment state

**Update 2026-10-25:** The user selected a zero-additional-hosting-cost local
backend through ngrok Free. The parent workflow now uses a directly connected
HTTP Analyze Video node. Its request mapping was corrected to read
`video.downloadUrl` and `video.fileName` from the normalized parent payload,
then saved and exported for verification.
See [local runtime and acceptance](local-gemini-analysis.md).
The Cloud Run revision described below was not migrated or rebuilt.

The frontend currently uses a remote backend. Local `.env` changes do not switch that remote backend. Deploy server files and configure the selected provider/key on the revision used by n8n Analyze Video before retrying a real evaluation. Preserve existing R2 and analysis-token settings. No production traffic switch, payment activation or retry of evaluation #261 is performed by this code change. Existing case aggregation still uses OpenAI, per the user's limited scope.

Transport errors, broken HTTP success bodies and upstream 5xx outcomes retain duplicate guards for inspection. Explicit quota/auth failures are sanitized. There are no automatic retries or provider fallbacks.

## Free Tier migration — 2026-10-24

The user approved the video-only Free Tier design. The adapter now defaults to
`gemini-2.5-flash`; an explicit `GEMINI_MODEL` still overrides it. Configure both
`VIDEO_ANALYSIS_PROVIDER=gemini` and `GEMINI_MODEL=gemini-2.5-flash` explicitly on
the deployment. A model ID alone cannot enforce a free billing tier.

Read-only API Keys lookup linked the existing local Gemini key to project
`gen-lang-client-0749209595`. Cloud Billing returned `billingEnabled=false`.
Service Usage reported these free-tier effective limits for the selected model:
5 requests/minute, 20 requests/day and 250000 input tokens/minute. Model metadata
read returned HTTP 200. These are configuration limits, not remaining quota.
No project, key, billing account, permission or quota was created or changed.

One fresh local multimodal check then succeeded using only generated blue frames
and a synthetic tone: provider/model Gemini / gemini-2.5-flash, 6 frames,
72940 MP3 bytes, valid `analysis.evaluation`, and both cache-hit flags false.
Usage included TEXT, IMAGE and AUDIO input. This establishes actual provider
access with synthetic media; it does not establish real evaluation/report quality
or Cloud Run deployment acceptance. The input contained no evaluation or user media.

Local checks: 162/162 tests; 26/26 targeted Gemini/media/n8n tests; 12/12 contract
tests against the workflow export read back after the Webhook fix. Endpoint tests
cover 402/429/401/403 with one rejected provider call and no success analysis.

Hosting review found an already-built image of current HEAD
`d5dcca142ce97b825aaa1b2da1c2b957fd80e59b`, digest
`sha256:4d3adc647df6b7ec091a2bd61507cece22e11388881af976ab3f0a536333f79f`.
It includes the Gemini adapter; explicit model configuration makes rebuilding
just to change the default unnecessary. Revision 00027 is retired, not currently
serving the n8n tag, and has no Gemini key/provider configured. The n8n
`openai-check` tag still targets revision 00024.

Artifact Registry currently stores about 1995MB. Adding images is not established
to be free. Project Cloud Run monitoring for October 1–24 showed approximately
800 vCPU-seconds, 1165 GiB-seconds and 87 requests, but this does not establish the
remaining free allowance shared across its billing account, or free internet
egress in Singapore. No build, new cloud revision, tag/traffic change or real
submission was made by this migration session. The next production action remains
gated by the user's no-additional-spend constraint.

An alternative minimal source context is prepared under ignored
`logs/gemini-free-deploy-20261024/` from the deployed revision 00024 source. It
changes only the video-provider core and adds its required provider modules;
upload/callback/aggregate handlers and OpenAI implementation stay byte-identical
to that baseline. It contains no environment files, credentials, logs or media.
Do not run a new build just because the context exists.

References: [generateContent API](https://ai.google.dev/api/generate-content), [audio](https://ai.google.dev/gemini-api/docs/audio), [pricing](https://ai.google.dev/gemini-api/docs/pricing).
