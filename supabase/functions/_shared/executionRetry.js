import { describeFailure, extractEvaluationId, fetchExecution, findFailedExecution, retryExecution } from './n8nExecution.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-callback-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status, body) => Response.json(body, {status, headers: corsHeaders});

function positiveInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

// Called by the n8n error workflow with the Error Trigger output as the JSON body.
export function createFailureCallbackHandler({createClient, env, fetchImpl = globalThis.fetch}) {
  return async function handleFailure(req) {
    if (req.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
    if (req.method !== 'POST') return reply(405, {ok: false, error: 'Method not allowed'});
    const secret = env('DOCUMENT_CALLBACK_SECRET');
    const provided = req.headers.get('x-callback-secret') || '';
    if (!secret || provided !== secret) return reply(401, {ok: false, error: 'Unauthorized callback'});

    let report;
    try { report = await req.json(); } catch { return reply(400, {ok: false, error: 'Invalid JSON'}); }
    const executionId = positiveInt(report?.execution?.id);
    if (!executionId) return reply(400, {ok: false, error: 'execution.id is required'});

    let execution;
    try { execution = await fetchExecution({env, fetchImpl, executionId}); }
    catch (error) { return reply(502, {ok: false, error: error.message}); }
    const evaluationId = extractEvaluationId(execution);
    if (!evaluationId) return reply(200, {ok: true, ignored: 'not an individual evaluation'});

    const failure = describeFailure(execution, report);
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {auth: {persistSession: false}});
    const result = await admin.rpc('record_evaluation_execution_failure', {
      p_evaluation_id: evaluationId,
      p_execution_id: executionId,
      p_workflow_id: String(report?.workflow?.id ?? execution?.workflowId ?? ''),
      p_failed_node: failure.failedNode,
      p_error_message: failure.message,
      p_http_status: failure.httpStatus,
    });
    if (result.error) return reply(500, {ok: false, error: result.error.message});
    return reply(200, {ok: true, evaluation_id: evaluationId, ...result.data});
  };
}

// Admin-only: rerun a quota-failed n8n execution with the currently saved workflow.
export function createRetryHandler({createClient, env, fetchImpl = globalThis.fetch}) {
  return async function handleRetry(req) {
    if (req.method === 'OPTIONS') return new Response('ok', {headers: corsHeaders});
    if (req.method !== 'POST') return reply(405, {ok: false, error: 'Method not allowed'});
    const authorization = req.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) return reply(401, {ok: false, error: 'Authentication required'});
    const url = env('SUPABASE_URL'), anonKey = env('SUPABASE_ANON_KEY'), serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceKey || !env('N8N_API_URL') || !env('N8N_API_KEY')) {
      return reply(503, {ok: false, error: 'Retry is not configured.'});
    }
    const user = createClient(url, anonKey, {global: {headers: {Authorization: authorization}}, auth: {persistSession: false}});
    const auth = await user.auth.getUser();
    if (auth.error || !auth.data?.user) return reply(401, {ok: false, error: 'Unauthorized'});
    const isAdmin = await user.rpc('role_at_least', {required_role: 'admin'});
    if (isAdmin.error || isAdmin.data !== true) return reply(403, {ok: false, error: 'Admins only'});

    let body;
    try { body = await req.json(); } catch { return reply(400, {ok: false, error: 'Invalid JSON'}); }
    const evaluationId = positiveInt(body?.evaluation_id);
    if (!evaluationId) return reply(400, {ok: false, error: 'evaluation_id is required'});
    const admin = createClient(url, serviceKey, {auth: {persistSession: false}});

    let executionId = positiveInt(body?.execution_id);
    if (executionId) {
      // An admin-supplied execution (older stuck jobs) must belong to this evaluation and have failed.
      let execution;
      try { execution = await fetchExecution({env, fetchImpl, executionId}); }
      catch (error) { return reply(502, {ok: false, error: error.message}); }
      if (extractEvaluationId(execution) !== evaluationId) {
        return reply(400, {ok: false, error: `Execution ${executionId} is not for evaluation #${evaluationId}.`});
      }
      if (execution?.status && !['error', 'crashed'].includes(execution.status)) {
        return reply(409, {ok: false, error: `Execution ${executionId} has status ${execution.status}, not failed.`});
      }
      const failure = describeFailure(execution);
      const recorded = await admin.rpc('record_evaluation_execution_failure', {
        p_evaluation_id: evaluationId, p_execution_id: executionId, p_workflow_id: String(execution?.workflowId ?? ''),
        p_failed_node: failure.failedNode, p_error_message: failure.message, p_http_status: failure.httpStatus,
      });
      if (recorded.error) return reply(400, {ok: false, error: recorded.error.message});
    } else {
      const latest = await admin.from('evaluation_execution_failures').select('execution_id')
        .eq('evaluation_id', evaluationId).order('created_at', {ascending: false}).limit(1).maybeSingle();
      if (latest.error) return reply(500, {ok: false, error: latest.error.message});
      executionId = positiveInt(latest.data?.execution_id);
      if (!executionId) {
        // Failed before the error workflow existed: find the run in n8n and record it.
        let execution;
        try { execution = await findFailedExecution({env, fetchImpl, evaluationId}); }
        catch (error) { return reply(502, {ok: false, error: error.message}); }
        executionId = positiveInt(execution?.id);
        if (!executionId) {
          return reply(404, {ok: false, error: 'No failed n8n execution was found for this evaluation; it may still be running or was deleted.'});
        }
        const failure = describeFailure(execution);
        const recorded = await admin.rpc('record_evaluation_execution_failure', {
          p_evaluation_id: evaluationId, p_execution_id: executionId, p_workflow_id: String(execution?.workflowId ?? ''),
          p_failed_node: failure.failedNode, p_error_message: failure.message, p_http_status: failure.httpStatus,
        });
        if (recorded.error) return reply(400, {ok: false, error: recorded.error.message});
      }
    }

    const claim = await admin.rpc('begin_evaluation_retry', {
      p_evaluation_id: evaluationId, p_execution_id: executionId, p_actor: auth.data.user.id,
    });
    if (claim.error) return reply(claim.error.code === '55000' ? 409 : 400, {ok: false, error: claim.error.message});

    let newExecutionId;
    try {
      newExecutionId = await retryExecution({env, fetchImpl, executionId});
    } catch (error) {
      await admin.rpc('finish_evaluation_retry', {p_execution_id: executionId, p_new_execution_id: null, p_ok: false, p_error: error.message});
      return reply(502, {ok: false, error: error.message});
    }
    const finished = await admin.rpc('finish_evaluation_retry', {
      p_execution_id: executionId, p_new_execution_id: newExecutionId, p_ok: true, p_error: null,
    });
    if (finished.error) return reply(500, {ok: false, error: finished.error.message});
    return reply(200, {ok: true, evaluation_id: evaluationId, execution_id: executionId, retry_execution_id: newExecutionId});
  };
}
