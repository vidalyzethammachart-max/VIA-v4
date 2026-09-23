import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const nodeNames = {
  "transform-via-payload": "Transform VIA Payload",
  "assemble-final-evaluation-context": "Assemble Final Evaluation Context",
  "build-final-appscript-body": "Build Final AppScript Body",
};
const exportedNodes = process.env.VIA_N8N_WORKFLOW_EXPORT
  ? JSON.parse(readFileSync(process.env.VIA_N8N_WORKFLOW_EXPORT, "utf8")).nodes
  : null;

// These files are the exact candidate code pasted into n8n Code nodes.
// Only n8n's input accessors are supplied here; no AI, callback or DB is mocked
// as a successful production execution.
function runNode(file, input, upstream = {}) {
  const source = exportedNodes
    ? exportedNodes.find((node) => node.name === nodeNames[file])?.parameters?.jsCode
    : readFileSync(new URL(`../n8n/nodes/${file}.js.txt`, import.meta.url), "utf8");
  assert.equal(typeof source, "string", `Missing Code node: ${nodeNames[file]}`);
  const result = runInNewContext(`(function () {\n${source}\n})()`, {
    $json: structuredClone(input),
    $input: { first: () => ({ json: structuredClone(input) }) },
    $: (name) => {
      assert.ok(Object.hasOwn(upstream, name), `Missing upstream node: ${name}`);
      return { first: () => ({ json: structuredClone(upstream[name]) }) };
    },
  }, { timeout: 1000 });
  return JSON.parse(JSON.stringify(Array.isArray(result) ? result[0].json : result.json));
}

const aggregateId = "61abc689-868a-4bc7-a0b0-000000000000";
function summary(score) {
  return {
    document_type: "video_case_summary",
    aggregate_id: aggregateId,
    video_case_id: "b639bb41-79ba-4d4c-bdcc-ec004f670853",
    question_averages: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), { q1: score }])),
    section_averages: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), score])),
    aggregate_analysis: { summary: "Synthetic combined analysis" },
    source_evaluation_ids: [1001, 1002],
    source_count: 2,
    callback_url: "https://example.invalid/functions/v1/document-generation-callback",
    documents_bucket: "evaluation-documents",
    combine_prompt: "Synthetic acceptance test",
  };
}

test("n8n transform preserves the score 1/5 aggregate average of 3.00", () => {
  const result = runNode("transform-via-payload", summary(3));
  assert.equal(result.aggregate_id, aggregateId);
  assert.equal(Object.hasOwn(result, "evaluation_id"), false);
  assert.equal(result.rubric.length, 9);
  assert.ok(result.rubric.every((section) => section.scores[0] === 3 && section.average === 3));
});

test("n8n transform preserves fractional aggregate scores for object and array rubrics", () => {
  for (const score of [1.5, 2.5, 3.25, 4.5]) {
    for (const input of [summary(score), { ...summary(score), rubric: [{ scores: [score] }] }]) {
      const result = runNode("transform-via-payload", input);
      assert.equal(result.rubric[0].scores[0], score);
      assert.equal(result.rubric[0].average, score);
    }
  }
});

test("n8n transform retains legacy individual score normalization", () => {
  const result = runNode("transform-via-payload", { evaluation_id: 1001, rubric: [{ scores: [1, 2.5, 5] }] });
  assert.equal(result.evaluation_id, 1001);
  assert.equal(Object.hasOwn(result, "aggregate_id"), false);
  assert.deepEqual(result.rubric[0].scores, [1, 3, 5]);
});

test("n8n context keeps summary identity and provenance without inventing evaluation_id", () => {
  const input = summary(2.5);
  const result = runNode("assemble-final-evaluation-context", input);
  for (const key of ["document_type", "aggregate_id", "video_case_id", "source_evaluation_ids", "source_count", "question_averages", "section_averages", "aggregate_analysis", "combine_prompt", "callback_url", "documents_bucket"]) {
    assert.deepEqual(result[key], input[key], key);
  }
  assert.equal(Object.hasOwn(result, "evaluation_id"), false);
});

test("n8n context keeps individual identity and parses manual analysis", () => {
  const result = runNode("assemble-final-evaluation-context", {
    document_type: "evaluation", evaluation_id: 1001,
    content: { parts: [{ text: '{"summary":"Individual analysis","rubric":[]}' }] },
  });
  assert.equal(result.evaluation_id, 1001);
  assert.equal(Object.hasOwn(result, "aggregate_id"), false);
  assert.deepEqual(result.manualEvaluation, { summary: "Individual analysis" });
});

function buildDocument(normalized, transformed) {
  return runNode("build-final-appscript-body", { summary: "Parsed AI report" }, {
    "Normalize Incoming Payload": normalized,
    "Transform VIA Payload": transformed,
    "Calculate Evaluation Stats": { stats: { overallAverage: transformed.rubric[0].average } },
  });
}

test("n8n document body recovers summary ID from upstream after AI strips metadata", () => {
  const normalized = summary(3);
  const transformed = runNode("transform-via-payload", normalized);
  const result = buildDocument(normalized, transformed);
  assert.equal(result.aggregate_id, aggregateId);
  assert.equal(Object.hasOwn(result, "evaluation_id"), false);
  assert.equal(result.callback_url, normalized.callback_url);
  assert.deepEqual(result.source_evaluation_ids, [1001, 1002]);
  assert.equal(result.OVERALL_AVERAGE, "3.00");
});

test("n8n document body preserves fractional summary scores independently of transform", () => {
  const normalized = summary(2.5);
  const result = buildDocument(normalized, { rubric: [{ key: "language_and_script", scores: [2.5], average: 2.5 }] });
  assert.equal(result.rubric[0].scores[0], 2.5);
  assert.equal(result.rubric[0].average, 2.5);
  assert.equal(result.OVERALL_AVERAGE, "2.50");
});

test("n8n document body keeps individual ID separate from aggregate", () => {
  const normalized = { document_type: "evaluation", evaluation_id: 1001 };
  const result = buildDocument(normalized, { rubric: [{ scores: [1, 5], average: 3 }] });
  assert.equal(result.evaluation_id, 1001);
  assert.equal(Object.hasOwn(result, "aggregate_id"), false);
});

test("n8n document body rejects missing summary target instead of choosing a source", () => {
  assert.throws(() => buildDocument({ document_type: "video_case_summary", source_evaluation_ids: [1001, 1002] }, { rubric: [{ scores: [3], average: 3 }] }), /aggregate_id is required/);
});
