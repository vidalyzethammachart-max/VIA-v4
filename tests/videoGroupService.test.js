import assert from "node:assert/strict";
import test from "node:test";
import { fakeQuery, installTsLoader } from "./helpers/tsLoader.js";

installTsLoader();
const svc = await import("../src/services/videoGroupService.ts");
const { COMBINE_MIN_MESSAGE } = await import("../src/services/videoCaseCombineSelectionCore.js");

function run(id, score) {
  return { id, user_id: "u", employee_number: `E${id}`, analysis_kind: "human", rubric: { a: { q1: score } }, analysis_ai_output: null, analysis_ai_raw_text: null, overall_suggestion: `n${id}`, created_at: "2026-01-01", order_number: "O", video_case_id: `c${id}` };
}

// A table value that is an array is consumed one result per query (in order).
function setup({ rpcResult, tables = {}, invoke } = {}) {
  const rpcCalls = [], queries = {}, invokes = [];
  globalThis.__fakeSupabase = {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    rpc: async (name, args) => { rpcCalls.push([name, args]); return rpcResult; },
    from: (t) => { queries[t] = queries[t] || []; const r = tables[t]; return fakeQuery(Array.isArray(r) ? r.shift() : r, queries[t]); },
    functions: { invoke: async (name, opts) => { invokes.push([name, opts]); return invoke ? invoke() : { data: { ok: true }, error: null }; } },
  };
  return { rpcCalls, queries, invokes };
}

const params = (runs) => ({ orderNumber: "O-1", groupType: "group", subjectName: "หัวข้อ", sourceRuns: runs });

test("one source is rejected before any RPC", async () => {
  const { rpcCalls } = setup({ rpcResult: { data: {}, error: null } });
  await assert.rejects(svc.createVideoGroupEvaluation(params([run(1, 2)])), (e) => e.message === COMBINE_MIN_MESSAGE);
  await assert.rejects(svc.createVideoGroupEvaluation(params([run(1, 2), run(1, 2)])), (e) => e.message === COMBINE_MIN_MESSAGE);
  assert.equal(rpcCalls.length, 0);
});

test("two sources call the RPC in selection order with averaged scores", async () => {
  const { rpcCalls } = setup({ rpcResult: { data: { id: "g1" }, error: null } });
  const row = await svc.createVideoGroupEvaluation(params([run(7, 2), run(3, 4)]));
  assert.deepEqual(row, { id: "g1" });
  const [name, args] = rpcCalls[0];
  assert.equal(name, "create_video_group_evaluation");
  assert.deepEqual(args.p_evaluation_ids, [7, 3]);
  assert.equal(args.p_order_number, "O-1");
  assert.equal(args.p_group_type, "group");
  assert.equal(args.p_subject_name, "หัวข้อ");
  assert.equal(args.p_combined_scores.a.q1, 3);
  assert.equal(args.p_source_snapshot.case_title, "กลุ่ม หัวข้อ");
  assert.equal(args.p_source_snapshot.source_runs.length, 2);
  assert.ok("matrix_averages" in args.p_source_snapshot);
  assert.ok("section_averages" in args.p_source_snapshot);
  assert.ok(args.p_section_averages);
});

