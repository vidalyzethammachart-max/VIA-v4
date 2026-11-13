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

test("only the database owner can set or clear super_admin", () => {
  assert.match(roleSql, /create trigger trg_guard_super_admin_role\s+before insert or update of role on public\.user_information/i);
  const start = roleSql.search(/create or replace function public\.guard_super_admin_role/i);
  const fn = roleSql.slice(start, roleSql.indexOf("$$;", start) + 3);
  assert.match(fn, /new\.role = 'super_admin'::public\.app_role/i);
  assert.match(fn, /tg_op = 'UPDATE' and old\.role = 'super_admin'::public\.app_role/i);
  assert.match(fn, /current_user not in \('postgres', 'supabase_admin'\)/i);
  assert.match(fn, /raise exception/i);
});

test("the account is assigned by hand, never in a migration", () => {
  for (const sql of [enumSql, roleSql]) {
    assert.doesNotMatch(sql, /phirapon/i);
    assert.doesNotMatch(sql, /update public\.user_information/i);
  }
});
