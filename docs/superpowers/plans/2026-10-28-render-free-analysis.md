# Render Free analysis implementation plan

> Execute inline using executing-plans. User approved migration and tests on October 28.

**Goal:** Replace the laptop/ngrok analysis endpoint with a restricted Render Free service, preserving Gemini Free, auth, JSON contracts and document callbacks.

**Architecture:** A dedicated Express analysis app reuses the existing media/AI core, binds Render's PORT, exposes health plus authenticated analysis only, and rejects concurrent media work. Existing upload hosting and the local listener stay unchanged. Secrets are configured only on Render.

**Constraints:** Free plan only; no billing/payment additions; no provider fallback or automatic analysis retries; never replay an uncertain/active execution. Readiness GET may be retried safely. Do not switch the live workflow before hosted probes pass. Keep raw media transient; ephemeral cache is not a durable replay guard.

## Task 1: Hosted listener and deployment

Files: `server/hosted-analysis.js`, `tests/hostedAnalysis.test.js`, `Dockerfile.analysis`, `.dockerignore`, `render.yaml`, `package.json`.

- [ ] RED: real HTTP tests enforce auth, restricted routes, invalid-source response, single active operation, health while busy, release on completion/failure and startup config validation.
- [ ] GREEN: implement `createHostedAnalysisApp({analyze})` and `startHostedAnalysisServer({port,host})`; use the existing `analyzeVideoFromUrl` by default. Port defaults to Render PORT, host to 0.0.0.0. Busy returns 503 `analysis_busy`, no hidden queue or retry.
- [ ] Configure Docker/Free plan and server-only variables. Do not copy local env/logs into image. Require explicit allowed video hosts and Gemini 2.5 Flash config.
- [ ] Verify targeted tests, full test suite, lint and build. Measure ffmpeg on real media before changing thread/timeout settings; do not make speculative core changes.

## Task 2: Render acceptance and n8n cutover

Files: `docs/render-free-analysis.md`, sanitized ignored evidence in `logs/`.

- [ ] Inspect authenticated Render workspace billing/plan and create a Free web service from the verified branch. No payment, paid disk, DB or new access scopes without required confirmation.
- [ ] Configure only necessary Gemini/service secrets and allowed R2 hostname. Read back deployment plan, health and route probes without inference.
- [ ] Measure actual video resource/time limits and cold start. If Free cannot support the workload, retain the live endpoint and report evidence; do not upgrade automatically.
- [ ] Inspect current n8n executions, back up workflow, add bounded readiness GET before analysis if needed, keep POST retries off, update endpoint only after hosted checks pass.
- [ ] Submit one marked test evaluation with video after previous executions are terminal; track Analyze Video, final status, callback and both artifacts. Document actual results and limitations.

## Review focus

Unauthenticated calls must not reserve a slot. Client disconnect must not permit a second AI job while the first still computes. Health must remain responsive during media processing. Unknown errors must not disclose signed URLs or keys. A sleeping Render response must never be mistaken for successful analysis JSON. Cover these in HTTP tests or explicit hosted acceptance.

## Execution ledger

- Branch: `feat/render-free-analysis`; work in the supplied checkout without creating another worktree.
- Docker CLI exists; daemon was not running at initial check.
- Render Dashboard initially required login; user has now confirmed login.
