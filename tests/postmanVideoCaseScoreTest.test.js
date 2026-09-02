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
  const sendLowScoreRequest = requestNamed("3A. Send Score 1 Evaluation to n8n");
  const sendHighScoreRequest = requestNamed("3B. Send Score 5 Evaluation to n8n");

  assert.ok(requestNamed("1A. Create Score 1-5 Test Case"));
  assert.ok(lowScoreRequest);
  assert.ok(highScoreRequest);
  assert.ok(sendLowScoreRequest);
  assert.ok(sendHighScoreRequest);
  assert.ok(requestNamed("4A. Verify Score 1-5 Sources"));
  assert.deepEqual(scoreValues(lowScoreRequest), Array(45).fill(1));
  assert.deepEqual(scoreValues(highScoreRequest), Array(45).fill(5));
  assert.match(sendLowScoreRequest.request.body.raw, /"scores": \[1, 1, 1, 1, 1\]/);
  assert.match(sendHighScoreRequest.request.body.raw, /"scores": \[5, 5, 5, 5, 5\]/);
  assert.match(JSON.stringify(sendLowScoreRequest.event), /evaluation_id_low/);
  assert.match(JSON.stringify(sendHighScoreRequest.event), /evaluation_id_high/);
  assert.match(
    requestNamed("1A. Create Score 1-5 Test Case").request.body.raw,
    /"p_member_role": "leader"/,
  );
});