test("identity unique violation becomes the Thai duplicate message", async () => {
  setup({ rpcResult: { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "video_group_evaluations_identity_idx"' } } });
  await assert.rejects(svc.createVideoGroupEvaluation(params([run(1, 2), run(2, 4)])),
    (e) => e.message === "มีแบบประเมินกลุ่มนี้อยู่แล้ว (เลขที่สั่งงาน ประเภท และชื่อหัวข้อซ้ำกัน)");
});

test("other RPC errors throw their message", async () => {
  setup({ rpcResult: { data: null, error: { code: "42501", message: "nope" } } });
  await assert.rejects(svc.createVideoGroupEvaluation(params([run(1, 2), run(2, 4)])), /nope/);
});

test("getSelectableEvaluations inner-joins visible, non-trashed cases, newest first", async () => {
  const rows = [
    { id: 1, video_cases: { case_key: "k", case_title: "t", deleted_at: null } },
    { id: 2, video_cases: { case_key: "k2", case_title: "t2", deleted_at: "2026-01-01" } },
    { id: 3, video_cases: null },
  ];
  const { queries } = setup({ tables: { evaluations: { data: rows, error: null } } });
  const out = await svc.getSelectableEvaluations();
  // Defensive client drop: trashed and RLS-hidden (null embed) rows never reach the picker.
  assert.deepEqual(out.map((r) => r.id), [1]);
  const q = queries.evaluations;
  assert.ok(q.some((c) => c[0] === "eq" && c[1] === "document_status" && c[2] === "ready"));
  assert.ok(q.some((c) => c[0] === "not" && c[1] === "video_case_id"));
  // Inner embed: rows whose case the user cannot see (RLS) are removed server-side.
  assert.ok(q.some((c) => c[0] === "select" && /video_cases!inner\(\s*case_key,\s*case_title,\s*deleted_at\s*\)/.test(c[1])));
  assert.ok(q.some((c) => c[0] === "is" && c[1] === "video_cases.deleted_at" && c[2] === null));
  assert.ok(q.some((c) => c[0] === "order" && c[1] === "created_at" && c[2].ascending === false));
});

test("sendVideoGroupToN8n skips the invoke when already ready", async () => {
  const { invokes } = setup({ tables: { video_group_evaluations: { data: { id: "g1", document_status: "ready" }, error: null } } });
  const row = await svc.sendVideoGroupToN8n("g1", null);
  assert.equal(row.document_status, "ready");
  assert.equal(invokes.length, 0);
});

test("sendVideoGroupToN8n invokes forward-to-n8n with the group payload and re-reads", async () => {
  const pending = { id: "g1", order_number: "O", group_type: "group", subject_name: "ส", document_status: "pending", source_count: 2, combined_scores: {}, source_snapshot: { source_runs: [] } };
  const { invokes } = setup({ tables: {
    video_group_evaluations: [{ data: pending, error: null }, { data: pending, error: null }],
    video_group_evaluation_sources: { data: [{ evaluation_id: 1, video_case_id: "c1", source_position: 1 }], error: null },
    user_information: { data: { employee_number: "E9" }, error: null },
  } });
  const row = await svc.sendVideoGroupToN8n("g1", "  p  ");
  assert.equal(invokes[0][0], "forward-to-n8n");
  assert.equal(invokes[0][1].body.aggregate_id, "g1");
  assert.equal(invokes[0][1].body.video_case_id, "c1");
  assert.equal(invokes[0][1].body.combine_prompt, "p");
  assert.equal(row.id, "g1");
});

test("sendVideoGroupToN8n throws on error unless the group became ready", async () => {
  const pending = { id: "g1", order_number: "O", group_type: "group", subject_name: "ส", document_status: "pending", source_count: 0, combined_scores: {}, source_snapshot: {} };
  setup({ invoke: () => ({ data: null, error: { message: "boom" } }), tables: {
    video_group_evaluations: [{ data: pending, error: null }, { data: pending, error: null }],
    video_group_evaluation_sources: { data: [], error: null },
    user_information: { data: null, error: null },
  } });
  await assert.rejects(svc.sendVideoGroupToN8n("g1", null), /boom/);
});

test("getVideoGroupDocumentUrls passes aggregateId", async () => {
  const { invokes } = setup({ invoke: () => ({ data: { ok: true, pdfUrl: "p", docxUrl: "d" }, error: null }) });
  assert.deepEqual(await svc.getVideoGroupDocumentUrls("g1"), { pdfUrl: "p", docxUrl: "d" });
  assert.deepEqual(invokes[0], ["document-artifact-url", { body: { aggregateId: "g1" } }]);
});
