import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as targets from '../supabase/functions/_shared/documentTarget.js';

function setup() {
  let handler,updated;
  const source=readFileSync(new URL('../supabase/functions/document-generation-callback/index.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const db={from:()=>({update(value){updated=value;return this;},eq(){return this;},select(){return this;},async maybeSingle(){return {data:{id:246},error:null};}})};
  runInNewContext(compiled,{exports:{},Response,console,Deno:{env:{get:()=> 'test-secret'}},require(name){
    if(name.includes('/http/server.ts'))return {serve:fn=>{handler=fn;}};
    if(name.includes('@supabase/supabase-js'))return {createClient:()=>db};
    if(name.endsWith('documentTarget.js'))return targets;
    throw new Error(name);
  }});
  return {call:body=>handler(new Request('https://callback.invalid',{method:'POST',headers:{'content-type':'application/json','x-callback-secret':'test-secret'},body:JSON.stringify(body)})),updated:()=>updated};
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
