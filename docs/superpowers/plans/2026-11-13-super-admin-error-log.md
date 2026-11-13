# Super Admin Role and Application Error Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-holder `super_admin` role above `admin`, record web-side application errors, and give only the super admin a page that lists them.

**Architecture:** `super_admin` is a new `app_role` enum value; `role_at_least` and every direct `'admin'` comparison treat it as an admin. Errors are written through a flood-guarded `SECURITY DEFINER` RPC into `app_error_logs`, readable and deletable only by the super admin under RLS. The web app captures errors with a small pure core (fingerprint, truncation, dedupe), global handlers, an error boundary, popup call sites and a wrapped Supabase `fetch`.

**Tech Stack:** React 19 + TypeScript + Vite, react-router, Supabase (Postgres RLS, edge functions on Deno), Node `node:test` source-text tests (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-13-super-admin-error-log-design.md`

## Global Constraints

- Hierarchy is exactly `user < editor < admin < super_admin`; a super admin can do everything an admin can.
- Exactly one super admin: the account whose `user_information.email` is `phirapon.t@gmail.com`. That email appears only in the rollout doc's manual SQL, never in application code or migrations.
- The enum value and the policies/functions that use it ship in separate migration files (`20261113100000`, `20261113101000`, `20261113102000`) because Postgres cannot use a new enum value in the transaction that adds it.
- Claude never applies SQL or deploys edge functions; the user runs the SQL in the Supabase SQL Editor (production project `my-app-db`, the only project).
- Field limits: `message` 2000, `stack` 8000, `page_path` 500, `user_agent` 300 characters; `context` JSON at most 8192 characters; client dedupe window 60000 ms; server flood guard 60 rows per user per minute; list page size 50.
- Error `source` values: `popup`, `window_error`, `unhandled_rejection`, `react`, `network`.
- Nothing from form fields, tokens or response bodies is stored; network reports carry only `{ status, endpoint path, method }`.
- Reporting is best effort: it must never throw into the UI.
- Commit with `git add <exact paths>` (the tree holds unrelated uncommitted work; never `git add -A`). End commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- UI copy is Thai first with English in `src/i18n/translations.ts`; every key used by a page exists in both languages.
- Tests: `npm test`, `npm run typecheck`, `npx eslint src tests` must pass before each commit.

## Review Focus

1. A render loop or failing request that reports the same error thousands of times — client dedupe plus server flood guard (Task 5, Task 4).
2. The log endpoint itself failing and being re-reported forever — loop guard in the network filter (Task 5, Task 6).
3. A `context` object that is circular or huge, or an `Error` with no message/stack, must not make reporting throw (Task 5).
4. Reporting while offline or when RLS/RPC rejects: the popup/page still works, nothing thrown (Task 6).
5. The super admin silently losing admin powers somewhere that compares to `'admin'` directly (Tasks 1–3).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/roles.ts` | Role ranking incl. `super_admin` |
| `supabase/migrations/20261113100000_super_admin_enum.sql` | Add enum value only |
| `supabase/migrations/20261113101000_super_admin_role.sql` | `role_at_least`, `is_super_admin()`, single-holder index, guard trigger |
| `supabase/migrations/20261113102000_app_error_logs.sql` | Table, RLS, `log_app_error` RPC |
| `supabase/functions/_shared/roleAccess.js` | `isAdminRole(role)` shared by edge functions |
| `src/services/errorReportCore.js` (+ `.d.ts`) | Pure fingerprint / truncate / ignore / dedupe |
| `src/services/errorReporter.ts` | `reportError`, `installGlobalErrorHandlers` |
| `src/components/AppErrorBoundary.tsx` | React crash capture + fallback |
| `src/lib/supabaseClient.ts` | Wrapped `fetch`, `setNetworkErrorListener` |
| `src/services/errorLogService.ts` | List / delete rows for the page |
| `src/page/SuperAdminErrorsPage.tsx` | The super-admin-only page |
| `docs/superpowers/plans/2026-11-13-super-admin-rollout.md` | Ordered SQL run steps incl. the account assignment |

---

### Task 1: Role model in the web app

**Files:**
- Modify: `src/lib/roles.ts`, `src/page/AdminDashboard.tsx:302,364`, `src/services/videoCaseEditing.ts:36`, `src/services/videoCaseService.ts:170`
- Test: `tests/roles.test.js` (update), `tests/superAdminRole.test.js` (create)

**Interfaces:**
- Produces: `ROLES = ["user","editor","admin","super_admin"]`, rank 1–4; `roleAtLeast(current, required)` unchanged signature; `ASSIGNABLE_ROLES: readonly ["user","editor","admin"]` exported from `roles.ts` for any role picker.

- [ ] **Step 1: Update `tests/roles.test.js`** — extend the expected matrix to all 16 pairs (`super_admin` satisfies every requirement; nobody below satisfies `super_admin`), change the roles list assertion to `["user","editor","admin","super_admin"]`, and fix the title "three known roles" to four.
- [ ] **Step 2: Create `tests/superAdminRole.test.js`** with: `ASSIGNABLE_ROLES` equals `["user","editor","admin"]`; `AdminDashboard.tsx` role `<option>` lists are built from `ASSIGNABLE_ROLES` (source match `ASSIGNABLE_ROLES`, no literal `<option value="super_admin"`); `videoCaseEditing.ts` and `videoCaseService.ts` no longer contain `=== "admin"` / `!== "admin"` on `normalizeRole(...)` and use `roleAtLeast(..., "admin")`.
- [ ] **Step 3: Run** `node --test tests/roles.test.js tests/superAdminRole.test.js` — Expected: FAIL.
- [ ] **Step 4: Implement** the rank/`ROLES`/`ASSIGNABLE_ROLES` change in `roles.ts`; replace the two direct comparisons with `roleAtLeast(normalizeRole(x), "admin")`; render the two `AdminDashboard` selects from `ASSIGNABLE_ROLES` (an admin must not see or set `super_admin`; a super admin's own row keeps its current value shown read-only if it is `super_admin`).
- [ ] **Step 5: Run** the two test files, then `npm run typecheck` — Expected: PASS.
- [ ] **Step 6: Commit** — `feat: add super_admin to the web role model`

### Task 2: Role migrations (enum, role_at_least, single holder)

**Files:**
- Create: `supabase/migrations/20261113100000_super_admin_enum.sql`, `supabase/migrations/20261113101000_super_admin_role.sql`
- Test: `tests/superAdminMigration.test.js`

**Interfaces:**
- Produces (SQL): `public.is_super_admin() RETURNS boolean`; updated `public.role_at_least(required_role public.app_role)`; unique index `user_information_single_super_admin`; trigger `trg_guard_super_admin_role` on `public.user_information`.

- [ ] **Step 1: Write `tests/superAdminMigration.test.js`** reading both files as text, asserting: file 1 is exactly one statement `ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin'` and contains nothing that uses the value; file 2 redefines `role_at_least` with a `WHEN 'super_admin'::public.app_role THEN true` branch while keeping `SECURITY DEFINER`, `SET search_path = public`, `SET row_security = off` and the existing `admin`/`editor`/`user` branches; defines `is_super_admin()` as `current_user_role() = 'super_admin'`; `CREATE UNIQUE INDEX … user_information_single_super_admin … (role) WHERE role = 'super_admin'`; the trigger function raises unless `current_user IN ('postgres','supabase_admin')` whenever `NEW.role` or `OLD.role` is `super_admin`; neither file contains `phirapon.t@gmail.com`.
- [ ] **Step 2: Run** `node --test tests/superAdminMigration.test.js` — Expected: FAIL (files missing).
- [ ] **Step 3: Write the two SQL files.** Model `role_at_least` on the latest definition in `supabase/migrations/20260406120000_user_information_signup_profile.sql:56-73` and add the `super_admin` branch. The trigger is `BEFORE INSERT OR UPDATE OF role` on `user_information`; on `INSERT` it only checks `NEW.role` (the signup trigger inserts `user`).
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: add super_admin enum value, role_at_least branch and single-holder guard`

### Task 3: Edge functions treat super_admin as admin

**Files:**
- Create: `supabase/functions/_shared/roleAccess.js`
- Modify: `supabase/functions/admin-user-management/index.ts:17,41,79`, `supabase/functions/document-artifact-url/index.ts:113,136`, `supabase/functions/_shared/groupDocumentAccess.js:3`
- Test: `tests/roleAccess.test.js`; extend `tests/adminUserManagement.test.js` if it can exercise the handler (otherwise add source assertions in `tests/roleAccess.test.js`)

**Interfaces:**
- Produces: `isAdminRole(role: unknown): boolean` — `true` for `"admin"` and `"super_admin"` only. `executionRetry.js:64` already uses `role_at_least('admin')`, so it follows the migration; no change.

- [ ] **Step 1: Write `tests/roleAccess.test.js`**: `isAdminRole` is true for `admin`/`super_admin`, false for `editor`, `user`, `""`, `null`, `"ADMIN"`; `groupDocumentAccess.js` and `document-artifact-url/index.ts` import `isAdminRole` and no longer contain `role === "admin"` / `role !== "admin"` / `role === 'admin'`; `admin-user-management/index.ts` accepts `isAdminRole(actorRole)`, returns 403 when the **target** row's role is `super_admin` or the requested new role is `super_admin` (assert the source contains a `"super_admin"` refusal before the update call), and `AppRole` there includes `"super_admin"` only for reading, with `normalizeRole` never returning it from request payloads.
- [ ] **Step 2: Run** `node --test tests/roleAccess.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** `isAdminRole` and use it at the listed sites; in `admin-user-management`, load the target's current role and refuse (`403`, `"Cannot modify the super admin"`) when it is `super_admin`, and refuse (`403`) when `payload.role === "super_admin"`.
- [ ] **Step 4: Run** the new test and the existing `tests/adminUserManagement.test.js`, `tests/groupDocumentAccess.test.js`, `tests/documentArtifactUrl.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: edge functions accept super_admin as admin and protect it from role edits`

### Task 4: Error log table and RPC

**Files:**
- Create: `supabase/migrations/20261113102000_app_error_logs.sql`
- Test: `tests/appErrorLogsMigration.test.js`

**Interfaces:**
- Produces (SQL): table `public.app_error_logs` (columns per spec §2); `public.log_app_error(p_source text, p_message text, p_stack text, p_page_path text, p_user_agent text, p_context jsonb, p_fingerprint text) RETURNS void`, granted to `authenticated` only.

- [ ] **Step 1: Write the test**, asserting on the SQL text: table columns and `source` CHECK listing exactly the five sources; RLS enabled; `SELECT` and `DELETE` policies `USING (public.is_super_admin())` and no `INSERT`/`UPDATE` policy; the RPC is `SECURITY DEFINER`, `SET search_path = public`, validates `p_source`, truncates with `left(…, 2000/8000/500/300)`, caps `p_context` at `8192` characters (`octet_length`/`length` check), fills `user_id` from `auth.uid()` and role from `current_user_role()`, returns without inserting when `auth.uid()` is null or the last-minute count for that user is `>= 60`, wraps everything in an `EXCEPTION WHEN OTHERS THEN NULL` block so it never raises; `REVOKE ALL … FROM PUBLIC, anon` and `GRANT EXECUTE … TO authenticated`; indexes on `created_at DESC` and `fingerprint`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: add app_error_logs with a flood-guarded reporting RPC`

### Task 5: Error report core (pure)

**Files:**
- Create: `src/services/errorReportCore.js`, `src/services/errorReportCore.d.ts`
- Test: `tests/errorReportCore.test.js`

**Interfaces:**
- Produces: `ERROR_SOURCES: readonly string[]`; `buildFingerprint(source: string, message: string, stack?: string | null): string` (8 lowercase hex chars, stable for the same inputs, ignores everything after the first stack line); `truncateReport(report: { source; message; stack?; pagePath?; userAgent?; context? }): same shape with limits applied, `context` replaced by `{ truncated: true }` when its JSON exceeds 8192 chars **or cannot be serialised (circular)**; `normalizeError(error: unknown): { message: string; stack: string | null }` (handles `Error`, string, object with `message`, `null`/`undefined` → `"Unknown error"`); `shouldIgnoreNetworkError(info: { url: string; status: number; method: string; aborted?: boolean }): boolean` — true when aborted, when the URL contains `/rest/v1/rpc/log_app_error`, or when the URL contains `/auth/v1/` and status is not 2xx; `createDedupe(windowMs?: number, now?: () => number): (fingerprint: string) => boolean` — returns `true` (send) the first time and again only after `windowMs`.

- [ ] **Step 1: Write the failing tests**: same inputs give the same fingerprint, different source or message differ, stack lines after the first do not change it; truncation of each field at its limit; circular `context` and a 9000-char context both become `{ truncated: true }`; `normalizeError` of `new Error("x")`, `"boom"`, `{ message: "m" }`, `null`; ignore rules (log endpoint, auth endpoint 400, aborted true, a normal `/rest/v1/evaluations` 500 is **not** ignored); dedupe with an injected clock: send, suppress at +59999, send at +60000.
- [ ] **Step 2: Run** `node --test tests/errorReportCore.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** the five functions (hash: any small stable string hash such as djb2 to hex).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: add the pure error report core`

### Task 6: Reporter, global handlers, boundary, fetch wrapper

**Files:**
- Create: `src/services/errorReporter.ts`, `src/components/AppErrorBoundary.tsx`
- Modify: `src/lib/supabaseClient.ts`, `src/main.tsx`
- Test: `tests/errorReporter.test.js`

**Interfaces:**
- Consumes: Task 5 functions; Task 4 RPC `log_app_error`.
- Produces: `reportError(error: unknown, options: { source: ErrorSource; context?: Record<string, unknown> }): void`; `installGlobalErrorHandlers(): () => void` (registers `window` `error` and `unhandledrejection`, registers the network listener, returns a cleanup); in `supabaseClient.ts`: `setNetworkErrorListener(listener: ((info: { url: string; status: number; method: string }) => void) | null): void`, and the client is created with `global.fetch` wrapped so a non-OK response calls the listener and the **original response is returned untouched** (errors thrown by `fetch` propagate unchanged). `ErrorSource` type exported from `errorReporter.ts`.

- [ ] **Step 1: Write source-text tests** asserting: `reportError` normalises, builds the fingerprint, skips when `createDedupe` says no, calls `supabase.rpc("log_app_error", …)` with the seven parameters from the spec, and wraps the whole body in `try/catch` that only `console.warn`s; the reporter never reports a failure of its own call; `installGlobalErrorHandlers` registers both events and returns a cleanup that removes them; `supabaseClient.ts` defines `setNetworkErrorListener` and passes `global: { fetch: … }` to `createClient` and consults `shouldIgnoreNetworkError`; `main.tsx` calls `installGlobalErrorHandlers()` and wraps `<App />` in `<AppErrorBoundary>` (inside `AuthRoleProvider` so the fallback can use language context); `AppErrorBoundary` is a class component with `componentDidCatch` calling `reportError(error, { source: "react", context: { componentStack } })` and rendering a fallback with a reload button using `t("common.errorOccurred")`.
- [ ] **Step 2: Add a behavioural test** that imports `errorReportCore` and drives `createDedupe` plus `shouldIgnoreNetworkError` through the exact sequence the wrapper uses (a failing `log_app_error` response is ignored, a failing `/rest/v1/evaluations` response is reported once within the window).
- [ ] **Step 3: Run** `node --test tests/errorReporter.test.js` — Expected: FAIL.
- [ ] **Step 4: Implement** the files. Keep `supabaseClient.ts` free of imports from `errorReporter.ts` (the listener indirection avoids a circular import).
- [ ] **Step 5: Run** the test, `npm run typecheck`, `npx eslint src tests` — Expected: PASS.
- [ ] **Step 6: Commit** — `feat: capture web errors with global handlers, an error boundary and a fetch wrapper`

### Task 7: Popup call sites report for real

**Files:**
- Modify: `src/page/VideoGroupCreatePage.tsx`, `src/page/VideoGroupDetailPage.tsx`, `src/page/VideoGroupsPage.tsx`, `src/page/VideoGroupDocumentPreviewPage.tsx`
- Test: extend `tests/videoGroupPages.test.js` (the test "unexpected group action failures open the error popup…")

**Interfaces:**
- Consumes: `reportError` from Task 6. Context values: `{ action: "create_group" | "send_group" | "discard_group_draft" | "delete_group" | "delete_group_preview", groupId?: string }`.

- [ ] **Step 1: Update the test** so each of the four pages must contain `reportError(` with `source: "popup"` and the matching `action` string, and no longer require `console.error(` there.
- [ ] **Step 2: Run** `node --test tests/videoGroupPages.test.js` — Expected: FAIL.
- [ ] **Step 3: Replace** each `console.error("… failed:", error)` with `reportError(error, { source: "popup", context: { action, groupId } })`; keep the popup behaviour unchanged.
- [ ] **Step 4: Run** the full suite — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: report group action failures to the error log`

### Task 8: Super admin error page

**Files:**
- Create: `src/services/errorLogService.ts`, `src/page/SuperAdminErrorsPage.tsx`
- Modify: `src/App.tsx` (route), `src/components/ProfileDropdown.tsx` (menu item), `src/i18n/translations.ts`
- Test: `tests/superAdminErrorsPage.test.js`

**Interfaces:**
- Produces: `ErrorLogRow` (`id: number; created_at: string; user_id: string | null; user_role: string | null; source: ErrorSource; message: string; stack: string | null; page_path: string | null; user_agent: string | null; context: Record<string, unknown>; fingerprint: string`); `ERROR_LOG_PAGE_SIZE = 50`; `listErrorLogs(filters: { source?: ErrorSource | ""; from?: string; to?: string; search?: string; page: number }): Promise<{ rows: ErrorLogRow[]; total: number }>` (newest first, `range`, exact count, `search` matches `message` with `ilike`); `deleteErrorLogsBefore(isoDate: string): Promise<void>`; `deleteErrorLog(id: number): Promise<void>`; default export `SuperAdminErrorsPage`. Route `/super-admin/errors` wrapped in `<ProtectedRoute requiredRole="super_admin">`. Menu item shown only when `role === "super_admin"`.

- [ ] **Step 1: Write the tests** (source text): route exists with `requiredRole="super_admin"`; `ProfileDropdown` renders the item only under a `role === "super_admin"` condition and navigates to `/super-admin/errors`; `errorLogService` queries `app_error_logs` ordered by `created_at` descending with `range`, filters by source/date/search, and deletes by id and by `lt("created_at", …)`; the page renders the filters, the table columns (time, user, role, source, message, page, repeat count), an expandable stack/context row, a confirm dialog before bulk delete, pagination, and uses `ErrorNoticeModal` for its own load/delete failures **without** calling `reportError` for them (no self-report loop); every `superAdmin.*` key used exists in both languages.
- [ ] **Step 2: Run** `node --test tests/superAdminErrorsPage.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement.** Repeat count = number of rows with the same `fingerprint` in the loaded page. Style with the existing `ui-hover-card` cards and `btn-*` classes; reuse `ConfirmModal` for deletes.
- [ ] **Step 4: Run** the test, typecheck, eslint, `npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: add the super admin error log page`

### Task 9: Rollout doc and final verification

**Files:**
- Create: `docs/superpowers/plans/2026-11-13-super-admin-rollout.md`

- [ ] **Step 1: Write the rollout doc** with the ordered, copy-pasteable steps from the spec §7: run `20261113100000` alone → run `20261113101000` → run `UPDATE public.user_information SET role = 'super_admin' WHERE email = 'phirapon.t@gmail.com';` then `SELECT auth_user_id, email, role FROM public.user_information WHERE role = 'super_admin';` (expect one row) → run `20261113102000` → deploy `admin-user-management`, `document-artifact-url` (the `_shared` files ship with them) → deploy the web app; plus the rollback steps and the manual check (trigger a popup error as a normal user, open `/super-admin/errors` as the super admin, confirm an admin account sees no rows).
- [ ] **Step 2: Run** `npm run typecheck`, `npx eslint src tests`, `npm test` — Expected: all pass, zero failures.
- [ ] **Step 3: Commit** — `docs: add the super admin rollout steps`
- [ ] **Step 4: Report** the SQL run order and the edge function deploy list to the user; do not apply or deploy anything.
