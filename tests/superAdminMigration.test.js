import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name) =>
  readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const enumSql = read("20261113100000_super_admin_enum.sql");
const roleSql = read("20261113101000_super_admin_role.sql");

const statements = (sql) =>
  sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

test("the enum file only adds the value, so nothing uses it in the same transaction", () => {
  assert.deepEqual(statements(enumSql), [
    "ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin'",
  ]);
});

test("role_at_least keeps the old branches and lets super_admin satisfy every role", () => {
  const start = roleSql.search(/create or replace function public\.role_at_least/i);
  assert.ok(start >= 0, "role_at_least is not redefined");
  const fn = roleSql.slice(start, roleSql.indexOf("$$;", start) + 3);
  assert.match(fn, /security definer/i);
  assert.match(fn, /set search_path = public/i);
  assert.match(fn, /set row_security = off/i);
  assert.match(fn, /when 'super_admin'::public\.app_role then true/i);
  // An admin satisfies everything except a super_admin requirement (same matrix as roles.ts).
  assert.match(fn, /when 'admin'::public\.app_role then required_role <> 'super_admin'::public\.app_role/i);
  assert.match(fn, /when 'editor'::public\.app_role then required_role in \('editor'::public\.app_role, 'user'::public\.app_role\)/i);
  assert.match(fn, /when 'user'::public\.app_role then required_role = 'user'::public\.app_role/i);
  assert.match(roleSql, /grant execute on function public\.role_at_least\(public\.app_role\) to authenticated/i);
});

test("is_super_admin compares the current user's role", () => {
  assert.match(
    roleSql,
    /create or replace function public\.is_super_admin\(\)[\s\S]*?current_user_role\(\)\s*=\s*'super_admin'::public\.app_role/i,
  );
  assert.match(roleSql, /grant execute on function public\.is_super_admin\(\) to authenticated/i);
});

test("at most one super admin can exist", () => {
  assert.match(
    roleSql,
    /create unique index if not exists user_information_single_super_admin\s+on public\.user_information \(role\)\s+where role = 'super_admin'::public\.app_role/i,
  );
});

test("only the database owner session can set, clear or delete the super_admin row", () => {
  assert.match(roleSql, /create trigger trg_guard_super_admin_role\s+before insert or update of role or delete on public\.user_information/i);
  const start = roleSql.search(/create or replace function public\.guard_super_admin_role/i);
  const fn = roleSql.slice(start, roleSql.indexOf("$$;", start) + 3);
  assert.match(fn, /new\.role = 'super_admin'::public\.app_role/i);
  assert.match(fn, /tg_op = 'UPDATE' and new\.role is distinct from old\.role and \(\s*new\.role = 'super_admin'::public\.app_role or old\.role = 'super_admin'::public\.app_role/i);
  assert.match(fn, /tg_op = 'DELETE' and old\.role = 'super_admin'::public\.app_role/i);
  // session_user survives SECURITY DEFINER functions such as review_role_request; current_user does not.
  assert.match(fn, /session_user not in \('postgres', 'supabase_admin'\)/i);
  assert.doesNotMatch(fn, /current_user/i);
  assert.match(fn, /raise exception/i);
  assert.match(fn, /return old/i);
});

test("the role request flow cannot be used to take or strip super_admin", () => {
  assert.match(
    roleSql,
    /alter table public\.role_requests\s+add constraint role_requests_no_super_admin\s+check \(requested_role <> 'super_admin'::public\.app_role\)/i,
  );
  const start = roleSql.search(/create or replace function public\.review_role_request/i);
  assert.ok(start >= 0, "review_role_request is not redefined");
  const fn = roleSql.slice(start, roleSql.indexOf("$$;", start) + 3);
  assert.match(fn, /security definer/i);
  assert.match(fn, /set search_path = public/i);
  assert.match(fn, /requested_role = 'super_admin'::public\.app_role/i);
  assert.match(fn, /ui\.role = 'super_admin'::public\.app_role/i);
  assert.match(fn, /role_at_least\('admin'::public\.app_role\)/i);
  assert.match(roleSql, /grant execute on function public\.review_role_request\(uuid, text\) to authenticated/i);
});

test("the account is assigned by hand, never in a migration", () => {
  for (const sql of [enumSql, roleSql]) {
    assert.doesNotMatch(sql, /phirapon/i);
    assert.doesNotMatch(sql, /set role = 'super_admin'/i);
  }
});

test("the rollout assigns the account only after the edge functions and web app are deployed", () => {
  const doc = readFileSync(
    new URL("../docs/superpowers/plans/2026-11-13-super-admin-rollout.md", import.meta.url),
    "utf8",
  );
  const assign = doc.indexOf("UPDATE public.user_information SET role = 'super_admin'");
  assert.ok(assign > 0, "assignment SQL missing");
  assert.ok(assign > doc.indexOf("## 2. Edge functions"), "assign before the edge deploy");
  assert.ok(assign > doc.indexOf("## 3. Web app"), "assign before the web deploy");
  assert.ok(assign > doc.indexOf("20261113102000_app_error_logs.sql"), "assign before the error log migration");
});

test("the older role guard lets the database owner (SQL Editor) change roles", () => {
  const sql = read("20261113103000_role_guard_owner_bypass.sql");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.guard_user_role_changes/);
  assert.match(sql, /session_user IN \('postgres', 'supabase_admin'\)/);
  assert.match(sql, /auth\.role\(\) = 'service_role'/);
  assert.match(sql, /Only admins can change user roles/);
});
