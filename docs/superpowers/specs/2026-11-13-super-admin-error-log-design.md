# Super admin role and application error log — design

Date: 2026-11-13 · Branch: `feat/video-group-evaluations` · Status: draft for review

## Goal

1. Add a fourth permission level, `super_admin`, above `admin`, held by exactly one account
   (the account with email `phirapon.t@gmail.com`).
2. Record every web-side application error (including the errors users see in the
   "เกิดข้อผิดพลาด" popup) and give only the super admin a page that lists them.
3. Make the popup text "กำลังส่งข้อมูลไปยังเจ้าหน้าที่" true: the popup now really sends the error.

Decisions already made with the user: identify the account by email; add a real `super_admin`
value to `app_role`; round one covers web-side errors only.

Out of scope (round one): edge function / n8n errors, e-mail or chat alerts, anonymous
(not-signed-in) error capture, resolve/assign workflow.

## 1. Role model

Hierarchy: `user < editor < admin < super_admin`. A super admin can do everything an admin can.

**Database** (two separate SQL runs, because Postgres cannot use a new enum value in the
transaction that adds it):

- `20261113100000_super_admin_enum.sql`: `ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';`
- `20261113101000_super_admin_role.sql`:
  - `CREATE OR REPLACE FUNCTION public.role_at_least` so `super_admin` returns `true` for every
    required role (the current CASE returns `false` for unknown values, which would remove all
    admin rights from the super admin). Keep `SECURITY DEFINER`, `search_path`, `row_security = off`.
  - `public.is_super_admin()` = `current_user_role() = 'super_admin'`.
  - Unique partial index on `user_information (role) WHERE role = 'super_admin'`, so at most one
    holder can exist.
  - A `BEFORE UPDATE OF role` / `BEFORE INSERT` trigger on `user_information` that rejects any
    change that sets or clears `super_admin` unless `current_user IN ('postgres','supabase_admin')`
    (the SQL Editor). The service-role key used by edge functions and every `authenticated`
    session are therefore refused.
  - The assignment itself is a statement the user runs manually:
    `UPDATE public.user_information SET role = 'super_admin' WHERE email = 'phirapon.t@gmail.com';`
    No e-mail is stored in application code.

**Code that compares to `'admin'` directly** must treat `super_admin` as an admin
(found by grep; each is reviewed in the plan):

- `supabase/functions/admin-user-management/index.ts`: also refuses to assign or modify
  `super_admin`, and refuses to change the super admin's own row.
- `supabase/functions/document-artifact-url/index.ts`
- `supabase/functions/_shared/executionRetry.js`
- `supabase/functions/_shared/groupDocumentAccess.js`
- Front end: `src/lib/roles.ts` (`ROLES`, `ROLE_RANK`), and any role dropdown that iterates
  `ROLES` (`AdminDashboard`, `RoleRequestsPage`) must not offer `super_admin`.

Landing page: `roleAtLeast(role, "admin")` already routes a super admin to `/home`.

## 2. Error log table

`20261113102000_app_error_logs.sql`:

```
app_error_logs(
  id bigint identity primary key,
  created_at timestamptz default now(),
  user_id uuid null,            -- auth.uid() at insert time
  user_role text null,
  source text not null,         -- popup | window_error | unhandled_rejection | react | network
  message text not null,        -- truncated to 2000 chars
  stack text null,              -- truncated to 8000 chars
  page_path text null,          -- location.pathname + search, truncated to 500
  user_agent text null,         -- truncated to 300
  context jsonb not null default '{}',   -- <= 8 KB; action name, group id, HTTP status, endpoint
  fingerprint text not null     -- hash of source + message + first stack line
)
```

- RLS enabled. `SELECT` and `DELETE` policies only for `public.is_super_admin()`. No client
  `INSERT`/`UPDATE` policy.
- Writes only through `public.log_app_error(...)`, `SECURITY DEFINER`, granted to `authenticated`.
  It truncates every field, caps `context`, validates `source`, fills `user_id`/`user_role` from the
  session, and drops the row silently when the same user has already inserted 60 rows in the last
  minute (flood guard). It never raises, so reporting can never break the page.
