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
