import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as targets from '../supabase/functions/_shared/documentTarget.js';

async function setup({auth=true, claim, beginError, finishStatus, upstreamStatus=200, networkError=false, webhook='https://workflow.invalid/hook'}={}) {
  let handler;
  const sent=[];
  const transitions=[];
  const payload={evaluation_id:246,document_type:'evaluation',actor_user_id:'actor',notes:'Keep this'};
  const userClient={auth:{getUser:async()=>({data:{user:auth?{id:'actor'}:null},error:null})},rpc:async(name,args)=>{
    if(name==='enqueue_ai_document')return {data:'old-job',error:null};
    assert.equal(name,'begin_document_dispatch');
    assert.equal(args.p_kind,'evaluation');
    assert.equal(args.p_id,'246');
    return {data:claim||{dispatch:true,status:'pending',token:'lease-token',payload},error:beginError||null};
  }};
  const adminClient={rpc:async(name,args)=>{
    assert.equal(name,'finish_document_dispatch');transitions.push(args);
    return {data:{status:finishStatus||(args.p_state==='rejected'?'failed':args.p_state==='unknown'?'unknown':'pending')},error:null};
  }};
  let shared={};
  try { shared=await import('../supabase/functions/_shared/directForward.js'); } catch(e) { if(e.code!=='ERR_MODULE_NOT_FOUND')throw e; }
  const source=await readFile(new URL('../supabase/functions/forward-to-n8n/index.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',N8N_WEBHOOK_URL:webhook};
  runInNewContext(compiled,{
    exports:{},Response,Request,URL,AbortSignal,TextEncoder,console,Deno:{env:{get:key=>env[key]}},
    fetch:async(url,options)=>{sent.push({url,options});if(networkError)throw new Error('network timeout');return new Response('Accepted',{status:upstreamStatus});},
    require(name){
      if(name.includes('/http/server.ts'))return {serve:fn=>{handler=fn;}};
      if(name.includes('@supabase/supabase-js'))return {createClient:(_url,key)=>key==='service'?adminClient:userClient};
      if(name.endsWith('documentTarget.js'))return targets;
      if(name.endsWith('directForward.js'))return shared;
      throw new Error(`Unexpected import ${name}`);
    },
  });
  const request=async(body={evaluation_id:246},authorization='Bearer user-token')=>handler(new Request('https://edge.invalid',{method:'POST',headers:{'content-type':'application/json',authorization},body:JSON.stringify(body)}));
  return {request,sent,transitions};
}

test('authorized submissions reach n8n immediately with server-owned callback settings',async()=>{
  const {request,sent,transitions}=await setup();
  const response=await request([{evaluation_id:246,callback_url:'https://evil.invalid',callback_secret:'forged'}]);
  assert.equal(response.status,202);
  assert.equal(sent.length,1,'acknowledgement requires an actual direct webhook request');
  assert.equal(sent[0].url,'https://workflow.invalid/hook');
  const body=JSON.parse(sent[0].options.body);
  assert.deepEqual(body,{evaluation_id:246,document_type:'evaluation',actor_user_id:'actor',notes:'Keep this',callback_url:'https://project.supabase.co/functions/v1/document-generation-callback',documents_bucket:'evaluation-documents'});
  assert.equal(transitions[0].p_state,'accepted');
  assert.equal((await response.json()).status,'pending');
});
test('missing/invalid login and unauthorized targets never reach n8n',async()=>{
  for(const options of [{auth:false},{beginError:{code:'42501',message:'Forbidden'}}]){
    const {request,sent}=await setup(options);
    const response=await request();
    assert.ok([401,403].includes(response.status));assert.equal(sent.length,0);
  }
});
test('mixed or oversized payloads are rejected before webhook delivery',async()=>{
  const {request,sent}=await setup();
  assert.equal((await request({evaluation_id:246,aggregate_id:'00000000-0000-4000-8000-000000000004'})).status,400);
  assert.equal((await request({evaluation_id:246,notes:'x'.repeat(2100000)})).status,413);
  assert.equal(sent.length,0);
});
test('already accepted or ready documents are not forwarded again',async()=>{
  for(const status of ['pending','ready']){
    const {request,sent}=await setup({claim:{dispatch:false,status}});
    const response=await request();assert.equal((await response.json()).status,status);assert.equal(sent.length,0);
  }
});
test('failed or unknown deliveries cannot be reported as accepted duplicates',async()=>{
  for(const status of ['failed','unknown','dispatching']){
    const {request,sent}=await setup({claim:{dispatch:false,status}});
    const response=await request();assert.equal(response.status,409);assert.equal((await response.json()).ok,false);assert.equal(sent.length,0);
  }
});
test('video URL must address the claimed R2 object rather than an unrelated signed object',async()=>{
  const {request,sent}=await setup();
  const response=await request({evaluation_id:246,hasVideo:true,video:{objectKey:'video-submissions/actor/a.mp4',downloadUrl:'https://account.r2.cloudflarestorage.com/bucket/video-submissions/other/b.mp4?signature=private'}});
  assert.equal(response.status,400);assert.equal(sent.length,0);
});
test('a rejected webhook fails submission instead of reporting queued success',async()=>{
  const {request,transitions}=await setup({upstreamStatus:500});
  const response=await request();assert.equal(response.status,502);assert.equal((await response.json()).ok,false);assert.equal(transitions[0].p_state,'unknown');
});
test('an explicit webhook refusal is recorded as rejected',async()=>{
  const {request,transitions}=await setup({upstreamStatus:401});
  assert.equal((await request()).status,502);assert.equal(transitions[0].p_state,'rejected');
});
test('network failure is retained as ambiguous delivery without retry',async()=>{
  const {request,sent,transitions}=await setup({networkError:true});
  const response=await request();assert.equal(response.status,504);assert.equal(sent.length,1);assert.equal(transitions[0].p_state,'unknown');
});
test('a completed callback wins over a late webhook failure',async()=>{
  const {request}=await setup({upstreamStatus:500,finishStatus:'ready'});
  const response=await request();assert.equal(response.status,200);assert.equal((await response.json()).status,'ready');
});
test('missing webhook configuration fails before a dispatch claim',async()=>{
  const {request,sent,transitions}=await setup({webhook:''});
  assert.equal((await request()).status,503);assert.equal(sent.length,0);assert.equal(transitions.length,0);
});
