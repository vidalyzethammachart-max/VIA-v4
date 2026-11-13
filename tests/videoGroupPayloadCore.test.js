import assert from "node:assert/strict";
import test from "node:test";
import { buildVideoGroupSummaryPayload } from "../src/services/videoGroupPayloadCore.js";

const group = {
  id: "g1",
  order_number: "งาน-๑",
  group_type: "round",
  subject_name: "สมชาย ใจดี",
  source_count: 2,
  combined_scores: { a: { q1: 3 } },
  section_averages: { a: 3 },
  ai_output: null,
  ai_raw_text: null,
  source_snapshot: {
    case_title: "ignored",
    source_runs: [
      { evaluation_id: 11, employee_number: "E1", notes: "ดี", order_number: "other", rubric: {} },
      { evaluation_id: 12, employee_number: "E2", notes: "พอใช้", rubric: {} },
    ],
  },
  sources: [
    { evaluation_id: 11, video_case_id: "case-A", source_position: 1 },
    { evaluation_id: 12, video_case_id: "case-B", source_position: 2 },
  ],
};

test("group payload reuses the summary shape with group identity", () => {
  const p = buildVideoGroupSummaryPayload({ group, requestedByEmployeeNumber: "E9", combinePrompt: "สรุป" });
  assert.equal(p.document_type, "video_case_summary");
  assert.equal(p.aggregate_id, "g1");
  assert.equal("evaluation_id" in p, false);
  assert.equal(p.order_number, "งาน-๑");
  assert.equal(p.subject_name, "รวมรอบ สมชาย ใจดี");
  assert.equal(p.video_case_id, "case-A");
  assert.deepEqual(p.source_evaluation_ids, [11, 12]);
  assert.equal(p.source_count, 2);
  assert.deepEqual(p.question_averages, { a: { q1: 3 } });
  assert.deepEqual(p.section_averages, { a: 3 });
  assert.equal(p.evaluators.length, 2);
  assert.deepEqual(p.suggestions, ["ดี", "พอใช้"]);
  assert.match(p.overallSuggestionRaw, /สรุป/);
  assert.equal(p.sender_employee_number, "E9");
});

test("the PDF tick table gets the same rounded scores the group detail page shows", () => {
  const g = { ...group, combined_scores: { "1": { q1: 2.5, q2: 2.4, q3: 4.67, q4: "x" }, "2": { q1: 1 } } };
  const p = buildVideoGroupSummaryPayload({ group: g, requestedByEmployeeNumber: "E9", combinePrompt: "สรุป" });
  assert.deepEqual(p.rubric, { "1": { q1: 3, q2: 2, q3: 5 }, "2": { q1: 1 } });
  // n8n must never see a decimal score: question_averages is rounded the same way.
  assert.deepEqual(p.question_averages, p.rubric);
});

test("x.5 and above rounds up, below x.5 rounds down", () => {
  const g = { ...group, combined_scores: { "1": { a: 2.49, b: 2.5, c: 2.51, d: 3.33, e: 3.67, f: 4.5 } } };
  const p = buildVideoGroupSummaryPayload({ group: g, requestedByEmployeeNumber: null, combinePrompt: null });
  assert.deepEqual(p.rubric, { "1": { a: 2, b: 3, c: 3, d: 3, e: 4, f: 5 } });
});

test("section averages are computed from the rounded scores sent to the document", () => {
  const g = { ...group, combined_scores: { "1": { q1: 2.33, q2: 2.67, q3: 2.33, q4: 2.67, q5: 2.33 } }, section_averages: { "1": 2.47 } };
  const p = buildVideoGroupSummaryPayload({ group: g, requestedByEmployeeNumber: null, combinePrompt: null });
  assert.deepEqual(p.question_averages, { "1": { q1: 2, q2: 3, q3: 2, q4: 3, q5: 2 } });
  assert.deepEqual(p.section_averages, { "1": 2.4 });
});