- Indexes: `(created_at DESC)`, `(fingerprint)`.
- Nothing from form fields, tokens, or response bodies is stored.

## 3. Capturing errors on the web

- `src/services/errorReportCore.js` (pure, unit-tested): `buildFingerprint`, `truncateReport`,
  `shouldIgnore`, and a `createDedupe(windowMs = 60000)` that lets an identical fingerprint through
  once per window.
- `src/services/errorReporter.ts`: `reportError(error, { source, context })` calls
  `supabase.rpc("log_app_error", …)` fire-and-forget; failures are swallowed and logged to the console.
  `installGlobalErrorHandlers()` registers `window.onerror` and `unhandledrejection`; called once in
  `main.tsx`.
- `src/components/AppErrorBoundary.tsx` wraps the app root: logs `source = react`, shows a plain
  fallback with a reload button.
- `ErrorNoticeModal` call sites (group create, send, discard, delete, preview delete) replace
  `console.error` with `reportError(error, { source: "popup", context: { action } })`.
- Supabase fetch wrapper in `src/lib/supabaseClient.ts` (`global.fetch`): a non-2xx response is
  reported as `source = network` with `{ status, endpoint path }` only. Ignored: the
  `log_app_error` call itself (loop guard), `401` from token refresh, aborted requests, and `4xx`
  from `auth/v1` password and sign-in attempts.
- Only signed-in users' errors are stored in round one (the RPC is not granted to `anon`).

## 4. Super admin page

- Route `/super-admin/errors`, `<ProtectedRoute requiredRole="super_admin">`. RLS is the real
  gate; a non-super-admin who calls the API directly receives no rows.
- `src/services/errorLogService.ts`: `listErrorLogs({ source, from, to, search, page })` (50 per page,
  newest first), `deleteErrorLogsBefore(date)`, `deleteErrorLog(id)`.
- `src/page/SuperAdminErrorsPage.tsx`, styled like the other pages (cards, `ui-hover-card`):
  filters (source, date range, text), a table (time, user, role, source, message, page, repeat
  count of the same fingerprint in the loaded page), an expandable detail row with stack and
  context, a "delete older than N days" action with a confirm dialog, and pagination.
- Navigation: a menu item in `ProfileDropdown`, rendered only when `role === "super_admin"`.
- Users other than the super admin who open the URL are redirected like any forbidden route.

## 5. Failure behaviour

- Reporting is best effort and never throws into the UI. If it fails (offline, RLS, flood guard) the
  popup still shows; the console keeps the original error.
- The flood guard and the client dedupe mean a render loop cannot fill the table.

## 6. Testing

Unit (Node): `errorReportCore` (fingerprint stability, truncation, dedupe window, ignore rules),
`roles.ts` ranking including `super_admin`, source-text tests for the migrations (enum value, updated
`role_at_least`, unique index, trigger condition, RLS policies, RPC grants), route guard,
dropdown visibility, the admin-user-management guard, and that every `ErrorNoticeModal` site calls
`reportError`. Manual after deploy: trigger a popup error as a normal user, then confirm it appears
on `/super-admin/errors` for the super admin and that a second account (admin) cannot read it.

## 7. Rollout and rollback

Order: (1) run `…_super_admin_enum.sql`; (2) run `…_super_admin_role.sql` and the `UPDATE` that
assigns the account; (3) run `…_app_error_logs.sql`; (4) deploy the changed edge functions;
(5) deploy the web app. Nothing is applied by Claude; the user runs the SQL in the SQL Editor.

Rollback: set the account back to `admin` (run as `postgres`); drop the trigger, the table and the RPC.
The enum value cannot be removed from `app_role`; it stays unused.

## 8. Risks

- Missing one `'admin'` comparison would deny the super admin that feature. Mitigation: the grep list
  above plus a test that no source file compares `role === "admin"` without going through the helper.
- Error rows contain user ids and URLs for every user; only the super admin can read them and the
  page offers deletion for retention.
