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

import { buildCombinedSuggestionDraft } from "../src/services/videoCaseSummaryPayloadCore.js";

test("draft joins each evaluator's suggestion with their code", () => {
  assert.equal(
    buildCombinedSuggestionDraft([
      { employee_number: "020943", notes: "ดี" },
      { employee_number: "021111", notes: "ปรับปรุง" },
    ]),
    "ผู้ประเมิน 020943: ดี\n\nผู้ประเมิน 021111: ปรับปรุง",
  );
});

test("draft skips blank notes and labels missing codes", () => {
  const draft = buildCombinedSuggestionDraft([
    { employee_number: "020943", notes: "   " },
    { employee_number: null, notes: "ok" },
  ]);
  assert.equal(draft, "ผู้ประเมิน ไม่ระบุรหัส: ok");
  assert.doesNotMatch(draft, /undefined/);
});

test("draft is empty when nobody wrote a suggestion", () => {
  assert.equal(buildCombinedSuggestionDraft([]), "");
  assert.equal(buildCombinedSuggestionDraft([{ notes: null }]), "");
});

test("payload lists the evaluators and keeps existing fields", () => {
  const payload = buildVideoCaseSummaryPayload({
    aggregate: {
      ...aggregate,
      source_snapshot: {
        case_title: "Postman Test",
        source_runs: [
          { evaluation_id: 224, employee_number: "020943", notes: "ดี" },
          { id: 225, employee_number: "021111", notes: null },
        ],
      },
    },
    requestedByEmployeeNumber: "020943",
    combinePrompt: null,
  });
  assert.deepEqual(payload.evaluators, [
    { evaluation_id: 224, employee_number: "020943", notes: "ดี" },
    { evaluation_id: 225, employee_number: "021111", notes: null },
  ]);
  assert.deepEqual(payload.suggestions, ["ดี"]);
  assert.equal(payload.aggregate_id, aggregate.id);
  assert.deepEqual(payload.question_averages, { "1": { q1: 4 } });
});
