import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL(
    "../supabase/migrations/20261112090000_video_group_evaluations.sql",
    import.meta.url,
  ),
  "utf8",
);

const rpcStart = sql.search(
  /create or replace function public\.create_video_group_evaluation/i,
);
const rpc = rpcStart >= 0 ? sql.slice(rpcStart) : "";

test("creates both tables with RLS enabled", () => {
  for (const table of [
    "video_group_evaluations",
    "video_group_evaluation_sources",
  ]) {
    assert.match(
      sql,
      new RegExp(`create table if not exists public\\.${table}\\b`, "i"),
    );
    assert.match(
      sql,
      new RegExp(
        `alter table public\\.${table}\\s+enable row level security`,
        "i",
      ),
    );
  }
});

test("has no insert/update/delete policy and no group_key column", () => {
  assert.doesNotMatch(sql, /for\s+(insert|update|delete|all)\b/i);
  assert.doesNotMatch(sql, /group_key/i);
});

test("select policies on both tables use can_view_video_group", () => {
  const policies = sql.match(/create policy[\s\S]*?;/gi) ?? [];
  assert.equal(policies.length, 2);
  for (const policy of policies) {
    assert.match(policy, /for select/i);
    assert.match(policy, /to authenticated/i);
    assert.match(policy, /public\.can_view_video_group\(/i);
  }
});

test("can_view_video_group is security definer, stable, admin or source-visible", () => {
  const fn = sql.match(
    /create or replace function public\.can_view_video_group[\s\S]*?\$\$;/i,
  )?.[0];
  assert.ok(fn);
  assert.match(fn, /security definer/i);
  assert.match(fn, /\bstable\b/i);
  assert.match(fn, /row_security = off/i);
  assert.match(fn, /role_at_least\('admin'::public\.app_role\)/i);
  assert.match(fn, /public\.can_view_video_case\(/i);
});

test("unique identity index uses normalized expression parts", () => {
  assert.match(
    sql,
    /create unique index if not exists video_group_evaluations_identity_idx\s+on public\.video_group_evaluations\s*\(\s*public\.normalize_video_case_key_part\(order_number\),\s*group_type,\s*public\.normalize_video_case_key_part\(subject_name\)\s*\)/i,
  );
  assert.doesNotMatch(
    sql,
    /create or replace function public\.normalize_video_case_key_part/i,
  );
});

test("group_type CHECK lists exactly group, round, year_end", () => {
  assert.match(
    sql,
    /check\s*\(\s*group_type in \('group',\s*'round',\s*'year_end'\)\s*\)/i,
  );
});

test("sources table keys, positions and no single-case trigger", () => {
  assert.match(sql, /primary key \(group_id, evaluation_id\)/i);
  assert.match(sql, /unique \(group_id, source_position\)/i);
  assert.match(sql, /video_case_id uuid not null/i);
  assert.doesNotMatch(sql, /create trigger/i);
});

test("RPC is security definer, search_path public, requires auth.uid()", () => {
  assert.ok(rpc);
  assert.match(rpc, /returns public\.video_group_evaluations/i);
  assert.match(rpc, /security definer/i);
  assert.match(rpc, /set search_path = public/i);
  assert.match(rpc, /auth\.uid\(\)/i);
  assert.match(rpc, /requested_by/i);
});

test("RPC validates count, duplicates, ready status and visibility", () => {
  assert.match(rpc, /cardinality\(p_evaluation_ids\)\s*<\s*2/i);
  assert.match(rpc, /count\(distinct/i);
  assert.match(rpc, /document_status\s*(<>|!=)\s*'ready'/i);
  assert.match(rpc, /public\.can_view_video_case\(/i);
  assert.match(rpc, /role_at_least\('admin'::public\.app_role\)/i);
  assert.match(rpc, /current_video_case_role\([^)]*\)\s*=\s*'leader'/i);
});

test("RPC locks source evaluations FOR SHARE before any validation query", () => {
  const lock = rpc.search(
    /perform 1\s+from public\.evaluations\s+where id = any \(p_evaluation_ids\)\s+for share;/i,
  );
  assert.ok(lock >= 0, "lock statement missing");
  const firstValidation = rpc.search(/select count\(\*\)::integer\s+into found_count/i);
  assert.ok(firstValidation >= 0);
  assert.ok(lock < firstValidation, "lock must precede validation");
  for (const marker of [
    /document_status\s*<>\s*'ready'/i,
    /can_view_video_case\(evaluation/i,
    /current_video_case_role\(/i,
  ]) {
    assert.ok(lock < rpc.search(marker));
  }
});

test("RPC verifies inserted source row count equals the id count", () => {
  assert.match(rpc, /get diagnostics\s+inserted_count\s*=\s*row_count/i);
  assert.match(
    rpc,
    /if inserted_count\s*<>\s*cardinality\(p_evaluation_ids\)\s+then\s+raise exception/i,
  );
  const insert = rpc.search(/insert into public\.video_group_evaluation_sources/i);
  assert.ok(insert < rpc.search(/get diagnostics/i));
});

test("RPC snapshots requester identity from user_information", () => {
  assert.match(rpc, /from public\.user_information profile/i);
  assert.match(rpc, /profile\.auth_user_id::text = /i);
  assert.match(rpc, /profile\.full_name/i);
  assert.match(rpc, /profile\.employee_number/i);
});

test("RPC writes group then sources by array order", () => {
  assert.match(rpc, /insert into public\.video_group_evaluations/i);
  assert.match(rpc, /insert into public\.video_group_evaluation_sources/i);
  assert.match(rpc, /with ordinality/i);
});

test("RPC execute granted only to authenticated", () => {
  assert.match(
    sql,
    /revoke all\s+on function public\.create_video_group_evaluation\([^)]*\)\s+from public,\s*anon/i,
  );
  assert.match(
    sql,
    /grant execute\s+on function public\.create_video_group_evaluation\([^)]*\)\s+to authenticated/i,
  );
  assert.doesNotMatch(sql, /grant[^;]*to (anon|public)\b/i);
});

test("document_status starts as draft until a send begins", () => {
  const table = sql.slice(
    sql.search(/create table if not exists public\.video_group_evaluations\b/i),
    sql.search(/create table if not exists public\.video_group_evaluation_sources\b/i),
  );
  assert.match(
    table,
    /document_status text not null default 'draft'\s+check \(document_status in \('draft', 'pending', 'ready', 'failed'\)\)/i,
  );
  assert.doesNotMatch(table, /document_status text not null default 'pending'/i);
});
