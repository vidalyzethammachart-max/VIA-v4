import './loadEnv.js';
import { createClient } from '@supabase/supabase-js';
import { retryDecision, classifyWorkflowResponse } from './requestQueuePolicy.js';
import { createR2DownloadUrl } from './r2Presign.js';
import { setTimeout as sleep } from 'node:timers/promises';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const webhook = process.env.N8N_WEBHOOK_URL;
if (!url || !key || !webhook) throw new Error('Queue worker requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and N8N_WEBHOOK_URL.');
const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const gap = Math.max(60,Number(process.env.AI_QUEUE_GAP_SECONDS || 90));
let stopping = false;
process.on('SIGINT',()=>{stopping=true;});
process.on('SIGTERM',()=>{stopping=true;});
async function rpc(name,args) { const {data,error}=await db.rpc(name,args).abortSignal(AbortSignal.timeout(15000)); if(error) throw new Error(error.message); return data; }
async function documentReady(job) {
  const table=job.target_kind === 'evaluation' ? 'evaluations' : 'video_case_aggregates';
  const {data,error}=await db.from(table).select('document_status,pdf_storage_path,docx_storage_path').eq('id',job.target_id).maybeSingle();
  if(error) throw new Error(error.message);
  return data?.document_status==='ready' && Boolean(data.pdf_storage_path || data.docx_storage_path);
}
async function finish(job,state,delay=gap,error=null) {
  await rpc('finish_ai_request',{p_id:job.id,p_token:job.lease_token,p_state:state,p_delay_seconds:delay,p_error:error});
  console.log(JSON.stringify({jobId:job.id,state,attempt:job.attempts}));
}
async function execute(job) {
  if(await documentReady(job)) return finish(job,'completed');
  const payload={...job.payload,callback_url:`${url}/functions/v1/document-generation-callback`,documents_bucket:'evaluation-documents'};
  if(payload.video?.objectKey) payload.video={...payload.video,downloadUrl:createR2DownloadUrl(payload.video.objectKey)};
  let response, body='';
  try {
    response=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10*60*1000)});
    body=await response.text();
  } catch {
    return finish(job,await documentReady(job)?'completed':'attention',gap,'Delivery outcome unknown. Check n8n execution before retrying.');
  }
  const outcome=classifyWorkflowResponse({status:response.status,documentReady:await documentReady(job)});
  if(outcome==='completed') return finish(job,'completed');
  if(outcome==='awaiting_callback') return finish(job,'awaiting_callback');
  const decision=retryDecision({status:response.status,attempt:job.attempts,retryAfter:response.headers.get('retry-after'),body});
  return finish(job,decision.state,Math.ceil(decision.delayMs/1000)||gap,decision.reason);
}
console.log('VIA central queue worker started (single global lane).');
async function heartbeat() {
  try { await rpc('heartbeat_ai_queue',{}); }
  catch { console.error('Queue heartbeat failed; check database connectivity.'); }
}
await heartbeat();
const heartbeatTimer = setInterval(() => { if(!stopping) void heartbeat(); },30000);
heartbeatTimer.unref();
while(!stopping) {
  try {
    const [job]=await rpc('claim_ai_request',{});
    if(job) await execute(job);
  } catch(error) { console.error('Queue worker error:',error.message); }
  if(process.argv.includes('--once')) break;
  await sleep(5000);
}
clearInterval(heartbeatTimer);
