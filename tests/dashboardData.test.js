import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function service(supabase = {}) {
  const source = readFileSync(new URL("../src/services/dashboardService.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, require: () => ({ supabase }) });
  return exports;
}
const cases = [{ id: "shared", case_title: "Shared video", deleted_at: null }, { id: "trash", deleted_at: "2026-10-14" }];
const evaluations = [
  { id: 240, video_case_id: "shared", analysis_kind: "human", rubric: { 1: { q1: 1 } }, created_at: "2026-10-14T00:00:00Z", document_status: "ready", pdf_storage_path: "240.pdf" },
  { id: 241, video_case_id: "shared", analysis_kind: "human", rubric: { 1: { q1: 5 } }, created_at: "2026-10-14T01:00:00Z" },
  { id: 242, video_case_id: "trash", rubric: { 1: { q1: 5 } } },
  { id: 243, video_case_id: null, rubric: {} },
  { id: 244, video_case_id: "shared", analysis_kind: "aggregate", rubric: { 1: { q1: 5 } } },
];
const aggregates = [
  { id: "summary", video_case_id: "shared", combined_scores: { 1: { q1: 3 } }, source_count: 2, created_at: "2026-10-14T02:00:00Z", document_status: "ready", pdf_storage_path: "summary.pdf" },
  { id: "trashed-summary", video_case_id: "trash", document_status: "ready", pdf_storage_path: "trash.pdf" },
];

test("dashboard includes individual analyses and separate summaries without counting sources twice", () => {
  const model = service().buildDashboardModel({ cases, evaluations, aggregates });
  assert.equal(model.caseCount, 1);
  assert.equal(model.evaluations.length, 3);
  assert.equal(model.summaryCount, 1);
  assert.equal(model.readyDocumentCount, 2);
  assert.equal(model.recent[0].id, "aggregate-summary");
  assert.equal(model.recent[0].documentPath, "/video-cases/shared/summaries/summary/preview");
  assert.equal(model.recent[0].sourceCount, 2);
  assert.equal(model.recent[0].average, 3);
  assert.equal(model.recent.find(r => r.id === "evaluation-240").documentPath, "/preview/240");
  assert.ok(!model.recent.some(r => r.videoCaseId === "trash"));
});
test("graphs count each answer once and reject invalid scores while retaining legacy keys", () => {
  const rows = [
    { rubric: { 1: { label: 1, q1: 1 } } },
    { rubric: { 1: { q1: "5" } } },
    ...[null, "", "bad", 0, 6, 2.5].map(score => ({ rubric: { 1: { q1: score } } })),
  ];
  const stats = service().buildDashboardStats(rows, [{ id: "1", title: "Section", questions: [{ id: "q1", storageKey: "label", label: "Question" }] }]);
  assert.equal(stats[0].questions[0].count, 2);
  assert.equal(stats[0].questions[0].average, 3);
  assert.equal(stats[0].questions[0].scores[1], 1);
  assert.equal(stats[0].questions[0].scores[5], 1);
});
test("empty dashboard does not invent analyses or downloadable files", () => {
  const model = service().buildDashboardModel({ cases: [], evaluations: [], aggregates: [] });
  assert.equal(model.caseCount, 0);
  assert.equal(model.readyDocumentCount, 0);
  assert.equal(model.recent.length, 0);
});
test("document state is independent of stale legacy queue status", () => {
  const model=service().buildDashboardModel({cases:[],aggregates:[],evaluations:[
    {id:1,video_case_id:null,rubric:{},document_status:'pending',queue_status:'queued'},
    {id:2,video_case_id:null,rubric:{},document_status:'failed',queue_status:'running'},
  ]});
  assert.equal(model.recent.find(r=>r.id==='evaluation-1').documentStatus,'pending');
  assert.equal(model.recent.find(r=>r.id==='evaluation-2').documentStatus,'failed');
});
test("dashboard loads beyond the API page limit and propagates query errors", async () => {
  const calls = [];
  const supabase = { from(table) { return {
    select() { return this; }, order() { return this; }, abortSignal() { return this; },
    async range(start, end) {
      calls.push({ table, start, end });
      return { data: table === "evaluations" && start === 0 ? Array.from({ length: end-start+1 }, (_, i) => ({ id: i+1 })) : [], error: null };
    },
  }; } };
  const rows = await service(supabase).loadDashboardData();
  assert.ok(rows.evaluations.length >= 500);
  assert.ok(calls.some(c => c.table === "evaluations" && c.start > 0));
  assert.ok(calls.some(c => c.table === "video_case_aggregates"));
  assert.ok(calls.some(c => c.table === "video_cases"));
  const failing = { from() { return { select() {return this;}, order() {return this;}, async range() {return {data:null,error:{message:"Permission denied"}};} }; } };
  await assert.rejects(service(failing).loadDashboardData(), /Permission denied/);
});
