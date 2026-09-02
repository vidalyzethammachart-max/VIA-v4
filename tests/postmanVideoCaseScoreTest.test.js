import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const collection = JSON.parse(
  readFileSync(
    new URL("../postman/VIA-v4-video-case-test.postman_collection.json", import.meta.url),
    "utf8",
  ),
);

function requestNamed(name) {
  return collection.item.find((item) => item.name === name);
}

function scoreValues(request) {
  const payload = JSON.parse(request.request.body.raw)[0];
  return Object.values(payload.rubric).flatMap((section) => Object.values(section));
}

test("includes a score 1 and score 5 video case aggregate smoke test", () => {
  const lowScoreRequest = requestNamed("2A. Create Evaluation - All Scores 1");
  const highScoreRequest = requestNamed("2B. Create Evaluation - All Scores 5");

  assert.ok(requestNamed("1A. Create Score 1-5 Test Case"));
  assert.ok(lowScoreRequest);
  assert.ok(highScoreRequest);
  assert.ok(requestNamed("3A. Verify Score 1-5 Sources"));
  assert.deepEqual(scoreValues(lowScoreRequest), Array(45).fill(1));
  assert.deepEqual(scoreValues(highScoreRequest), Array(45).fill(5));
  assert.match(
    requestNamed("1A. Create Score 1-5 Test Case").request.body.raw,
    /"p_member_role": "leader"/,
  );
});
