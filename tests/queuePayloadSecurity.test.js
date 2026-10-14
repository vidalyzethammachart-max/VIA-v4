import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const actor = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const caseId = '00000000-0000-4000-8000-000000000003';
const aggregateId = '00000000-0000-4000-8000-000000000004';

test('queue RPC binds persisted payloads to the authorized document target', async t => {
  const db = new PGlite();
  try {
    // Minimal local schema; the actual queue functions come from production migrations.
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, is_admin boolean DEFAULT false);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
        'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      CREATE TYPE public.app_role AS ENUM ('user','editor','admin');
      CREATE FUNCTION public.role_at_least(public.app_role) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS
        'SELECT coalesce((SELECT is_admin FROM auth.users WHERE id=auth.uid()),false)';
      CREATE TABLE public.video_cases(id uuid PRIMARY KEY, deleted_at timestamptz);
      CREATE TABLE public.video_case_members(video_case_id uuid, user_id uuid, role text);
      CREATE FUNCTION public.current_video_case_role(uuid) RETURNS text LANGUAGE sql AS
        'SELECT role FROM public.video_case_members WHERE video_case_id=$1 AND user_id=auth.uid()';
      CREATE TABLE public.evaluations(id bigint PRIMARY KEY,user_id uuid,video_case_id uuid,
        document_status text,pdf_storage_path text,docx_storage_path text);
      CREATE TABLE public.video_case_aggregates(id uuid PRIMARY KEY,requested_by uuid,video_case_id uuid,
        document_status text,pdf_storage_path text,docx_storage_path text);
      INSERT INTO auth.users(id) VALUES ('${actor}'),('${other}');
      INSERT INTO public.video_cases(id) VALUES ('${caseId}');
      INSERT INTO public.video_case_members VALUES ('${caseId}','${actor}','leader');
      INSERT INTO public.evaluations VALUES (246,'${actor}','${caseId}','pending',NULL,NULL),
        (999,'${other}','${caseId}','pending',NULL,NULL);
      INSERT INTO public.video_case_aggregates VALUES ('${aggregateId}','${actor}','${caseId}','pending',NULL,NULL);
    `);
    const migrations = new URL('../supabase/migrations/', import.meta.url);
    await db.exec(await readFile(new URL('20261014130000_central_request_queue.sql', migrations), 'utf8'));
    for (const name of (await readdir(migrations)).filter(name => name.endsWith('_secure_queue_payload.sql') || name.endsWith('_queue_health.sql')).sort()) {
      await db.exec(await readFile(new URL(name, migrations), 'utf8'));
    }

    async function scenario(name, run) {
      await t.test(name, async () => {
        await db.exec(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${actor}',true);`);
        try { await run(); } finally { await db.exec('ROLLBACK'); }
      });
    }
    async function enqueue(kind, id, payload) {
      const result = await db.query('SELECT public.enqueue_ai_document($1,$2,$3::jsonb) AS id', [kind,id,JSON.stringify(payload)]);
      return result.rows[0].id;
    }
    async function stored(id) {
      // Payloads are intentionally not readable by authenticated users.
      await db.exec('RESET ROLE');
      const result = await db.query('SELECT payload,target_id FROM public.ai_request_queue WHERE id=$1', [id]);
      await db.exec('SET LOCAL ROLE authenticated');
      return result.rows[0];
    }

    await scenario('forged individual target, actor and callback fields are replaced or removed', async () => {
      const id = await enqueue('evaluation','246', {
        evaluation_id:999,aggregate_id:aggregateId,document_type:'video_case_summary',actor_user_id:other,
        callback_url:'https://untrusted.invalid',callback_secret:'untrusted',document_callback_secret:'untrusted',
        documents_bucket:'untrusted',notes:'Keep the review content',
      });
      assert.deepEqual((await stored(id)).payload, {
        evaluation_id:246,document_type:'evaluation',actor_user_id:actor,notes:'Keep the review content',
      });
    });
    await scenario('summary payload contains only the authorized aggregate identity', async () => {
      const id = await enqueue('aggregate',aggregateId, {
        evaluation_id:999,aggregate_id:caseId,document_type:'evaluation',actor_user_id:other,source_evaluation_ids:[246],
      });
      assert.deepEqual((await stored(id)).payload, {
        aggregate_id:aggregateId,document_type:'video_case_summary',actor_user_id:actor,source_evaluation_ids:[246],
      });
    });
    await scenario('a forged payload does not grant access to another users evaluation', async () => {
      await assert.rejects(enqueue('evaluation','999',{evaluation_id:246}), {code:'42501'});
    });
    await scenario('a case member cannot enqueue an aggregate', async () => {
      await db.exec(`SELECT set_config('request.jwt.claim.sub','${other}',true)`);
      await assert.rejects(enqueue('aggregate',aggregateId,{actor_user_id:actor}), {code:'42501'});
    });
    await scenario('equivalent target spellings cannot create duplicate jobs or overwrite content', async () => {
      const first = await enqueue('evaluation','0246',{notes:'Original'});
      const second = await enqueue('evaluation','246',{notes:'Replacement'});
      assert.equal(second,first);
      const saved = await stored(first);
      assert.equal(saved.target_id,'246');
      assert.equal(saved.payload.notes,'Original');
      assert.equal(saved.payload.evaluation_id,246);
    });
    await scenario('queue health reports an offline worker without exposing document data', async () => {
      const result = await db.query('SELECT * FROM public.get_ai_queue_health()');
      assert.deepEqual(result.rows,[{worker_online:false,paused:false}]);
    });
    await scenario('another requester can see a global pause without seeing the blocking job', async () => {
      const id = await enqueue('evaluation','246',{});
      await db.exec('RESET ROLE');
      await db.query("UPDATE public.ai_request_queue SET state='attention' WHERE id=$1",[id]);
      await db.exec(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${other}',true)`);
      assert.deepEqual((await db.query('SELECT id FROM public.ai_request_queue')).rows,[]);
      assert.deepEqual((await db.query('SELECT * FROM public.get_ai_queue_health()')).rows,[{worker_online:false,paused:true}]);
    });
    await scenario('only the service worker can update its heartbeat', async () => {
      await assert.rejects(db.query('SELECT public.heartbeat_ai_queue()'),{code:'42501'});
    });
    await scenario('a service heartbeat makes worker health online', async () => {
      await db.exec('SET LOCAL ROLE service_role');
      await db.query('SELECT public.heartbeat_ai_queue()');
      await db.exec('SET LOCAL ROLE authenticated');
      assert.deepEqual((await db.query('SELECT * FROM public.get_ai_queue_health()')).rows,[{worker_online:true,paused:false}]);
    });
    await scenario('an expired heartbeat reports the worker offline', async () => {
      await db.exec("RESET ROLE; UPDATE public.ai_queue_control SET last_heartbeat_at=now()-interval '2 minutes'; SET LOCAL ROLE authenticated");
      assert.deepEqual((await db.query('SELECT * FROM public.get_ai_queue_health()')).rows,[{worker_online:false,paused:false}]);
    });
  } finally {
    await db.close();
  }
});
