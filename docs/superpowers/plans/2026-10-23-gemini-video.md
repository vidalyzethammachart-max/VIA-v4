# Gemini video-only provider plan

User approved Gemini on 2026-10-23 after clarifying only the failed Analyze Video step should change.

Keep the existing R2 download, ffmpeg JPEG/MP3 extraction, output contract, authentication, aggregation and n8n report nodes. Add a server-only Gemini adapter sending the real sampled media in one generateContent request, requesting JSON and rejecting blocked/incomplete/invalid results. Reuse scoped cache and hold ambiguous delivery locks; never retry or fallback automatically.

- [x] TDD: prove missing key fails before download, real image/audio payload maps correctly, validated results cache by credential/model, safety/truncation and malformed output fail, unknown delivery does not replay, aggregate provider stays unchanged.
- [x] Implement server/geminiAnalysis.js and wire only videoAnalysisProvider.js; add config-only/synthetic opt-in checker.
- [x] Configure Gemini selection and empty key placeholder without overwriting user keys. Document deployment blocker: key absent locally, remote backend still old revision.
- [x] Run full suite, lint/build and independent scoped review. Do not claim deployment or live video acceptance without key/configuration.

No changes to payments, model provider accounts, n8n credentials or prior saved evaluations. Preserve unrelated workspace changes.

## Verification and remaining external dependency

- RED: all six Gemini tests failed because video provider selector rejected Gemini; GREEN after implementation, six focused tests passed.
- Full suite: 147/147 passed. lint, typecheck and production build passed; build retained the existing large chunk warning. Diff whitespace check passed.
- Independent scoped review `/root/review_gemini_video`: no blocking findings; focused suite independently 6/6. Existing Qwen/OpenAI internals and direct-dispatch work remain outside this migration.
- `.env` now selects Gemini for video only and contains GEMINI_API_KEY (empty) and GEMINI_MODEL. Existing credentials and frontend URLs preserved. Config check correctly reports missing GEMINI_API_KEY.
- No deployment, real Gemini request or evaluation replay occurred. Need user's intended Google project key and live model/quota validation, then backend deployment before real video test. The existing media extraction tests run real ffmpeg with external provider responses mocked; Gemini tests verify payload mapping with supplied fixture bytes, not live acoustic accuracy.
