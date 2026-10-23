# Direct Document Dispatch Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task.

**Goal:** Start n8n immediately without a queue worker.
**Architecture:** An authenticated Edge Function acquires an atomic per-document
dispatch guard and calls n8n. Existing artifact callbacks remain authoritative.
**Tech Stack:** React/TypeScript, Supabase PostgreSQL/Edge Functions, Node tests/PGlite.
**Spec:** `docs/superpowers/specs/2026-10-23-direct-document-dispatch-design.md`

## Global Constraints

- No global waiting lane or worker requirement for new submissions.
- Preserve authorization, canonical document identity, R2 ownership and callbacks.
- Preserve historical queue rows and do not replay them.
- No automatic replay after ambiguous delivery; no secrets in browser settings.

## Review Focus

- Two documents must dispatch independently; one document must not dispatch twice.
- Forged target, actor, callback destination, and video ownership must be rejected/sanitized.
- A completed callback must survive a late rejection or timeout from dispatch.
- Failed/unknown webhook delivery must not become a successful submission.
- Legacy worker RPCs must no longer dispatch jobs; historical data stays intact.

### Task 1: Atomic dispatch authorization and state

Files: new migration `20261023090000_direct_document_dispatch.sql`,
`tests/directDocumentDispatch.test.js`.
Produces `begin_document_dispatch(kind,id,payload)` for authenticated callers and
`finish_document_dispatch(kind,id,token,state,error)` for service role only.

- [x] Write/run failing PGlite tests for authorization, independent targets,
  canonical payloads, duplicate prevention, legacy retirement and callback races.
- [x] Implement the migration, including callback-state synchronization.
- [x] Run `node --test tests/directDocumentDispatch.test.js` (zero failures).

### Task 2: Direct Edge forwarding

Files: `supabase/functions/forward-to-n8n/index.ts`, new shared handler,
`tests/directForward.test.js`.
Consumes Task 1 RPCs; returns `ok:true,status:pending` only after acknowledged delivery.

- [x] Write/run failing tests against real HTTP handler behavior for auth,
  immediate forwarding, duplicate/no-send, errors, timeout and callback races.
- [x] Implement handler with server-side webhook/callback settings and bounded wait.
- [x] Run SQL and handler tests together (zero failures).

### Task 3: Frontend, retirement, documentation and validation

Files: Dashboard, dashboard service/status helper, FormSubmit, videoCaseService,
package scripts, README, queue operations guide and corresponding behavior tests.

- [x] Write/run failing behavior tests for legacy queue status ignored and
  aggregate failures preserving completed callbacks.
- [x] Remove queue UI/worker entry points, update status copy and server-owned state.
- [x] Run complete `npm test`, `npm run lint`, `npm run build`.
- [x] Perform independent code review, fix important findings with regression tests.
- [x] Check deployment access; apply migration/deploy only through authorized tools.
  If access is missing, report the exact rollout steps still required.

## Execution record

Ruling: execute in the active workspace with uncommitted reviewable changes, as
the user requested changing this running local app; no worktree/commit/push is
needed. Preserve `.env`. No further design or execution confirmation is required.

Verification checkpoint: `npm test` passed 133/133; lint and production build
passed. Full-suite ffmpeg test used an authorized unsandboxed localhost listener.
A subsequent legacy-retry permission regression test is being verified.
Task 1: complete — real PGlite RPC tests RED→GREEN.
Task 2: complete — real Edge handler HTTP behavior tests RED→GREEN.
Task 3: frontend complete — dashboard legacy-status and summary callback-race
regressions RED→GREEN. Deployment and independent review remain open.
Ruling: preserve pending document identity on a browser dispatch error and open
its preview; otherwise resubmitting the form would create a second evaluation.
Ruling: require a PDF/DOCX artifact path in the callback before ready; a Google
Doc ID alone did not satisfy the approved readiness contract. Callback behavior
test demonstrated the old 200 and new 400 result.
Deployment checkpoint: Supabase CLI reports no access token. The user is logging
in; no remote migration, function deploy, workflow change, or job replay occurred.

Independent review: no critical/high-priority findings. Deferred nonblocking
observations: short R2 GET TTLs may expire during upload; frontend non-2xx errors
may use a generic Supabase transport message. Both are documented in the direct
dispatch operations guide. No remote workflow was invoked by the reviewer.
Focused verification after legacy-retry test: 28/28 passed.

Final local verification: complete suite 134/134 passed; lint/build passed.
Independent review completed with no important findings. Remote rollout remains
pending Supabase CLI authentication; no paid inference or live job replay.

2026-10-23 rollout: user completed CLI login. Linked target project
vpajxuomerowvxwfezik. Preflight found zero running/awaiting/attention queue jobs
and no prior evaluation matching order 002 / title TestWithVideo. Dry run listed
only migration 20261023090000; migration applied successfully. Both Edge Functions
deployed with JWT settings preserved. Live unauthenticated forwarding returned
401 before any n8n call. Database readback confirms direct RPC exists, legacy
claim returns zero rows, and authenticated legacy enqueue permission is false.
User confirmed changing the VIA-v4 Webhook to Immediately and saving it; this is
user-confirmed configuration until actual acknowledgement is observed.
One new browser video submission started; no automatic retry or legacy replay.

Rollout complete: migration and both functions deployed; live database and auth
checks passed. Real browser video test created evaluation 261 and n8n execution
3044 without a worker. Downstream AI failed with OpenAI credit_balance_exhausted;
no analysis/artifacts. Conditional failure reconciliation of #261 performed after
observing the execution. See docs/production-video-acceptance-2026-10-23.md.
The 20-second acknowledgement timed out despite user-confirmed Immediately
setting; runtime response behavior remains a documented rollout limitation.
