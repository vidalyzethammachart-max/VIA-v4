import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const admin = "00000000-0000-4000-8000-000000000003";
const migration = new URL("../supabase/migrations/20261104090000_stuck_evaluation_reports.sql", import.meta.url);

async function database() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, is_admin boolean DEFAULT false);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    CREATE TYPE public.app_role AS ENUM ('user','editor','admin');
    CREATE FUNCTION public.role_at_least(public.app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS
      'SELECT coalesce((SELECT is_admin FROM auth.users WHERE id=auth.uid()),false)';
    CREATE TABLE public.evaluations(id bigint PRIMARY KEY, user_id uuid, order_number text, subject_name text,
      document_status text, document_error text, created_at timestamptz);
    INSERT INTO auth.users(id,email,is_admin) VALUES
      ('${owner}','owner@example.test',false),('${other}','other@example.test',false),('${admin}','admin@example.test',true);
    INSERT INTO public.evaluations VALUES
      (1,'${owner}','001','Old pending','pending',NULL,now()-interval '45 minutes'),
      (2,'${owner}','002','New pending','pending',NULL,now()-interval '5 minutes'),
      (3,'${owner}','003','Ready','ready',NULL,now()-interval '2 hours'),
      (4,'${other}','004','Other pending','pending','timeout',now()-interval '3 hours');
  `);
  await db.exec(await readFile(migration, "utf8"));
  return db;
}

async function as(db, user, sql, params = []) {
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [user]);
  return db.query(sql, params);
}

test("the owner can report an evaluation pending for 30 minutes, once", async () => {
  const db = await database();
  const first = await as(db, owner, "SELECT public.report_stuck_evaluation(1,'still waiting') AS r");
  assert.equal(first.rows[0].r.created, true);
  const again = await as(db, owner, "SELECT public.report_stuck_evaluation(1,NULL) AS r");
  assert.equal(again.rows[0].r.created, false);
  const count = await db.query("SELECT count(*)::int AS n FROM public.evaluation_stuck_reports");
  assert.equal(count.rows[0].n, 1);
});

test("reports are refused for recent, finished, or someone else's evaluations", async () => {
  const db = await database();
  await assert.rejects(as(db, owner, "SELECT public.report_stuck_evaluation(2,NULL)"), /less than 30 minutes/);
  await assert.rejects(as(db, owner, "SELECT public.report_stuck_evaluation(3,NULL)"), /not processing/);
  await assert.rejects(as(db, owner, "SELECT public.report_stuck_evaluation(4,NULL)"), /Forbidden/);
  await assert.rejects(as(db, "", "SELECT public.report_stuck_evaluation(1,NULL)"), /Authentication required/);
});

test("the owner can see whether their report is open", async () => {
  const db = await database();
  const before = await as(db, owner, "SELECT public.get_evaluation_stuck_report(1) AS r");
  assert.equal(before.rows[0].r.reported, false);
  await as(db, owner, "SELECT public.report_stuck_evaluation(1,NULL)");
  const after = await as(db, owner, "SELECT public.get_evaluation_stuck_report(1) AS r");
  assert.equal(after.rows[0].r.reported, true);
  await assert.rejects(as(db, other, "SELECT public.get_evaluation_stuck_report(1)"), /Forbidden/);
});

test("only admins list stuck evaluations, including unreported ones", async () => {
  const db = await database();
  await as(db, owner, "SELECT public.report_stuck_evaluation(1,'still waiting')");
  await assert.rejects(as(db, owner, "SELECT * FROM public.list_stuck_evaluations()"), /Forbidden/);
  const listed = await as(db, admin, "SELECT * FROM public.list_stuck_evaluations()");
  assert.deepEqual(listed.rows.map((row) => Number(row.evaluation_id)), [4, 1]);
  const reported = listed.rows.find((row) => Number(row.evaluation_id) === 1);
  assert.equal(reported.owner_email, "owner@example.test");
  assert.equal(reported.report_note, "still waiting");
  assert.equal(listed.rows.find((row) => Number(row.evaluation_id) === 4).report_id, null);
});

test("an admin resolves an open report, which then leaves the list once the job is no longer pending", async () => {
  const db = await database();
  await as(db, owner, "SELECT public.report_stuck_evaluation(1,NULL)");
  await assert.rejects(as(db, owner, "SELECT public.resolve_stuck_evaluation_report(1)"), /Forbidden/);
  const resolved = await as(db, admin, "SELECT public.resolve_stuck_evaluation_report(1) AS r");
  assert.equal(resolved.rows[0].r.resolved, true);
  const open = await db.query("SELECT count(*)::int AS n FROM public.evaluation_stuck_reports WHERE resolved_at IS NULL");
  assert.equal(open.rows[0].n, 0);
  await db.query("UPDATE public.evaluations SET document_status='ready' WHERE id=1");
  const listed = await as(db, admin, "SELECT * FROM public.list_stuck_evaluations()");
  assert.deepEqual(listed.rows.map((row) => Number(row.evaluation_id)), [4]);
});

test("browser roles cannot touch the report table directly", async () => {
  const db = await database();
  await db.query("SET ROLE authenticated");
  await assert.rejects(db.query("SELECT * FROM public.evaluation_stuck_reports"), /permission denied/);
});
