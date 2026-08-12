import test from "node:test";
import assert from "node:assert/strict";
import { resolveAggregateSourceIds } from "../src/services/videoCaseSourceIds.js";

test("uses ordered relational source rows", () => {
  const result = resolveAggregateSourceIds(
    [
      { evaluation_id: 225, source_position: 2 },
      { evaluation_id: 224, source_position: 1 },
    ],
    [999],
  );
  assert.deepEqual(result, [224, 225]);
});

test("falls back to the compatibility array", () => {
  assert.deepEqual(resolveAggregateSourceIds([], [224, 225]), [224, 225]);
});
