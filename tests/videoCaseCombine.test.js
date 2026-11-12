import test from "node:test";
import assert from "node:assert/strict";
import { combineAggregateStatistics } from "../src/services/aggregateStatistics.js";

// Per-case combineVideoCaseAnalyses was retired; group creation (min-count, source ids,
// no duplicate AI request, DB failure) is covered by videoGroupService.test.js.
test("null scores are skipped, not counted as zero", () => {
  const mixed = combineAggregateStatistics([{ rubric: { a: { q1: null } } }, { rubric: { a: { q1: 4 } } }]);
  assert.equal(mixed.aggregatedScores.a.q1, 4);
  const none = combineAggregateStatistics([{ rubric: { a: { q1: null } } }, { rubric: { a: { q1: null } } }]);
  assert.equal(Object.hasOwn(none.aggregatedScores.a ?? {}, "q1"), false);
});
