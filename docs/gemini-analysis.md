# Gemini for Analyze Video

User selected Gemini on 2026-10-23. Only video analysis changes providers. Existing R2 upload, ffmpeg extraction, manual scores, aggregation, direct n8n forwarding, report-generation nodes and callbacks are preserved. The existing OpenAI and Qwen adapters remain available via explicit video-provider settings; no fallback or automatic retry occurs.

## Setup

Use the desired Google account at [Google AI Studio API keys](https://aistudio.google.com/apikey). It need not match the account used for this app or n8n. The key's Google project owns model permissions, quota and any charges. Do not assume an existing Gemini chat subscription or n8n credential establishes API quota. Check Free Tier availability for the selected model before enabling paid billing.

Set only server-side values:

```dotenv
VIDEO_ANALYSIS_PROVIDER=gemini
GEMINI_API_KEY=<key from the intended account/project>
GEMINI_MODEL=gemini-3.8-flash
```

No VITE-prefixed key. Keep it in ignored `.env` locally and secrets/environment on the deployed analysis backend. Existing n8n credentials are neither copied nor changed. Choose another compatible model explicitly through GEMINI_MODEL if this one is unavailable; do not cycle providers/models automatically after errors.

`node scripts/check-gemini.mjs` checks local config without calling Google. `node scripts/check-gemini.mjs --generate` explicitly sends a synthetic text request, subject to quota/charges. It creates no evaluation. A cache hit is not fresh evidence of provider availability. Media acceptance still requires an actual image/audio check.

The adapter sends sampled JPEGs and extracted MP3 together in one generateContent request, using a JSON Schema and authoritative system instruction. It validates finish reason, all six categories, integer ratings 1–5 or null, and nonempty explanations before caching. Thought text is excluded. Missing audio requires null audio and script_narration ratings; missing images require null camera_angles and graphics ratings. With no media all ratings must be null. Invalid results are rejected, never repaired with invented scores. Usage under `usage.vision` is the single combined request's total usage; `usage.audio` is null to avoid double counting.

The HTTP success envelope remains unchanged, with the structured result at `analysis.evaluation`. Categories are script_narration, camera_angles, audio, content_sequencing, graphics (rating/comment), and overall_impression (rating/summary). Human rubric scores remain separate. The default core prompt and OpenAI/Qwen adapters stay unchanged; the Gemini system instruction and schema enforce this provider's output format even for a supplied legacy prompt.

Errors keep the existing `{code,error}` response shape: `ai_auth_failed` maps provider 401/403 to backend 502, `ai_billing_required` and `ai_quota_exceeded` map 402/429 to backend 503, `ai_timeout` uses 504, `ai_delivery_unknown` uses 503, and `invalid_ai_response` uses 502. Timeout/network/5xx/broken-body outcomes retain the duplicate guard. Do not enable n8n retries based solely on these status codes.

## Hotfix verification, 2026-10-23

The latest screenshot identifies VIA-v4 (`via-v4-512506`), showing Tier 1 / Prepay. It does not establish that the local key belongs to the separate VIDA project mentioned in the task, nor prove a usable prepaid balance or free quota. A single deliberate synthetic recheck after that screenshot again returned HTTP 402; no media was sent and billing was not changed. Do not keep retrying inference until the owner verifies the intended project's billing and quota.

Current model: gemini-3.8-flash, supporting image/video/audio input and structured output. Standard pricing checked 2026-10-23: $0.75 per million input tokens and $3.75 per million output tokens including thinking, through 2026-12-31. Free Tier is listed for the model, subject to actual project eligibility and active limits. Costs may include Cloud Run CPU/RAM and network, build/image storage and secret access in addition to Gemini. No assumption of a free deployment is made.

Run `node --test tests/geminiAnalysis.test.js tests/geminiEndpoint.test.js tests/n8nVideoCaseContract.test.js` and then `npm test`, `npm run lint`, `npm run build`. The endpoint test uses actual generated MP4/JPEG/MP3 with external inference mocked. It checks both audio and silent clips, service authentication and billing errors. The n8n contract test executes repository Code node scripts; it does not establish that a live published workflow has identical code or that its report-generation model produces the intended report. A fresh read-only workflow export is still needed for live parity.

The server app is importable for local endpoint verification; direct execution through the existing Docker command still starts its listener. No production n8n change, deployment or real video inference was performed for this hotfix.

## Deployment state

The frontend currently uses a remote backend. Local `.env` changes do not switch that remote backend. Deploy server files and configure the selected provider/key on the revision used by n8n Analyze Video before retrying a real evaluation. Preserve existing R2 and analysis-token settings. No production traffic switch, payment activation or retry of evaluation #261 is performed by this code change. Existing case aggregation still uses OpenAI, per the user's limited scope.

Transport errors, broken HTTP success bodies and upstream 5xx outcomes retain duplicate guards for inspection. Explicit quota/auth failures are sanitized. There are no automatic retries or provider fallbacks.

References: [generateContent API](https://ai.google.dev/api/generate-content), [audio](https://ai.google.dev/gemini-api/docs/audio), [pricing](https://ai.google.dev/gemini-api/docs/pricing).
