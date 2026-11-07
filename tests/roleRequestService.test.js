import assert from "node:assert/strict";
import test from "node:test";
import { fakeQuery, installTsLoader } from "./helpers/tsLoader.js";

installTsLoader();
const { RoleRequestService } = await import("../src/services/roleRequestService.ts");

function setup({ user = { id: "u1" }, authError = null, tableResult, rpcResult } = {}) {
  const calls = [];
  const logs = [];
  globalThis.__fakeAccounting = { logActivity: async (e) => { logs.push(e); } };
  globalThis.__fakeSupabase = {
    auth: { getUser: async () => ({ data: { user }, error: authError }) },
    from: (table) => { calls.push(["from", table]); return fakeQuery(tableResult, calls); },
    rpc: async (name, args) => { calls.push(["rpc", name, args]); return rpcResult; },
  };
  return { calls, logs, svc: new RoleRequestService() };
}

const row = { id: "r1", user_id: "u1", requested_role: "editor", status: "pending" };
const flush = () => new Promise((r) => setImmediate(r));

test("UC-05 requestRole inserts a pending request for the signed-in user and logs it", async () => {
  const { svc, calls, logs } = setup({ tableResult: { data: row, error: null } });
  assert.deepEqual(await svc.requestRole("editor"), row);
  assert.deepEqual(calls.find((c) => c[0] === "insert")[1], { user_id: "u1", requested_role: "editor" });
  await flush();
  assert.equal(logs[0].action, "REQUEST_ROLE");
});

test("UC-05 requestRole requires authentication", async () => {
  const { svc } = setup({ user: null, tableResult: { data: row, error: null } });
  await assert.rejects(svc.requestRole("editor"), /Authentication required/);
});

test("UC-05 requestRole surfaces database errors", async () => {
  const { svc } = setup({ tableResult: { data: null, error: { message: "duplicate pending request" } } });
  await assert.rejects(svc.requestRole("editor"), /duplicate pending request/);
});

test("UC-05 cancelRequest only touches the callers own pending request", async () => {
  const { svc, calls } = setup({ tableResult: { data: { ...row, status: "cancelled" }, error: null } });
  const out = await svc.cancelRequest("r1");
  assert.equal(out.status, "cancelled");
  const eqs = calls.filter((c) => c[0] === "eq").map((c) => [c[1], c[2]]);
  assert.deepEqual(eqs, [["id", "r1"], ["user_id", "u1"], ["status", "pending"]]);
});

test("UC-05 cancelRequest fails when the request is no longer pending", async () => {
  const { svc } = setup({ tableResult: { data: null, error: { message: "no rows" } } });
  await assert.rejects(svc.cancelRequest("r1"), /no rows/);
});

test("UC-06 approve and reject call review_role_request with the matching status", async () => {
  const approved = { ...row, status: "approved" };
  const a = setup({ rpcResult: { data: approved, error: null } });
  assert.deepEqual(await a.svc.approveRequest("r1"), approved);
  assert.deepEqual(a.calls.find((c) => c[0] === "rpc").slice(1), ["review_role_request", { p_request_id: "r1", p_status: "approved" }]);
  await flush();
  assert.equal(a.logs[0].action, "APPROVE_ROLE");

  const b = setup({ rpcResult: { data: { ...row, status: "rejected" }, error: null } });
  await b.svc.rejectRequest("r1");
  assert.equal(b.calls.find((c) => c[0] === "rpc")[2].p_status, "rejected");
  await flush();
  assert.equal(b.logs[0].action, "REJECT_ROLE");
});

test("UC-06 a non-admin review is rejected by the database and the error is surfaced", async () => {
  const { svc, logs } = setup({ rpcResult: { data: null, error: { message: "admin only" } } });
  await assert.rejects(svc.approveRequest("r1"), /admin only/);
  await flush();
  assert.equal(logs.length, 0);
});

test("UC-05 activity log failure does not break the request", async () => {
  const { svc } = setup({ tableResult: { data: row, error: null } });
  globalThis.__fakeAccounting = { logActivity: async () => { throw new Error("log down"); } };
  const orig = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await svc.requestRole("editor"), row);
    await flush();
  } finally {
    console.error = orig;
  }
});
