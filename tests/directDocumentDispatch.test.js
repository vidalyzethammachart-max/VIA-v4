import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { actor, other, caseId, aggregateId, migrations, documentDatabase } from './helpers/documentDatabase.js';

test('direct dispatch authorizes each document and needs no scheduler', async t => {
  const db = await documentDatabase();
  try {
    const migration = await readFile(new URL('20261023090000_direct_document_dispatch.sql', migrations), 'utf8').catch(e => {
      if (e.code === 'ENOENT') return '';
      throw e;
    });
    await db.exec(migration);
    const begin = async (kind='evaluation', id='246', payload={}) =>
      (await db.query('SELECT public.begin_document_dispatch($1,$2,$3::jsonb) AS result', [kind,id,JSON.stringify(payload)])).rows[0].result;
    const finish = async (token, state, error=null) => {
      await db.exec('SET LOCAL ROLE service_role');
      const result = (await db.query('SELECT public.finish_document_dispatch($1,$2,$3,$4,$5) AS result', ['evaluation','246',token,state,error])).rows[0].result;
      await db.exec('SET LOCAL ROLE authenticated');
      return result;
    };
    async function scenario(name, fn) {
      await t.test(name, async () => {
        await db.exec(`BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${actor}',true)`);
        try { await fn(); } finally { await db.exec('ROLLBACK'); }
      });
    }
    await scenario('different documents start immediately while a repeated target is suppressed', async () => {
      let first, failure;
      try { first = await begin(); } catch (error) { failure=error.message; }
      assert.equal(failure, undefined, 'a document must be authorized for immediate dispatch');
      assert.equal(first.dispatch, true);
      assert.equal((await begin('evaluation','247')).dispatch, true);
      assert.equal((await begin('evaluation','0246')).dispatch, false);
      await db.exec('RESET ROLE');
      assert.equal((await db.query('SELECT count(*)::int AS n FROM ai_request_queue')).rows[0].n, 0);
    });
    await scenario('canonical IDs, actor, and callback configuration cannot be forged', async () => {
      const result = await begin('evaluation','0246', {evaluation_id:999,aggregate_id:aggregateId,document_type:'video_case_summary',actor_user_id:other,callback_url:'https://evil.invalid',callback_secret:'forged',document_callback_secret:'forged',documents_bucket:'other',notes:'Keep this'});
      assert.deepEqual(result.payload, {evaluation_id:246,document_type:'evaluation',actor_user_id:actor,notes:'Keep this'});
      const summary = await begin('aggregate',aggregateId,{evaluation_id:999,source_evaluation_ids:[246]});
      assert.deepEqual(summary.payload,{aggregate_id:aggregateId,document_type:'video_case_summary',actor_user_id:actor,source_evaluation_ids:[246]});
    });
    await scenario('another user cannot dispatch an evaluation or a leader summary', async () => {
      await assert.rejects(begin('evaluation','999'),{code:'42501'});
    });
    await scenario('case members cannot dispatch a summary', async () => {
      await db.exec(`SELECT set_config('request.jwt.claim.sub','${other}',true)`);
      await assert.rejects(begin('aggregate',aggregateId),{code:'42501'});
    });
    await scenario('trashed cases and foreign video objects are rejected', async () => {
      await assert.rejects(begin('evaluation','246',{hasVideo:true,video:{objectKey:`video-submissions/${other}/clip.mp4`}}),{code:'42501'});
    });
    await scenario('trash state prevents new dispatch', async () => {
      await db.exec(`RESET ROLE; UPDATE video_cases SET deleted_at=now() WHERE id='${caseId}'; SET LOCAL ROLE authenticated`);
      await assert.rejects(begin(), /trash/i);
    });
    await scenario('an admin can dispatch another owners evaluation', async () => {
      await db.exec(`RESET ROLE; UPDATE auth.users SET is_admin=true WHERE id='${actor}'; SET LOCAL ROLE authenticated`);
      assert.equal((await begin('evaluation','999')).dispatch,true);
    });
    await scenario('a callback completion survives a late webhook rejection', async () => {
      const first = await begin();
      await db.exec("RESET ROLE; UPDATE evaluations SET document_status='ready',pdf_storage_path='246.pdf' WHERE id=246; SET LOCAL ROLE authenticated");
      assert.equal((await finish(first.token,'rejected','Webhook failed')).status,'ready');
      assert.equal((await begin()).status,'ready');
      await db.exec('RESET ROLE');
      const row=(await db.query('SELECT document_status,document_error FROM evaluations WHERE id=246')).rows[0];
      assert.deepEqual(row,{document_status:'ready',document_error:null});
    });
    await scenario('unknown delivery remains pending and cannot be replayed automatically', async () => {
      const first=await begin();
      assert.equal((await finish(first.token,'unknown','Check original execution')).status,'unknown');
      assert.equal((await begin()).status,'unknown');
      assert.equal((await begin()).dispatch,false);
      await db.exec('RESET ROLE');
      assert.equal((await db.query('SELECT document_status FROM evaluations WHERE id=246')).rows[0].document_status,'pending');
    });
    await scenario('definite rejection is failed and does not silently resend', async () => {
      const first=await begin();
      assert.equal((await finish(first.token,'rejected','Workflow rejected')).status,'failed');
      assert.equal((await begin()).dispatch,false);
    });
    await scenario('authenticated users cannot forge successful dispatch completion', async () => {
      const first=await begin();
      await assert.rejects(db.query('SELECT public.finish_document_dispatch($1,$2,$3,$4,$5)',['evaluation','246',first.token,'accepted',null]),{code:'42501'});
    });
    await scenario('legacy queues remain historical and cannot be claimed or replayed', async () => {
      await db.exec(`RESET ROLE; INSERT INTO ai_request_queue(target_kind,target_id,requested_by,payload) VALUES ('evaluation','246','${actor}','{}'); SET LOCAL ROLE service_role`);
      assert.equal((await db.query('SELECT * FROM public.claim_ai_request()')).rows.length,0);
      await db.exec('SET LOCAL ROLE authenticated');
      await assert.rejects(begin(), /legacy|existing|previous/i);
    });
    await scenario('old authenticated enqueue and retry entry points are disabled', async () => {
      await assert.rejects(db.query('SELECT public.enqueue_ai_document($1,$2,$3)',['evaluation','246',{}]), /disabled|retired|permission/i);
    });
    await scenario('old retry entry point cannot revive a historical job', async () => {
      await assert.rejects(db.query('SELECT public.retry_ai_request($1,$2)',['00000000-0000-4000-8000-000000000005',true]),{code:'42501'});
    });
  } finally { await db.close(); }
});
