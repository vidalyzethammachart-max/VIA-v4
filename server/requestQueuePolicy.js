// Pure policy: never mistake an asynchronous webhook acknowledgement for completion.
export function classifyWorkflowResponse({ status, documentReady }) {
  if (documentReady) return 'completed';
  return status >= 200 && status < 300 ? 'awaiting_callback' : 'error';
}

export function retryDecision({ status, attempt, retryAfter, body = '', now = Date.now() }) {
  if (!status) return { state: 'attention', delayMs: 0, reason: 'Delivery outcome unknown; inspect execution before retrying.' };
  if (attempt >= 5 || !(status === 429 || status === 408 || status >= 500)) {
    return { state: 'failed', delayMs: 0, reason: `Request failed (HTTP ${status}); retry limit or permanent error.` };
  }
  const seconds = Number(retryAfter);
  const serverDelay = retryAfter && Number.isFinite(seconds) ? seconds * 1000 : Math.max(0, Date.parse(retryAfter || '') - now) || 0;
  const bodyDelay = Number(body.match(/retryDelay["']?\s*:\s*["'](\d+(?:\.\d+)?)s/i)?.[1] || 0) * 1000;
  const daily = /RequestsPerDay|TokensPerDay|per.day.*quota|daily.*quota/i.test(body);
  const delayMs = Math.max(daily ? 86400000 : Math.min(3600000, 60000 * 2 ** (attempt - 1)), serverDelay, bodyDelay);
  return { state: 'retry_wait', delayMs, reason: daily ? 'Waiting for daily AI quota; will check again in 24 hours.' : `Waiting to retry (HTTP ${status}).` };
}
