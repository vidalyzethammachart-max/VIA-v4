import assert from "node:assert/strict";
import test from "node:test";
import { fakeQuery, installTsLoader } from "./helpers/tsLoader.js";

installTsLoader();
const { resolveVideoCaseMembership, getMyVideoCases } = await import("../src/services/videoCaseService.ts");

function setup({ user = { id: "u1" }, rpcResult, tables = {} } = {}) {
  const rpcCalls = [];
  const queries = {};
  globalThis.__fakeSupabase = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    rpc: async (name, args) => { rpcCalls.push([name, args]); return rpcResult; },
    from: (table) => { queries[table] = []; return fakeQuery(tables[table], queries[table]); },
  };
  return { rpcCalls, queries };
}

const caseRow = { id: "c1", case_key: "K1", case_title: "Case 1" };

test("UC-15 joining by case key calls resolve_video_case_membership as member by default", async () => {
  const { rpcCalls } = setup({ rpcResult: { data: caseRow, error: null } });
  assert.deepEqual(await resolveVideoCaseMembership({ caseKey: "K1" }), caseRow);
  assert.equal(rpcCalls[0][0], "resolve_video_case_membership");
  assert.equal(rpcCalls[0][1].p_case_key, "K1");
  assert.equal(rpcCalls[0][1].p_member_role, "member");
});

test("UC-14 creating by order number and subject uses the identity RPC", async () => {
  const { rpcCalls } = setup({ rpcResult: { data: caseRow, error: null } });
  await resolveVideoCaseMembership({ orderNumber: "A-1", subjectName: "Somchai", caseTitle: "T", memberRole: "leader" });
  assert.equal(rpcCalls[0][0], "resolve_video_case_by_identity");
  assert.equal(rpcCalls[0][1].p_order_number, "A-1");
  assert.equal(rpcCalls[0][1].p_subject_name, "Somchai");
  assert.equal(rpcCalls[0][1].p_member_role, "leader");
});

test("UC-15 a wrong case code surfaces the database error", async () => {
  setup({ rpcResult: { data: null, error: { message: "case not found" } } });
  await assert.rejects(resolveVideoCaseMembership({ caseKey: "nope" }), /case not found/);
});

test("UC-14/15 require authentication", async () => {
  setup({ user: null, rpcResult: { data: caseRow, error: null } });
  await assert.rejects(resolveVideoCaseMembership({ caseKey: "K1" }), /Authentication required/);
  await assert.rejects(getMyVideoCases(), /Authentication required/);
});

test("UC-16 admin sees active cases from video_cases without needing membership", async () => {
  const { queries } = setup({ tables: {
    user_information: { data: { role: "admin" }, error: null },
    video_cases: { data: [caseRow], error: null },
  } });
  assert.deepEqual(await getMyVideoCases(), [caseRow]);
  assert.ok(queries.video_cases.some((c) => c[0] === "is" && c[1] === "deleted_at" && c[2] === null));
  assert.equal(queries.video_case_members, undefined);
});

test("UC-16 admin trash view lists only deleted cases", async () => {
  const { queries } = setup({ tables: {
    user_information: { data: { role: "admin" }, error: null },
    video_cases: { data: [], error: null },
  } });
  await getMyVideoCases({ trashed: true });
  assert.ok(queries.video_cases.some((c) => c[0] === "not" && c[1] === "deleted_at"));
});

test("UC-16 a non-admin with no memberships sees no cases", async () => {
  const { queries } = setup({ tables: {
    user_information: { data: { role: "user" }, error: null },
    video_case_members: { data: [], error: null },
  } });
  assert.deepEqual(await getMyVideoCases(), []);
  assert.equal(queries.video_cases, undefined);
});
