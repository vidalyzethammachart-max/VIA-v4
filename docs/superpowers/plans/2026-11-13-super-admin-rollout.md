# Super admin and error log — rollout

Nothing here is applied by Claude. Run the SQL yourself in the Supabase SQL Editor of the only
(production) project `my-app-db`, in this order, one file per run.

## 1. SQL, in order

1. **`supabase/migrations/20261113100000_super_admin_enum.sql`** — run it **on its own** and let it finish.
   Check: `SELECT unnest(enum_range(NULL::public.app_role));` lists `user, editor, admin, super_admin`.
2. **`supabase/migrations/20261113101000_super_admin_role.sql`** — updates `role_at_least`, adds
   `is_super_admin()`, the single-holder index and the guard trigger.
3. **Assign the account** (run as the SQL Editor's default `postgres` role; the guard trigger refuses
   every other role):

   ```sql
   UPDATE public.user_information SET role = 'super_admin' WHERE email = 'phirapon.t@gmail.com';

   SELECT auth_user_id, email, role FROM public.user_information WHERE role = 'super_admin';
   ```

   Expect exactly **one** row. If the `UPDATE` touches 0 rows, the email in `user_information` differs
   from the sign-in email; check with `SELECT auth_user_id, email, role FROM public.user_information WHERE email ILIKE 'phirapon%';`.
4. **`supabase/migrations/20261113102000_app_error_logs.sql`** — table, RLS, `log_app_error`.
   Check: `SELECT policyname, cmd FROM pg_policies WHERE tablename = 'app_error_logs';` shows one `SELECT`
   and one `DELETE` policy, nothing else.

Already applied earlier and unrelated to this rollout: `20261112092000_video_group_delete.sql`,
`20261112093000_video_group_free_type.sql`.

## 2. Edge functions

Redeploy these two (the `_shared/roleAccess.js` and `_shared/groupDocumentAccess.js` files ship with them):

- `admin-user-management`
- `document-artifact-url`

`retry-n8n-execution` needs no redeploy: it checks `role_at_least('admin')`, which step 2 updated.
Deploy with the Supabase CLI from a terminal where you are logged in, from a temporary project directory
that holds only the function folders plus a minimal `config.toml` (the repo's `config.toml` has a legacy
`[inbucket]` section the new CLI rejects). Keep each function's existing `verify_jwt` setting.

## 3. Web app

Deploy the web app after steps 1 and 2. Until then the old front end still works against the new database.

## 4. Manual check

1. As a normal user, trigger a group failure (for example create a group that duplicates nothing but
   fails, or open DevTools and throw in the console: `setTimeout(() => { throw new Error("rollout test") })`).
2. Sign in as the super admin → profile menu → **บันทึกข้อผิดพลาด** (`/super-admin/errors`): the entry appears.
3. Sign in as a plain `admin` account: no menu item, `/super-admin/errors` redirects to `/home`, and
   `SELECT count(*) FROM public.app_error_logs` through the API returns 0 rows.
4. As the super admin, confirm an admin-only page (`/admin`) and the group delete still work.

## 5. Rollback

- Demote the account (as `postgres`): `UPDATE public.user_information SET role = 'admin' WHERE role = 'super_admin';`
- `DROP TRIGGER trg_guard_super_admin_role ON public.user_information;`
  `DROP FUNCTION public.guard_super_admin_role();`
  `DROP INDEX public.user_information_single_super_admin;`
- `DROP FUNCTION public.log_app_error(text, text, text, text, text, jsonb, text);`
  `DROP TABLE public.app_error_logs;`
- Restore the previous `role_at_least` body (the `admin`/`editor`/`user` CASE from
  `20260406120000_user_information_signup_profile.sql`).
- The enum value `super_admin` cannot be removed from `app_role`; it simply stays unused.
- Redeploy the previous edge function versions and the previous web build.
