import test from "node:test";
import assert from "node:assert/strict";
import { createFailureCallbackHandler, createRetryHandler } from "../supabase/functions/_shared/executionRetry.js";
import { describeFailure, extractEvaluationId } from "../supabase/functions/_shared/n8nExecution.js";

const baseEnv = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  DOCUMENT_CALLBACK_SECRET: "cb-secret",
  N8N_API_URL: "https://n8n.example/api/v1",
  N8N_API_KEY: "n8n-key",
};

function execution({ evaluationId = 326, status = "error", message = "The service is receiving too many requests from you", httpCode = "429" } = {}) {
  return {
    id: "3150", status, workflowId: "nl38",
    data: { resultData: {
      lastNodeExecuted: "Generate Evaluation Analysis",
      error: { message, httpCode },
      runData: { Webhook: [{ data: { main: [[{ json: { body: { evaluation_id: evaluationId, document_type: "evaluation" } } }]] } }] },
    } },
  };
}

function harness({ isAdmin = true, n8nExecution = execution(), retryStatus = 200, latest = { execution_id: 3150 }, rpcErrors = {}, listed = [] } = {}) {
  const rpcCalls = [], fetches = [];
  const client = (key) => ({
    auth: { getUser: async () => ({ data: { user: { id: "admin-user" } }, error: null }) },
    rpc: async (name, args) => {
      rpcCalls.push({ key, name, args });
      if (name === "role_at_least") return { data: isAdmin, error: null };
      if (rpcErrors[name]) return { data: null, error: rpcErrors[name] };
      return { data: { ok: true, recorded: true }, error: null };
    },
    from: () => ({
      select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
      maybeSingle: async () => ({ data: latest, error: null }),
    }),
  });
  const fetchImpl = async (url, options = {}) => {
    fetches.push({ url, options });
    if (url.includes("/executions?")) return Response.json({ data: listed, nextCursor: null });
    if (url.endsWith("/retry")) {
      if (retryStatus === "timeout") throw new DOMException("Signal timed out.", "TimeoutError");
      return retryStatus === 200 ? Response.json({ id: "3160", retryOf: "3150" }) : new Response("busy", { status: retryStatus });
    }
    return Response.json(n8nExecution);
  };
  const deps = { createClient: (_url, key) => client(key), env: (name) => baseEnv[name], fetchImpl };
  return { rpcCalls, fetches, failure: createFailureCallbackHandler(deps), retry: createRetryHandler(deps) };
}

const post = (body, headers = {}) => new Request("https://edge.invalid", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
});

test("the failure parser finds the evaluation and recognises quota errors", () => {
  assert.equal(extractEvaluationId(execution()), 326);
  assert.equal(describeFailure(execution()).httpStatus, 429);
  assert.equal(describeFailure(execution({ httpCode: undefined, message: "RESOURCE_EXHAUSTED: quota" })).httpStatus, 429);
  assert.equal(describeFailure(execution({ httpCode: "403", message: "Forbidden" })).httpStatus, 403);
  const summary = execution();
  summary.data.resultData.runData.Webhook[0].data.main[0][0].json.body.document_type = "video_case_summary";
  assert.equal(extractEvaluationId(summary), null);
});

test("the failure callback rejects a wrong secret", async () => {
  const { failure, rpcCalls } = harness();
  const response = await failure(post({ execution: { id: 3150 } }, { "x-callback-secret": "nope" }));
  assert.equal(response.status, 401);
  assert.equal(rpcCalls.length, 0);
});

test("the failure callback records a 429 for the evaluation found in the execution", async () => {
  const { failure, rpcCalls, fetches } = harness();
  const response = await failure(post({ execution: { id: 3150, lastNodeExecuted: "Generate Evaluation Analysis", error: { message: "Too Many Requests", httpCode: "429" } }, workflow: { id: "nl38" } }, { "x-callback-secret": "cb-secret" }));
  assert.equal(response.status, 200);
  assert.match(fetches[0].url, /\/executions\/3150\?includeData=true$/);
  assert.equal(fetches[0].options.headers["X-N8N-API-KEY"], "n8n-key");
  const call = rpcCalls.find((item) => item.name === "record_evaluation_execution_failure");
  assert.equal(call.key, "service");
  assert.equal(call.args.p_evaluation_id, 326);
  assert.equal(call.args.p_http_status, 429);
});

