# OpenAI backend migration — 2026-10-17

This is the earlier migration checkpoint. See [the follow-up audit](openai-migration-audit-2026-10-17.md) for later local cache, access-control, media-limit, and n8n contract changes. Earlier test counts and activation instructions below are historical evidence, not the final configuration.

## Implemented locally

- Both video analysis and case aggregation backend paths now use a shared OpenAI adapter.
- Default vision/text model: `gpt-4.1-mini`; acoustic analysis: `gpt-audio-mini`. Override with server-only `OPENAI_MODEL` and `OPENAI_AUDIO_MODEL`.
- MP3 evidence is evaluated through Chat Completions; audio evidence and sampled JPEGs feed Responses with JSON output. Existing endpoint result fields, individual source data, and computed aggregate averages are retained.
- Missing credentials fail before downloading a video. Provider/network/incomplete/refused/invalid output fails explicitly; provider bodies and signed media URLs are not sent to logs by the adapter. No automatic Gemini fallback.
- Added synthetic connectivity scripts and configuration instructions. No production settings, n8n nodes, database records, payment settings, or deployments changed.

## Verification

- `npm.cmd test`: PASS, 95 tests, including a generated-video test with actual ffmpeg extraction and mocked OpenAI responses.
- `npm.cmd run lint`: PASS.
- `npm.cmd run build`: PASS including typecheck; existing bundle-size warning remains.
- `git diff --check`: PASS.
- Local upload API started, root GET returns HTTP 200.
- Live OpenAI model-access check: HTTP 200 for `gpt-4.1-mini`.
- Live synthetic Responses inference: BLOCKED by HTTP 429. Follow-up diagnosis confirmed `error.code=credit_balance_exhausted`, `error.type=insufficient_quota`; the API key's account has exhausted its API credit. This is not a transient request-rate diagnosis. The original adapter hid this code because its safe-code list did not yet include it; it now reports the credit failure explicitly. Model-access success alone does not establish inference availability.
- Live media inference and full website → n8n → callback → PDF/DOCX: NOT VERIFIED. Avoid replaying production queue jobs while inference remains unavailable.

## Remaining activation work

1. The API account owner must restore API credit in OpenAI Platform Billing. The billing page currently requires login, so the key's owning email/organization has not been confirmed. Do not assume a ChatGPT subscription includes API credit. No payment was made or payment settings changed.
2. Run `node scripts/check-openai.mjs --generate`, then `node scripts/check-openai-video.mjs`. The second command sends only generated media and is billable. Neither creates database records.
3. Restore existing Cloud Run hosting or provide a reachable replacement host. On 2026-10-15 Cloud Run logs and billing UI showed disabled billing and a past-due/invalid-payment notice; this account state has not been rechecked in this migration turn. Changing AI provider does not bypass that hosting failure.
4. Deploy backend with server-only OpenAI secrets. n8n's configured analysis URL must point to the deployed version. Existing Gemini document-generation nodes in the active workflow have not been migrated by this backend change; review their contracts and credentials separately before claiming the entire workflow uses OpenAI.
5. Inspect failed/ambiguous queue executions before retrying an authorized V4 test job. Verify execution IDs, callback, and actual artifacts. No production E2E success is claimed.

The broader hosted queue and 20-minute duration controls described in the cloud design spec remain separate, unimplemented work.
