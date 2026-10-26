# Gemini Free Video Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepare and verify the approved Gemini Free Tier video-only migration without additional spend or duplicate evaluation delivery.

**Architecture:** Reuse existing multimodal Gemini adapter, strict evaluation schema, cache and provider selector. Pin the selected model explicitly. Stage a minimal deploy context derived from revision 00024 source; preserve its non-video behavior. External generation/deployment is gated by read-only cost/access checks.

**Tech Stack:** Node.js, Express, ffmpeg, Gemini REST, n8n, Cloud Run.

**Spec:** `docs/superpowers/specs/2026-10-24-gemini-free-video-design.md` (approved by user: “โอเคเริ่มปรับ”).

## Global Constraints

- Video-only migration; no change to human scores, aggregation provider, upload or callback.
- Approximately 6 sampled images plus actual MP3; no clip segmentation.
- No billing changes, paid fallback, automatic retry/replay, secret logging or real evaluation submission without checking target/execution/artifacts.
- Verify the key's actual project and billing state before inference. Metadata alone is not inference acceptance.
- Do not build/deploy when additional hosting/build cost cannot be excluded.
- Preserve earlier OpenAI diagnostic edits and uncommitted documents.

## Review Focus

- Explicit model config, including missing/whitespace settings, must not select an unintended model.
- Quota/auth failure through the real HTTP endpoint must stop after one provider call and produce no success analysis.
- Free project verification must match the same key later used for testing/deployment.
- Live n8n Code nodes must accept Gemini output and preserve manual scores.
- Deployment context must exclude local env/logs and unrelated backend changes.

### Task 1: Free-tier access evidence

**Files:** ignored `logs/inspect-gemini-project.local.mjs`, evidence and ledger.

**Interfaces:** Existing local `GEMINI_API_KEY`; read-only Google OAuth; outputs safe project/billing/model/quota evidence, never key/token.

- [x] Resolve API key project through API Keys lookup; read project and billing.
- [x] Read free-tier model quota and model metadata; no generation yet.
- [ ] If free access cannot be established, finish independent local work and report exact blocker.

### Task 2: Pin model and strengthen endpoint acceptance

**Files:** `server/geminiAnalysis.js`, `.env.example`, `tests/geminiAnalysis.test.js`, `tests/geminiEndpoint.test.js`, `docs/gemini-analysis.md`.

**Interfaces:** `getGeminiConfig() -> {apiKey,model}`; `generateVideoAnalysis({prompt,frames,audio})` and existing `{code,error}` HTTP contract.

- [x] Add failing behavior test: absent/blank `GEMINI_MODEL` makes a multimodal request to `gemini-2.5-flash` and preserves matching metadata.
- [x] Run the test RED; set default model to `gemini-2.5-flash`, maintain explicit overrides.
- [x] Exercise existing real-media endpoint fixture using selected model; add 429/401/403 rejection cases with one provider request, no retry/fallback and no leaked content.
- [x] Run `node --test tests/geminiAnalysis.test.js tests/geminiEndpoint.test.js tests/n8nVideoCaseContract.test.js` GREEN.

### Task 3: Minimal deployment preparation and local checks

**Files:** ignored deployment context derived from `logs/deployed-00024-source/`; tracked deployment notes in `docs/gemini-analysis.md`.

**Interfaces:** Old core uses direct OpenAI video analysis; staged core imports selector only for video. Preserve old OpenAI aggregate functions and old non-video routes.

- [x] Copy revision source to a new ignored context; copy necessary Gemini/provider/schema modules; change only video generator/config calls in old core.
- [x] Verify source diff and exclude env/logs; run current tests using fresh workflow export where applicable.
- [x] Run `npm test`, `npm run lint`, `npm run build`, `git diff --check`.
- [ ] Review changes independently; apply material corrections with regression tests.

### Task 4: Live gates and status

- [x] If key project is billing-disabled and free model quota verified, perform one synthetic multimodal check; never use user media for connectivity testing.
- [ ] Determine build/registry/hosting cost headroom read-only. Deploy only if no additional spend established; otherwise leave reviewed context ready and report cost gate.
- [ ] If deployed: verify health/auth/validation before AI, then one synthetic request against exact deployed revision.
- [ ] Before real evaluation: fresh n8n execution/artifact/guard/source URL checks and explicit target identification. Stop at any unresolved sensitive-data or delivery boundary.
- [ ] Record exactly which stages passed versus remain blocked; do not claim E2E acceptance without real callback/artifacts.

## Execution ledger

- User authorized execution of approved design; implement inline on `fix/gemini-free-video`.
- Baseline: `npm test` 160/160 passed.
- Ruling: Preserve the existing working directory and dirty changes on a new branch; stage the deploy candidate separately under ignored logs. No worktree was created without the user's worktree preference.
- Task 1 evidence: key project `gen-lang-client-0749209595`, billing read HTTP 200, `billingEnabled=false`. No inference called.

## Resume and scope amendment ? 2026-10-25

- User confirmed zero additional hosting spend and explicitly approved a loopback backend via ngrok Free, limited to POST /api/analyze-video with service-token protection and disclosed data transit. This replaces the Cloud Run deployment gate; no cloud deployment will be attempted.
- Free key/project/billing/model/quota rechecked successfully. Fresh synthetic HTTP inference succeeded (200, Gemini2.5 Flash, 6frames, actual MP3, cache miss); unauthorized probe401.
- Added tested loopback-only local runtime and secret-free tunnel policy. Local and public validation/auth/path-deny checks passed. ngrok agent confirmed Plan: Free.
- Changed only sub-workflow HTTP URL; fresh export version af7ee0fe-0c35-4da7-ae3f-b2ad517ef9bf compared structurally: credentials, request/prompt, connections, settings and pinData unchanged.
- Parent readback before change: No active executions; latest3048. No evaluation submitted, replayed or reconciled.
- Suite164/164 and lint passed. Build verification is recorded in logs/gemini-local-final-build.local.log.
- Earlier independent reviewer identified the stale setup model in the deployment guide; it was corrected. That reviewer then hit its tool/model usage limit, so complete independent review was unavailable. Resumed local runtime received author security review and targeted tests; no claim of complete independent review or merge.
- Remaining: real n8n evaluation/PDF/DOCX acceptance requires a concrete target and verification of downstream report-node free-tier credentials. Existing aggregation remains OpenAI and outside tunnel scope. See docs/local-gemini-analysis.md.