test("non-admins cannot retry", async () => {
  const { retry, fetches } = harness({ isAdmin: false });
  const response = await retry(post({ evaluation_id: 326 }, { authorization: "Bearer user" }));
  assert.equal(response.status, 403);
  assert.equal(fetches.length, 0);
});

test("an admin retry reruns the recorded execution with the saved workflow", async () => {
  const { retry, rpcCalls, fetches } = harness();
  const response = await retry(post({ evaluation_id: 326 }, { authorization: "Bearer admin" }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.retry_execution_id, 3160);
  const call = fetches.find((item) => item.url.endsWith("/executions/3150/retry"));
  assert.deepEqual(JSON.parse(call.options.body), { loadWorkflow: true });
  assert.equal(call.options.headers["Idempotency-Key"], "via-retry-3150");
  assert.deepEqual(rpcCalls.filter((c) => c.key === "service").map((c) => c.name), ["begin_evaluation_retry", "finish_evaluation_retry"]);
  assert.equal(rpcCalls.at(-1).args.p_ok, true);
});

test("a refused retry releases the claim and reports the n8n error", async () => {
  const { retry, rpcCalls } = harness({ retryStatus: 409 });
  const response = await retry(post({ evaluation_id: 326 }, { authorization: "Bearer admin" }));
  assert.equal(response.status, 502);
  assert.equal(rpcCalls.at(-1).name, "finish_evaluation_retry");
  assert.equal(rpcCalls.at(-1).args.p_ok, false);
});

test("an admin-supplied execution must belong to the evaluation", async () => {
  const { retry, rpcCalls } = harness({ n8nExecution: execution({ evaluationId: 999 }) });
  const response = await retry(post({ evaluation_id: 326, execution_id: 3150 }, { authorization: "Bearer admin" }));
  assert.equal(response.status, 400);
  assert.equal(rpcCalls.some((c) => c.name === "begin_evaluation_retry"), false);
});

test("a non-quota failure is refused by the database guard", async () => {
  const { retry } = harness({ rpcErrors: { begin_evaluation_retry: { message: "Retry is allowed only for quota (429) failures" } } });
  const response = await retry(post({ evaluation_id: 326 }, { authorization: "Bearer admin" }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /429/);
});

test("without a recorded failure the retry finds the failed execution in n8n", async () => {
  const other = { ...execution({ evaluationId: 999 }), id: "3149" };
  const { retry, rpcCalls, fetches } = harness({ latest: null, listed: [other, execution()] });
  const response = await retry(post({ evaluation_id: 326 }, { authorization: "Bearer admin" }));
  assert.equal(response.status, 200);
  assert.match(fetches[0].url, /\/executions\?status=error&includeData=true/);
  const recorded = rpcCalls.find((c) => c.name === "record_evaluation_execution_failure");
  assert.equal(recorded.args.p_execution_id, 3150);
  assert.ok(fetches.some((f) => f.url.endsWith("/executions/3150/retry")));
});

test("the retry reports when no failed execution exists for a stuck evaluation", async () => {
  const { retry, rpcCalls } = harness({ latest: null, listed: [] });
  const response = await retry(post({ evaluation_id: 326 }, { authorization: "Bearer admin" }));
  assert.equal(response.status, 404);
  assert.equal(rpcCalls.some((c) => c.name === "begin_evaluation_retry"), false);
});

test("a retry that outlasts the wait is treated as started and stays claimed", async () => {
  const { retry, rpcCalls, fetches } = harness({ retryStatus: "timeout" });
  const response = await retry(post({ evaluation_id: 326 }, { authorization: "Bearer admin" }));
  const body = await response.json();
  assert.equal(response.status, 202);
  assert.equal(body.started, true);
  assert.equal(body.retry_execution_id, null);
  const finish = rpcCalls.at(-1);
  assert.equal(finish.name, "finish_evaluation_retry");
  assert.equal(finish.args.p_ok, true);
  assert.equal(finish.args.p_new_execution_id, null);
  const call = fetches.find((item) => item.url.endsWith("/retry"));
  assert.ok(call.options.signal, "the retry request has a timeout signal");
});
