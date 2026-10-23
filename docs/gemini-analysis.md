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

The adapter sends sampled JPEGs and extracted MP3 together in one generateContent request, requesting JSON. It validates finish reason and the returned object before caching. Thought text is excluded. Missing audio is stated explicitly. Usage under `usage.vision` is the single combined request's total usage; `usage.audio` is null to avoid double counting.

## Deployment state

The frontend currently uses a remote backend. Local `.env` changes do not switch that remote backend. Deploy server files and configure the selected provider/key on the revision used by n8n Analyze Video before retrying a real evaluation. Preserve existing R2 and analysis-token settings. No production traffic switch, payment activation or retry of evaluation #261 is performed by this code change. Existing case aggregation still uses OpenAI, per the user's limited scope.

Transport errors, broken HTTP success bodies and upstream 5xx outcomes retain duplicate guards for inspection. Explicit quota/auth failures are sanitized. There are no automatic retries or provider fallbacks.

References: [generateContent API](https://ai.google.dev/api/generate-content), [audio](https://ai.google.dev/gemini-api/docs/audio), [pricing](https://ai.google.dev/gemini-api/docs/pricing).
