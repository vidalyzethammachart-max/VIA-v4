# Qwen analysis implementation plan

> Execute inline using executing-plans and TDD. User approved Qwen on 2026-10-23.

**Goal:** Replace ONLY the exhausted Analyze Video path with server-only Qwen Omni, preserving all other behavior.

**Architecture:** A video-only provider selector uses `VIDEO_ANALYSIS_PROVIDER=qwen`; an unset setting preserves existing OpenAI behavior. Qwen uses the existing real MP3 and sampled JPEGs, then validates JSON before caching. R2, aggregation, authentication, direct dispatch, n8n report generation and document callbacks keep their existing implementations.

**Tech stack:** Node native fetch, existing analysis cache, Node test runner.

## Constraints and decisions

- Credentials and region-specific endpoint must be configured server-side. No VITE secrets.
- Qwen3.8 Omni supports non-streaming JSON output with reasoning disabled according to current official docs. Other model families require a separate compatibility implementation.
- Use separate audio evidence then image/JSON analysis, matching the current pipeline and making unavailable audio explicit.
- No automatic retry, provider fallback, new evaluation, production traffic switch or billing activation.
- Work in the existing workspace because this is continuation of the user's local app changes; preserve all unrelated work and leave changes reviewable without a commit.
- Deployment and live acceptance require the user's Model Studio key, matching endpoint and model access. These are not available yet.

## Review focus

Missing credentials before video download; endpoint/key leakage; truncated or malformed successful responses; uncertain transport outcomes; accidental OpenAI fallback.

## Task 1: Provider adapter and integration

- [x] Write failing tests in `tests/qwenAnalysis.test.js` for audio/image JSON flow, caching, safe errors, incomplete/malformed output, missing credentials and video-only provider selection.
- [x] Run `node --test tests/qwenAnalysis.test.js`; verify failures reflect missing Qwen support.
- [x] Add `server/qwenAnalysis.js` with `getQwenConfig()` and `generateQwenAnalysis({prompt,frames,audio})`; keep request timeout and unknown-delivery lock behavior. Include endpoint, credential digest and model in cache identity.
- [x] Add `server/videoAnalysisProvider.js` with `getVideoAnalysisConfig()` and `generateVideoAnalysis(input)`; unset preserves OpenAI, explicit Qwen selects Qwen, unknown values fail.
- [x] Route only media analysis and its credential precheck in `server/videoAnalysisCore.js` through selector. Leave both aggregate entrypoints untouched.
- [x] Verify focused and full tests.

## Task 2: Configuration and handoff

- [x] Add server-only Qwen configuration placeholders to `.env.example` and local `.env` without changing frontend endpoints.
- [x] Add `scripts/check-qwen.mjs`: config-only by default; explicit `--generate` sends synthetic JSON request and reports sanitized result.
- [x] Document setup, deployment requirements and reuse of existing failed evaluation after inspection in `docs/qwen-analysis.md`.
- [x] Run full tests, lint, build and diff check; review changed paths.

## Execution ledger

- Initial state: local repo contains previous direct dispatch work; remote evaluation #261 is failed, no Qwen credentials exist. No live provider request authorized/configured in this step.
- Scope correction from user: change only the failing video analysis step. No general AI migration and no modification to n8n's existing report models.

- Task 1: RED observed (missing adapter and wrong provider precheck), then GREEN: focused Qwen tests 7/7, including real ffmpeg extraction and mocked external inference. Loopback tests required the approved elevated sandbox invocation.
- Task 2: complete locally. `.env` gained only missing server-side provider fields, preserving all existing values. Config check correctly exits with missing DASHSCOPE_API_KEY; both provider key and endpoint remain empty.
- Verification: `npm test` 141/141; `npm run lint` pass; `npm run build` pass with existing large-chunk warning; `git diff --check` pass.
- Fresh independent review: /root/review_qwen_video found no blocking findings. Its sandbox could not bind localhost; the primary agent's approved integration/full-suite run passed.
- Deployment/live acceptance: NOT performed; requires user-owned Model Studio key and matching regional model access. No provider charge, retry of evaluation #261, n8n changes or production traffic change occurred.
