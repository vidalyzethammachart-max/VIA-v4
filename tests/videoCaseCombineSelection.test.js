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

import {
  COMBINE_MIN_MESSAGE,
  MIN_COMBINE_COUNT,
  getCombineBlockReason,
} from "../src/services/videoCaseCombineSelectionCore.js";

test("the minimum is two", () => {
  assert.equal(MIN_COMBINE_COUNT, 2);
  assert.match(COMBINE_MIN_MESSAGE, /อย่างน้อย 2/);
});

test("fewer than two ready evaluations cannot be combined", () => {
  assert.equal(getCombineBlockReason(runs, []), COMBINE_MIN_MESSAGE);
  assert.equal(getCombineBlockReason(runs, [333]), COMBINE_MIN_MESSAGE);
});

test("two ready evaluations can be combined", () => {
  assert.equal(getCombineBlockReason(runs, [333, 332]), null);
});

test("pending and failed selections do not count toward the minimum", () => {
  assert.equal(getCombineBlockReason(runs, [333, 334, 331]), COMBINE_MIN_MESSAGE);
});

test("the same evaluation selected twice counts once", () => {
  assert.equal(getCombineBlockReason(runs, [333, 333]), COMBINE_MIN_MESSAGE);
});
