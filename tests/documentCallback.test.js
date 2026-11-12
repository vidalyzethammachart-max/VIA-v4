import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as targets from '../supabase/functions/_shared/documentTarget.js';

function setup({groupIds=[]}={}) {
  let handler,updated,table;
  const source=readFileSync(new URL('../supabase/functions/document-generation-callback/index.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const db={from:t=>{const q={mode:'select',update(value){updated=value;q.mode='update';table=t;return q;},eq(_c,id){q.id=id;return q;},select(){return q;},async maybeSingle(){if(q.mode==='select')return {data:groupIds.includes(q.id)&&t==='video_group_evaluations'?{id:q.id}:null,error:null};return {data:{id:q.id??246},error:null};}};return q;}};
  runInNewContext(compiled,{exports:{},Response,console,Deno:{env:{get:()=> 'test-secret'}},require(name){
    if(name.includes('/http/server.ts'))return {serve:fn=>{handler=fn;}};
    if(name.includes('@supabase/supabase-js'))return {createClient:()=>db};
    if(name.endsWith('documentTarget.js'))return targets;
    throw new Error(name);
  }});
  return {call:body=>handler(new Request('https://callback.invalid',{method:'POST',headers:{'content-type':'application/json','x-callback-secret':'test-secret'},body:JSON.stringify(body)})),updated:()=>updated,table:()=>table};
}
test('a Google Doc ID alone cannot mark a downloadable document ready',async()=>{
  const {call,updated}=setup();
  assert.equal((await call({evaluation_id:246,docId:'google-doc-only'})).status,400);
  assert.equal(updated(),undefined);
});
test('a stored PDF artifact completes the correct document target',async()=>{
  const {call,updated}=setup();
  const response=await call({evaluation_id:246,pdf_path:'evaluations/246/result.pdf'});
  assert.equal(response.status,200);assert.equal((await response.json()).evaluationId,246);
  assert.equal(updated().document_status,'ready');assert.equal(updated().pdf_storage_path,'evaluations/246/result.pdf');
});

test('a group callback updates the group table and echoes both ids',async()=>{
  const G='71abc689-868a-4bc7-a0b0-000000000001';
  const {call,updated,table}=setup({groupIds:[G]});
  const response=await call({document_type:'video_case_summary',aggregate_id:G,pdf_path:'groups/g.pdf'});
  assert.equal(response.status,200);
  const json=await response.json();
  assert.equal(json.aggregateId,G);assert.equal(json.groupId,G);assert.equal(json.evaluationId,null);
  assert.equal(table(),'video_group_evaluations');assert.equal(updated().document_status,'ready');
});
test('a legacy aggregate callback still updates the aggregate table',async()=>{
  const A='61abc689-868a-4bc7-a0b0-000000000000';
  const {call,table}=setup();
  const json=await (await call({document_type:'video_case_summary',aggregate_id:A,pdf_path:'a.pdf'})).json();
  assert.equal(json.aggregateId,A);assert.equal(json.groupId??null,null);assert.equal(table(),'video_case_aggregates');
});
