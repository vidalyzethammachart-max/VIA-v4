// Helpers for reading and retrying n8n executions through the n8n public API.
// The API key stays server-side (Supabase secret N8N_API_KEY); browsers never see it.

const QUOTA_PATTERN = /\b429\b|too many requests|resource[_ ]exhausted|quota/i;

function firstJson(run) {
  const item = run?.data?.main?.[0]?.[0];
  return item && typeof item.json === 'object' ? item.json : null;
}

// The webhook node's first item carries the dispatched payload with evaluation_id.
export function extractEvaluationId(execution) {
  const runData = execution?.data?.resultData?.runData;
  if (!runData || typeof runData !== 'object') return null;
  for (const runs of Object.values(runData)) {
    const json = firstJson(Array.isArray(runs) ? runs[0] : null);
    if (!json) continue;
    const source = json.body && typeof json.body === 'object' ? json.body : json;
    if (source.document_type === 'video_case_summary') return null;
    const id = Number(source.evaluation_id);
    if (Number.isInteger(id) && id > 0) return id;
  }
  return null;
}

function statusFrom(value) {
  const code = Number(value);
  return Number.isInteger(code) && code >= 100 && code <= 599 ? code : null;
}

// Combines the Error Trigger payload with the stored execution to describe the failure.
export function describeFailure(execution, report = {}) {
  const reported = report?.execution?.error || {};
  const stored = execution?.data?.resultData?.error || {};
  const message = [reported.message || stored.message, reported.description || stored.description]
    .filter(Boolean).join(' - ').slice(0, 1000) || null;
  let httpStatus = statusFrom(reported.httpCode) ?? statusFrom(stored.httpCode)
    ?? statusFrom(reported.context?.httpCode) ?? statusFrom(stored.context?.httpCode);
  if (httpStatus === null && message && QUOTA_PATTERN.test(message)) httpStatus = 429;
  return {
    failedNode: report?.execution?.lastNodeExecuted || execution?.data?.resultData?.lastNodeExecuted || stored.node?.name || null,
    message,
    httpStatus,
  };
}

function apiBase(env) {
  const raw = env('N8N_API_URL');
  if (!raw || !env('N8N_API_KEY')) return null;
  const url = new URL(raw);
  if (url.protocol !== 'https:') return null;
  return url.href.replace(/\/+$/, '');
}

export async function fetchExecution({env, fetchImpl, executionId}) {
  const base = apiBase(env);
  if (!base) throw new Error('n8n API is not configured.');
  const response = await fetchImpl(`${base}/executions/${executionId}?includeData=true`, {
    headers: {'X-N8N-API-KEY': env('N8N_API_KEY'), accept: 'application/json'},
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`n8n API returned HTTP ${response.status} for execution ${executionId}.`);
  return response.json();
}

// Older stuck jobs have no recorded failure: scan recent failed executions, newest
// first, for the one that carried this evaluation. Bounded to keep the call fast.
export async function findFailedExecution({env, fetchImpl, evaluationId, pageSize = 25, maxPages = 8}) {
  const base = apiBase(env);
  if (!base) throw new Error('n8n API is not configured.');
  let cursor = null;
  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams({status: 'error', includeData: 'true', limit: String(pageSize)});
    if (env('N8N_WORKFLOW_ID')) query.set('workflowId', env('N8N_WORKFLOW_ID'));
    if (cursor) query.set('cursor', cursor);
    const response = await fetchImpl(`${base}/executions?${query}`, {
      headers: {'X-N8N-API-KEY': env('N8N_API_KEY'), accept: 'application/json'},
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`n8n API returned HTTP ${response.status} while searching executions.`);
    const body = await response.json();
    const match = (body?.data || []).find((execution) => extractEvaluationId(execution) === evaluationId);
    if (match) return match;
    cursor = body?.nextCursor || null;
    if (!cursor) break;
  }
  return null;
}

export async function retryExecution({env, fetchImpl, executionId}) {
  const base = apiBase(env);
  if (!base) throw new Error('n8n API is not configured.');
  const response = await fetchImpl(`${base}/executions/${executionId}/retry`, {
    method: 'POST',
    headers: {
      'X-N8N-API-KEY': env('N8N_API_KEY'),
      'Content-Type': 'application/json',
      accept: 'application/json',
      'Idempotency-Key': `via-retry-${executionId}`,
    },
    body: JSON.stringify({loadWorkflow: true}),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const text = (await response.text().catch(() => '')).slice(0, 300);
    throw new Error(`n8n refused the retry (HTTP ${response.status})${text ? `: ${text}` : ''}`);
  }
  const body = await response.json();
  const newId = Number(body?.id);
  return Number.isInteger(newId) ? newId : null;
}
