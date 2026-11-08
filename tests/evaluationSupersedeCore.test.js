import test from "node:test";
import assert from "node:assert/strict";
import { collapseSupersededEvaluations, findSupersededIds, findSupersedingEvaluation } from "../src/services/evaluationSupersedeCore.js";

const item = (id, status, createdAt, extra = {}) => ({
  id, user_id: "u1", video_case_id: "case-a", document_status: status, created_at: createdAt, ...extra,
});

test("a stuck evaluation is hidden once a resubmission of the same case is ready", () => {
  const stuck = item(282, "pending", "2026-10-26T03:56:39Z");
  const recovered = item(305, "ready", "2026-10-29T03:21:55Z");
  assert.deepEqual(collapseSupersededEvaluations([recovered, stuck]).map((x) => x.id), [305]);
});

test("a ready evaluation also replaces a newer stuck or failed one", () => {
  const ready = item(10, "ready", "2026-10-26T00:00:00Z");
  const failed = item(11, "failed", "2026-10-29T00:00:00Z");
  assert.deepEqual(collapseSupersededEvaluations([failed, ready]).map((x) => x.id), [10]);
});

test("without a ready copy only the newest unfinished copy is shown", () => {
  const older = item(276, "pending", "2026-10-26T00:00:00Z");
  const newer = item(297, "pending", "2026-10-29T00:00:00Z");
  assert.deepEqual(collapseSupersededEvaluations([newer, older]).map((x) => x.id), [297]);
});

test("every ready evaluation of a case stays visible", () => {
  const first = item(1, "ready", "2026-10-26T00:00:00Z");
  const second = item(2, "ready", "2026-10-29T00:00:00Z");
  assert.deepEqual(collapseSupersededEvaluations([second, first]).map((x) => x.id), [2, 1]);
});

test("different users, different cases and evaluations without a case are never merged", () => {
  const rows = [
    item(1, "pending", "2026-10-26T00:00:00Z"),
    item(2, "ready", "2026-10-29T00:00:00Z", { user_id: "u2" }),
    item(3, "ready", "2026-10-29T00:00:00Z", { video_case_id: "case-b" }),
    item(4, "pending", "2026-10-26T00:00:00Z", { video_case_id: null }),
    item(5, "pending", "2026-10-27T00:00:00Z", { video_case_id: null }),
  ];
  assert.deepEqual(collapseSupersededEvaluations(rows).map((x) => x.id), [1, 2, 3, 4, 5]);
});

test("the list keeps its original order", () => {
  const rows = [
    item(9, "ready", "2026-10-30T00:00:00Z", { video_case_id: "case-b" }),
    item(305, "ready", "2026-10-29T00:00:00Z"),
    item(282, "pending", "2026-10-26T00:00:00Z"),
  ];
  assert.deepEqual(collapseSupersededEvaluations(rows).map((x) => x.id), [9, 305]);
});

test("an unfinished evaluation points to the newest ready copy of the same case", () => {
  const stuck = item(282, "pending", "2026-10-26T00:00:00Z");
  const siblings = [item(305, "ready", "2026-10-29T00:00:00Z"), item(300, "ready", "2026-10-28T00:00:00Z"), stuck];
  assert.equal(findSupersedingEvaluation(stuck, siblings)?.id, 305);
});

test("a ready evaluation, or one without a case or a ready copy, is not redirected", () => {
  const ready = item(305, "ready", "2026-10-29T00:00:00Z");
  assert.equal(findSupersedingEvaluation(ready, [item(306, "ready", "2026-10-30T00:00:00Z")]), null);
  const noCase = item(4, "pending", "2026-10-26T00:00:00Z", { video_case_id: null });
  assert.equal(findSupersedingEvaluation(noCase, [item(5, "ready", "2026-10-27T00:00:00Z", { video_case_id: null })]), null);
  const stuck = item(282, "pending", "2026-10-26T00:00:00Z");
  assert.equal(findSupersedingEvaluation(stuck, [item(297, "pending", "2026-10-29T00:00:00Z")]), null);
  assert.equal(findSupersedingEvaluation(stuck, [item(305, "ready", "2026-10-29T00:00:00Z", { user_id: "u2" })]), null);
});

test("superseded ids lists the copies that collapsing hides", () => {
  const rows = [
    item(282, "pending", "2026-10-26T00:00:00Z"),
    item(305, "ready", "2026-10-29T00:00:00Z"),
    item(276, "pending", "2026-10-26T00:00:00Z", { video_case_id: "case-b" }),
    item(297, "failed", "2026-10-29T00:00:00Z", { video_case_id: "case-b" }),
    item(4, "pending", "2026-10-26T00:00:00Z", { video_case_id: null }),
  ];
  assert.deepEqual([...findSupersededIds(rows)].sort((a, b) => a - b), [276, 282]);
});

test("a ready copy without a document is hidden when another ready copy has one", () => {
  const withFiles = item(290, "ready", "2026-10-26T06:12:54Z", { pdf_storage_path: "evaluations/290/result.pdf", docx_storage_path: null });
  const empty = item(311, "ready", "2026-10-29T05:38:32Z", { pdf_storage_path: null, docx_storage_path: null });
  assert.deepEqual(collapseSupersededEvaluations([empty, withFiles]).map((x) => x.id), [290]);
  // Without a copy that has a document, nothing is hidden; rows without path columns are never judged.
  assert.deepEqual(collapseSupersededEvaluations([empty]).map((x) => x.id), [311]);
  const unknown = item(5, "ready", "2026-10-27T00:00:00Z");
  assert.deepEqual(collapseSupersededEvaluations([unknown, withFiles]).map((x) => x.id), [5, 290]);
});
