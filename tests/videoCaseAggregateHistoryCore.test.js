import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVideoCaseAggregateHistoryItem,
  buildVideoCaseAggregateSummaryPath,
} from "../src/services/videoCaseAggregateHistoryCore.js";

const aggregate = {
  id: "12345678-aaaa-bbbb-cccc-123456789012",
  requested_by_name: "  History Leader  ",
  requested_by_employee_number: "  HIST-001  ",
  source_evaluation_ids: [224, "225", 224, 0, null],
  source_count: 2,
  status: "ready",
  document_status: "pending",
  created_at: "2026-07-28T10:00:00.000Z",
  source_snapshot: {
    case_title: "Postman Test",
  },
};

test("builds a normalized aggregate history item", () => {
  assert.deepEqual(buildVideoCaseAggregateHistoryItem(aggregate), {
    aggregateId: "12345678-aaaa-bbbb-cccc-123456789012",
    shortAggregateId: "12345678",
    creatorName: "History Leader",
    employeeNumber: "HIST-001",
    sourceEvaluationIds: [224, 225],
    sourceCount: 2,
    analysisStatus: "ready",
    documentStatus: "pending",
    createdAt: "2026-07-28T10:00:00.000Z",
    fileName: "Postman Test - รายงานสรุปผลการประเมิน.pdf",
  });
});

test("uses neutral fallbacks for missing historical identity", () => {
  const result = buildVideoCaseAggregateHistoryItem({
    ...aggregate,
    requested_by_name: null,
    requested_by_employee_number: null,
    source_evaluation_ids: [],
    source_count: 0,
  });

  assert.equal(result.creatorName, "Unknown user");
  assert.equal(result.employeeNumber, "-");
  assert.deepEqual(result.sourceEvaluationIds, []);
});

test("builds the existing nested summary route", () => {
  assert.equal(
    buildVideoCaseAggregateSummaryPath("case 1", "aggregate/1"),
    "/video-cases/case%201/summaries/aggregate%2F1",
  );
});
