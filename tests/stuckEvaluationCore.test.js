import test from "node:test";
import assert from "node:assert/strict";
import { STUCK_EVALUATION_MS, isEvaluationStuck } from "../src/services/stuckEvaluationCore.js";

const now = Date.parse("2026-11-04T10:00:00Z");

test("the stuck threshold matches the 30-minute Analyze Video timeout", () => {
  assert.equal(STUCK_EVALUATION_MS, 30 * 60 * 1000);
});

test("a pending evaluation is stuck from 30 minutes after creation", () => {
  assert.equal(isEvaluationStuck({ document_status: "pending", created_at: "2026-11-04T09:30:00Z" }, now), true);
  assert.equal(isEvaluationStuck({ document_status: "pending", created_at: "2026-11-04T09:30:01Z" }, now), false);
});

test("finished, failed, or undated evaluations are never stuck", () => {
  assert.equal(isEvaluationStuck({ document_status: "ready", created_at: "2026-11-01T00:00:00Z" }, now), false);
  assert.equal(isEvaluationStuck({ document_status: "failed", created_at: "2026-11-01T00:00:00Z" }, now), false);
  assert.equal(isEvaluationStuck({ document_status: "pending", created_at: "not a date" }, now), false);
  assert.equal(isEvaluationStuck(null, now), false);
});
