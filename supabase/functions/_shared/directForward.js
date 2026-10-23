import { resolveDocumentTarget } from './documentTarget.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status, body) => Response.json(body, {status, headers:corsHeaders});
const unknownMessage = 'Delivery outcome unknown. Check the original n8n execution before resubmitting.';

function validateVideo(payload) {
  if (!payload?.hasVideo && payload?.video == null) return;
  const video = payload.video;
  if (!video || typeof video.objectKey !== 'string' || typeof video.downloadUrl !== 'string') {
    throw new Error('An uploaded R2 video object and download URL are required.');
  }
  const url = new URL(video.downloadUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !/^[a-z0-9-]+\.r2\.cloudflarestorage\.com$/.test(url.hostname) ||
      !decodeURIComponent(url.pathname).endsWith(`/${video.objectKey}`)) {
    throw new Error('Video download URL must address its uploaded R2 object.');
  }
}

export function createForwardHandler({createClient, env, fetchImpl = globalThis.fetch}) {
  return async function handleForward(req) {
    if (req.method === 'OPTIONS') return new Response('ok', {headers:corsHeaders});
    if (req.method !== 'POST') return reply(405, {ok:false,error:'Method not allowed'});
    const authorization = req.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) return reply(401, {ok:false,error:'Authentication required'});
    const url=env('SUPABASE_URL'), anonKey=env('SUPABASE_ANON_KEY'), serviceKey=env('SUPABASE_SERVICE_ROLE_KEY');
    const webhook=env('N8N_WEBHOOK_URL');
    if (!url || !anonKey || !serviceKey || !webhook) return reply(503, {ok:false,error:'Document dispatch is not configured.'});
    try {
      if (new URL(webhook).protocol !== 'https:') throw new Error('Invalid webhook');
    } catch { return reply(503, {ok:false,error:'Document dispatch is not configured.'}); }
    const client=createClient(url,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
    let user;
    try {
      const auth=await client.auth.getUser();
      if (auth.error || !auth.data?.user) return reply(401, {ok:false,error:'Unauthorized'});
      user=auth.data.user;
    } catch { return reply(503, {ok:false,error:'Unable to verify authentication.'}); }
    let payload,target;
    try {
      const raw=await req.text();
      if (new TextEncoder().encode(raw).length>2097152) return reply(413, {ok:false,error:'Document payload is too large.'});
      const body=JSON.parse(raw);
      payload=Array.isArray(body) && body.length===1 ? body[0] : body;
      if (!payload || Array.isArray(payload) || typeof payload!=='object') throw new Error('One document payload is required.');
      target=resolveDocumentTarget(payload);
      validateVideo(payload);
    } catch (error) { return reply(400, {ok:false,error:error.message || 'Invalid document payload'}); }
    const identities={evaluationId:target.kind==='evaluation'?target.id:null,aggregateId:target.kind==='aggregate'?target.id:null};
    let claim;
    try {
      const result=await client.rpc('begin_document_dispatch',{p_kind:target.kind,p_id:String(target.id),p_payload:{...payload,actor_user_id:user.id}});
      if (result.error) return reply(result.error.code==='42501'?403:result.error.code==='55000'?409:400,{ok:false,error:result.error.message});
      claim=result.data;
    } catch { return reply(503,{ok:false,error:'Unable to authorize document dispatch.'}); }
    if (!claim?.dispatch) {
      const status=claim?.status;
      if (status==='ready' || status==='pending') return reply(status==='ready'?200:202,{ok:true,status,...identities});
      return reply(409,{ok:false,status:status || 'unknown',...identities,error:status==='failed'?'The previous request failed. Inspect its execution before resubmitting.':unknownMessage});
    }
    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    async function finish(state,error=null) {
      const result=await admin.rpc('finish_document_dispatch',{p_kind:target.kind,p_id:String(target.id),p_token:claim.token,p_state:state,p_error:error});
      if (result.error || !result.data) throw new Error('Unable to record dispatch result');
      return result.data.status;
    }
    const secured={...claim.payload,callback_url:`${url}/functions/v1/document-generation-callback`,documents_bucket:env('DOCUMENTS_BUCKET') || 'evaluation-documents'};
    let response;
    try {
      response=await fetchImpl(webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(secured),signal:AbortSignal.timeout(20000)});
    } catch {
      try {
        if (await finish('unknown',unknownMessage)==='ready') return reply(200,{ok:true,status:'ready',...identities});
      } catch { /* The persisted guard still prevents another automatic delivery. */ }
      return reply(504,{ok:false,status:'unknown',...identities,error:unknownMessage});
    }
    // Only the artifact callback can establish readiness; HTTP 2xx is acceptance.
    try {
      const uncertain=response.status>=500 || response.status===408;
      const state=response.ok?'accepted':uncertain?'unknown':'rejected';
      const error=response.ok?null:uncertain?unknownMessage:`Workflow rejected document delivery (HTTP ${response.status}).`;
      const status=await finish(state,error);
      if (status==='ready') return reply(200,{ok:true,status,...identities});
      if (!response.ok || status==='failed' || status==='unknown') return reply(502,{ok:false,status,...identities,error:error || 'Document processing failed.'});
      return reply(202,{ok:true,status:'pending',...identities,message:'Workflow accepted. Processing has started.'});
    } catch { return reply(503,{ok:false,status:'unknown',...identities,error:unknownMessage}); }
    finally { await response.body?.cancel().catch(()=>{}); }
  };
}
