import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveDocumentTarget } from "../_shared/documentTarget.js";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { ok:false, error:"Method not allowed" });
  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return reply(401, { ok:false, error:"Authentication required" });
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global:{headers:{Authorization:authorization}}, auth:{persistSession:false} });
    const { data:{user}, error:authError } = await client.auth.getUser();
    if (authError || !user) return reply(401, { ok:false, error:"Unauthorized" });
    const body = await req.json();
    const payload = Array.isArray(body) && body.length === 1 ? body[0] : body;
    const target = resolveDocumentTarget(payload);
    // Never accept callback destinations/secrets supplied by the browser.
    const input = { ...payload };
    for (const key of ['callback_url','callback_secret','document_callback_secret','documents_bucket']) delete input[key];
    const secured = { ...input, document_type:target.documentType, evaluation_id:target.kind === "evaluation" ? target.id : undefined, aggregate_id:target.kind === "aggregate" ? target.id : undefined, actor_user_id:user.id };
    const { data:jobId, error } = await client.rpc("enqueue_ai_document", { p_kind:target.kind, p_id:String(target.id), p_payload:secured });
    if (error) return reply(error.code === "42501" ? 403 : 400, { ok:false, error:error.message });
    return reply(202, { ok:true, status:"queued", jobId, evaluationId:target.kind === "evaluation" ? target.id : null, aggregateId:target.kind === "aggregate" ? target.id : null, message:"Saved to the processing queue." });
  } catch (error) {
    return reply(400, { ok:false, error:error instanceof Error ? error.message : "Invalid request" });
  }
});
