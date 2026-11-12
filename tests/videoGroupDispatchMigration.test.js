import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name) =>
  readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const sql = (() => {
  try {
    return read("20261112091000_video_group_dispatch.sql");
  } catch {
    return "";
  }
})();
const original = read("20261023090000_direct_document_dispatch.sql");

const norm = (s) => s.replace(/\s+/g, " ").trim();
const fn = (src, name) => {
  const m = src.match(
    new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\b[\\s\\S]*?END \\$\\$;`),
  );
  return m ? m[0] : "";
};
const begin = fn(sql, "begin_document_dispatch");
const finish = fn(sql, "finish_document_dispatch");

test("target_kind check is widened to include group", () => {
  assert.match(
    sql,
    /ALTER TABLE public\.document_dispatches\s+DROP CONSTRAINT IF EXISTS document_dispatches_target_kind_check/i,
  );
  assert.match(
    sql,
    /ADD CONSTRAINT document_dispatches_target_kind_check\s+CHECK \(target_kind IN \('evaluation','aggregate','group'\)\)/i,
  );
});

test("both functions are re-created with CREATE OR REPLACE", () => {
  assert.match(begin, /^CREATE OR REPLACE FUNCTION public\.begin_document_dispatch\(p_kind text,p_id text,p_payload jsonb\)/);
  assert.match(finish, /^CREATE OR REPLACE FUNCTION public\.finish_document_dispatch\(p_kind text,p_id text,p_token uuid,p_state text,p_error text DEFAULT NULL\)/);
});

test("begin group branch locks, authorizes and injects payload", () => {
  assert.match(begin, /ELSIF p_kind='group' THEN[\s\S]*FROM video_group_evaluations WHERE id=p_id::uuid FOR UPDATE/);
  assert.match(begin, /Group evaluation not found/);
  assert.match(begin, /owner_id IS DISTINCT FROM actor AND NOT public\.role_at_least\('admin'::public\.app_role\)/);
  assert.match(begin, /'document_type','video_case_summary','aggregate_id',canonical_id/);
  assert.match(begin, /UPDATE video_group_evaluations SET document_status='pending',document_error=NULL WHERE id=canonical_id::uuid/);
  const groupSelect = begin.match(/ELSIF p_kind='group' THEN([\s\S]*?)ELSIF p_kind='aggregate'/)[1];
  assert.doesNotMatch(groupSelect, /video_case_id/);
});

test("finish group branch updates group status", () => {
  assert.match(finish, /ELSIF p_kind='group' THEN[\s\S]*FROM video_group_evaluations WHERE id=p_id::uuid FOR UPDATE/);
  assert.match(finish, /UPDATE video_group_evaluations SET document_status=CASE WHEN p_state='rejected' THEN 'failed' ELSE 'pending' END/);
  assert.doesNotMatch(finish, /auth\.uid/);
});

test("evaluation and aggregate branches are textually unchanged", () => {
  const ob = norm(fn(original, "begin_document_dispatch"));
  const of = norm(fn(original, "finish_document_dispatch"));
  const nb = norm(begin);
  const nf = norm(finish);
  for (const piece of [
    "IF p_kind='evaluation' THEN SELECT id::text,user_id,video_case_id,",
    "ELSIF p_kind='aggregate' THEN SELECT id::text,requested_by,video_case_id,",
    "IF NOT coalesce(public.current_video_case_role(case_id)='leader' OR public.role_at_least('admin'::public.app_role),false) THEN",
    "secured := secured || jsonb_build_object('document_type','evaluation','evaluation_id',canonical_id::bigint);",
    "UPDATE video_case_aggregates SET document_status='pending',document_error=NULL WHERE id=canonical_id::uuid;",
  ]) {
    assert.ok(ob.includes(piece), `original lacks ${piece}`);
    assert.ok(nb.includes(piece), `new lacks ${piece}`);
  }
  for (const piece of [
    "FROM evaluations WHERE id=p_id::bigint FOR UPDATE;",
    "FROM video_case_aggregates WHERE id=p_id::uuid FOR UPDATE;",
    "UPDATE evaluations SET document_status=CASE WHEN p_state='rejected' THEN 'failed' ELSE 'pending' END,",
  ]) {
    assert.ok(of.includes(piece) && nf.includes(piece), piece);
  }
});

test("trigger syncs group callbacks", () => {
  assert.match(
    sql,
    /CREATE TRIGGER sync_group_dispatch_callback AFTER UPDATE OF document_status,pdf_storage_path,docx_storage_path\s+ON public\.video_group_evaluations FOR EACH ROW EXECUTE FUNCTION public\.sync_document_dispatch_callback\('group'\)/,
  );
});

test("legacy aggregate insert policy is dropped, nothing else is closed", () => {
  assert.match(sql, /drop policy if exists video_case_aggregates_insert_leader on public\.video_case_aggregates/i);
  assert.doesNotMatch(sql, /create policy/i);
  assert.doesNotMatch(sql, /video_case_aggregates_update_leader/i);
  assert.doesNotMatch(sql, /sync_aggregate_dispatch_callback|drop table|drop trigger/i);
});

test("grants are repeated for both functions", () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.begin_document_dispatch\(text,text,jsonb\),\s+public\.finish_document_dispatch\(text,text,uuid,text,text\) FROM PUBLIC,anon,authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.begin_document_dispatch\(text,text,jsonb\) TO authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.finish_document_dispatch\(text,text,uuid,text,text\) TO service_role/);
});
