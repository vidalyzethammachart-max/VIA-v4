import assert from "node:assert/strict";
import test from "node:test";
import { installTsLoader } from "./helpers/tsLoader.js";

installTsLoader();
const { describeEvaluationDeleteError, isEvaluationInUseError } = await import("../src/utils/evaluationDeleteError.ts");

const t = (key) => key;

test("a foreign key violation is recognised as in use and explained", () => {
  const error = { code: "23503", message: "violates foreign key" };
  assert.equal(isEvaluationInUseError(error), true);
  assert.equal(describeEvaluationDeleteError(error, t), "myForms.deleteInUse");
});

test("other failures are not mistaken for in use and keep their detail", () => {
  assert.equal(isEvaluationInUseError({ code: "42501" }), false);
  assert.equal(isEvaluationInUseError(new Error("boom")), false);
  assert.equal(isEvaluationInUseError(null), false);
  assert.equal(describeEvaluationDeleteError({ code: "PGRST116" }, t), "myForms.deleteNotAllowed");
  assert.equal(describeEvaluationDeleteError({ code: "XX000", message: "boom" }, t), "myForms.deleteFailed (boom)");
  assert.equal(describeEvaluationDeleteError(undefined, t), "myForms.deleteFailed");
});
