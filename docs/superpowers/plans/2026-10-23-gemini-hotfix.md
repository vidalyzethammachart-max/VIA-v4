# Gemini video hotfix implementation plan

User approved the six-step draft in chat after checkpoint commit 8b60b93. Execute inline; preserve existing workspace/local app. Implementation and local tests authorized; deployment and production routing require separate approval.

Goal: enforce six evaluation categories and 1–5 integer or null ratings in Gemini video output while preserving existing endpoint envelope, ffmpeg extraction and downstream architecture.

Files: new server/videoEvaluation.js defines schema/instructions/validator; server/geminiAnalysis.js adds authoritative output contract, validates before cache and classifies errors; scripts/check-gemini.mjs generates an all-unavailable schema-compliant synthetic result; tests/geminiAnalysis.test.js and tests/n8nVideoCaseContract.test.js pin media and downstream contracts; new endpoint fixture test exercises real generated video with mocked inference. Update docs/gemini-analysis.md.

Constraints: no credentials in logs/git; no scores for unavailable audio/images; failed extraction stays explicit; no provider fallback/retry; unknown delivery retains guard; unchanged OpenAI/Qwen aggregate behavior; no billing activation or production workflow changes. No unapproved commit/push of this new hotfix.

- [ ] Verify local config/read-only model access; confirm intended key project separately. Prior 402 not resolved merely by code.
- [ ] RED tests: reject missing categories, wrong rating types/ranges, empty explanations, invented audio/visual scores and schema overrides; preserve valid 1/5/null results and existing metadata.
- [ ] GREEN implementation: schema with required categories and null evidence rules, validate before cache, distinguish auth/billing/quota/timeout with safe codes and existing {code,error} envelope.
- [ ] Real generated video endpoint test, no-audio fixture, n8n transform/context/document compatibility; full tests/lint/build.
- [ ] Independent code review; report remaining live-provider/deployment dependencies without claiming real completion.

Review focus: custom prompt overrides; missing audio with hallucinated scores; legacy cache results; malformed candidate shapes; exact error mapping without secret leakage.

## Execution ledger

- Config-only check passed: configured Gemini key, model gemini-3.8-flash. Intended VIDA key ownership/quota remains unverified; user screenshot shows VIA-v4 project Tier 1 / Prepay. One approved synthetic recheck after the screenshot again returned HTTP 402. No video was sent to Google and no billing changed.
- RED: five new focused tests failed against checkpoint code (unvalidated schema/evidence, no structured schema, generic errors). GREEN: all 11 focused adapter tests passed after adding schema/evidence validation and safe error classification.
- Endpoint verification uses actual generated sound/silent MP4s and ffmpeg extraction with provider inference mocked. Preserved request/auth/success envelope, 6 frames, audio metadata and billing error response. Initial import exposed unconditional listener bootstrap; separated app export/direct execution guard, endpoint test now passes. Tests did not change the production entrypoint command.
- n8n repository Code nodes retain evaluation/null ratings, model identity and human rubric data; final document body still accepts the evaluation identity. Live workflow parity/report-generation prompt not verified without a fresh export.
- Full suite 154/154 passed; lint/typecheck/build passed (existing large chunk warning); git diff --check passed.
- Independent reviewer /root/review_gemini_hotfix: no critical/important findings. Minor deferred: timeout during response.json() is classified ai_delivery_unknown/503 rather than ai_timeout/504; replay protection remains intact.
- Ruling: keep default core/OpenAI/Qwen prompt unchanged; Gemini systemInstruction + responseJsonSchema enforce the new provider's contract without modifying aggregate behavior. Cost if wrong: a model may reject an unavailable schema feature; live schema acceptance must be checked after billing is ready.
- No new commit/push, deployment, production workflow update or evaluation replay. Live acceptance remains pending a usable intended-project key/quota and later deployment approval.
