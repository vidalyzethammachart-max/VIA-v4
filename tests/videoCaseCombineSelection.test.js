import test from "node:test";
import assert from "node:assert/strict";
import {
  getCombinableEvaluationIds,
  isCombinableEvaluation,
  keepCombinableSelection,
} from "../src/services/videoCaseCombineSelectionCore.js";

const runs = [
  { id: 334, document_status: "pending" },
  { id: 333, document_status: "ready" },
  { id: 332, document_status: "ready" },
  { id: 331, document_status: "failed" },
];

test("only evaluations with a ready document can be combined", () => {
  assert.equal(isCombinableEvaluation({ document_status: "ready" }), true);
  assert.equal(isCombinableEvaluation({ document_status: "pending" }), false);
  assert.equal(isCombinableEvaluation({ document_status: "failed" }), false);
  assert.equal(isCombinableEvaluation({ document_status: null }), false);
});

test("default selection skips pending and failed evaluations", () => {
  assert.deepEqual(getCombinableEvaluationIds(runs), [333, 332]);
});

test("a stale selection drops evaluations that are not ready", () => {
  assert.deepEqual(keepCombinableSelection(runs, [334, 333, 331, 999]), [333]);
});
