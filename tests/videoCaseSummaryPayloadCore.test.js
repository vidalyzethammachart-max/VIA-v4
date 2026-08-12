import test from "node:test";
import assert from "node:assert/strict";
import { buildVideoCaseSummaryPayload } from "../src/services/videoCaseSummaryPayloadCore.js";

const aggregate = {
  id: "61abc689-868a-4bc7-a0b0-000000000000",
  video_case_id: "b639bb41-79ba-4d4c-bdcc-ec004f670853",
  source_evaluation_ids: [224, 225, 226],
  source_count: 3,
  source_snapshot: {
    case_title: "Postman Test",
    source_runs: [{ order_number: "001" }],
  },
  combined_scores: { "1": { q1: 4 } },
  section_averages: { "1": 4 },
  ai_output: { summary: "Combined result" },
  ai_raw_text: null,
};

test("summary payload uses aggregate_id and never aliases a source evaluation", () => {
  const payload = buildVideoCaseSummaryPayload({
    aggregate,
    requestedByEmployeeNumber: "020943",
    combinePrompt: "Leader note",
  });

  assert.equal(payload.document_type, "video_case_summary");
  assert.equal(payload.aggregate_id, aggregate.id);
  assert.equal(payload.video_case_id, aggregate.video_case_id);
  assert.deepEqual(payload.source_evaluation_ids, [224, 225, 226]);
  assert.equal(Object.hasOwn(payload, "evaluation_id"), false);
  assert.equal(Object.hasOwn(payload, "evaluationId"), false);
});

test("summary payload keeps question, section, AI, and leader inputs", () => {
  const payload = buildVideoCaseSummaryPayload({
    aggregate,
    requestedByEmployeeNumber: "020943",
    combinePrompt: "Leader note",
  });

  assert.deepEqual(payload.question_averages, { "1": { q1: 4 } });
  assert.deepEqual(payload.section_averages, { "1": 4 });
  assert.deepEqual(payload.aggregate_analysis, { summary: "Combined result" });
  assert.equal(payload.combine_prompt, "Leader note");
  assert.equal(payload.sender_employee_number, "020943");
});
