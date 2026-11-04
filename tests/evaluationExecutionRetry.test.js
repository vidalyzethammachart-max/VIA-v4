import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const owner = "00000000-0000-4000-8000-000000000001";
const admin = "00000000-0000-4000-8000-000000000003";
const migrations = new URL("../supabase/migrations/", import.meta.url);

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
      document_status text, document_error text, created_at timestamptz,
      pdf_storage_path text, docx_storage_path text);
    INSERT INTO auth.users(id,email,is_admin) VALUES ('${owner}','owner@example.test',false),('${admin}','admin@example.test',true);
    INSERT INTO public.evaluations(id,user_id,order_number,subject_name,document_status,created_at) VALUES
      (1,'${owner}','001','Quota hit','pending',now()-interval '2 hours'),
      (2,'${owner}','002','Done','ready',now()-interval '2 hours'),
      (3,'${owner}','003','Bad video','pending',now()-interval '2 hours');
  `);
  for (const name of ["20261104003925_stuck_evaluation_reports.sql", "20261104011538_evaluation_execution_retry.sql"]) {
    await db.exec(await readFile(new URL(name, migrations), "utf8"));
  }
  return db;
}

const record = (db, evaluation, execution, status, message = "Too Many Requests") =>
  db.query("SELECT public.record_evaluation_execution_failure($1,$2,'wf','Generate Evaluation Analysis',$3,$4) AS r",
    [evaluation, execution, message, status]);

test("a reported n8n failure marks the evaluation failed once per execution", async () => {
  const db = await database();
  const first = await record(db, 1, 3150, 429);
  assert.equal(first.rows[0].r.recorded, true);
  const again = await record(db, 1, 3150, 429);
  assert.equal(again.rows[0].r.recorded, false);
  const row = await db.query("SELECT document_status, document_error FROM public.evaluations WHERE id=1");
  assert.equal(row.rows[0].document_status, "failed");
  assert.match(row.rows[0].document_error, /3150/);
});

test("a failure never overwrites an evaluation whose document is ready", async () => {
  const db = await database();
  const result = await record(db, 2, 3151, 429);
  assert.equal(result.rows[0].r.recorded, false);
  const row = await db.query("SELECT document_status FROM public.evaluations WHERE id=2");
  assert.equal(row.rows[0].document_status, "ready");
});

test("only a 429 failure can be retried, and only once at a time", async () => {
  const db = await database();
  await record(db, 1, 3150, 429);
  await record(db, 3, 3152, 403, "Forbidden");
  await assert.rejects(db.query("SELECT public.begin_evaluation_retry(3,3152,$1)", [admin]), /only for quota \(429\)/);
  const claim = await db.query("SELECT public.begin_evaluation_retry(1,3150,$1) AS r", [admin]);
  assert.equal(claim.rows[0].r.ok, true);
  await assert.rejects(db.query("SELECT public.begin_evaluation_retry(1,3150,$1)", [admin]), /already/);
});

test("a successful retry sets the evaluation back to pending and keeps the new execution", async () => {
  const db = await database();
  await record(db, 1, 3150, 429);
  await db.query("SELECT public.begin_evaluation_retry(1,3150,$1)", [admin]);
  await db.query("SELECT public.finish_evaluation_retry(3150,3160,true,NULL)");
  const evaluation = await db.query("SELECT document_status, document_error FROM public.evaluations WHERE id=1");
  assert.equal(evaluation.rows[0].document_status, "pending");
  assert.equal(evaluation.rows[0].document_error, null);
  const failure = await db.query("SELECT retry_execution_id FROM public.evaluation_execution_failures WHERE execution_id=3150");
  assert.equal(Number(failure.rows[0].retry_execution_id), 3160);
});

test("a rejected retry releases the claim so an admin can try again", async () => {
  const db = await database();
  await record(db, 1, 3150, 429);
  await db.query("SELECT public.begin_evaluation_retry(1,3150,$1)", [admin]);
  await db.query("SELECT public.finish_evaluation_retry(3150,NULL,false,'n8n returned 409')");
  const again = await db.query("SELECT public.begin_evaluation_retry(1,3150,$1) AS r", [admin]);
  assert.equal(again.rows[0].r.ok, true);
});

test("admins see failed 429 evaluations in the stuck list with their execution", async () => {
  const db = await database();
  await record(db, 1, 3150, 429);
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [admin]);
  const listed = await db.query("SELECT * FROM public.list_stuck_evaluations_v2()");
  const row = listed.rows.find((item) => Number(item.evaluation_id) === 1);
  assert.equal(Number(row.failure_execution_id), 3150);
  assert.equal(row.failure_http_status, 429);
  assert.equal(row.document_status, "failed");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [owner]);
  await assert.rejects(db.query("SELECT * FROM public.list_stuck_evaluations_v2()"), /Forbidden/);
});

test("browser roles cannot call the service-only retry functions", async () => {
  const db = await database();
  await db.query("SET ROLE authenticated");
  await assert.rejects(db.query("SELECT public.begin_evaluation_retry(1,3150,$1)", [admin]), /permission denied/);
  await assert.rejects(db.query("SELECT * FROM public.evaluation_execution_failures"), /permission denied/);
});
