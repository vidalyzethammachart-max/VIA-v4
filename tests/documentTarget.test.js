import test from "node:test";
import assert from "node:assert/strict";
import { resolveDocumentTarget, resolveDocumentTargetWithGroups } from "../supabase/functions/_shared/documentTarget.js";

test("resolves an individual evaluation", () => {
  assert.deepEqual(
    resolveDocumentTarget({ document_type: "evaluation", evaluation_id: 224 }),
    {
      kind: "evaluation",
      table: "evaluations",
      id: 224,
      documentType: "evaluation",
    },
  );
});

test("resolves a video case summary", () => {
  const aggregateId = "61abc689-868a-4bc7-a0b0-000000000000";
  assert.deepEqual(
    resolveDocumentTarget({
      document_type: "video_case_summary",
      aggregate_id: aggregateId,
    }),
    {
      kind: "aggregate",
      table: "video_case_aggregates",
      id: aggregateId,
      documentType: "video_case_summary",
    },
  );
});

test("keeps legacy single-identifier payloads compatible", () => {
  assert.deepEqual(resolveDocumentTarget({ evaluation_id: 224 }), {
    kind: "evaluation",
    table: "evaluations",
    id: 224,
    documentType: "evaluation",
  });

  assert.deepEqual(
    resolveDocumentTarget({
      aggregate_id: "61abc689-868a-4bc7-a0b0-000000000000",
    }),
    {
      kind: "aggregate",
      table: "video_case_aggregates",
      id: "61abc689-868a-4bc7-a0b0-000000000000",
      documentType: "video_case_summary",
    },
  );
});

test("rejects mixed evaluation and aggregate identifiers", () => {
  assert.throws(
    () =>
      resolveDocumentTarget({
        document_type: "video_case_summary",
        aggregate_id: "61abc689-868a-4bc7-a0b0-000000000000",
        evaluation_id: 224,
      }),
    /must not contain both/,
  );
});

test("rejects an identifier that does not match document_type", () => {
  assert.throws(
    () =>
      resolveDocumentTarget({
        document_type: "evaluation",
        aggregate_id: "61abc689-868a-4bc7-a0b0-000000000000",
      }),
    /evaluation_id is required/,
  );
});

const GROUP_ID = "71abc689-868a-4bc7-a0b0-000000000001";

test("a UUID that is a group resolves to the group kind", async () => {
  const seen = [];
  const target = await resolveDocumentTargetWithGroups(
    { document_type: "video_case_summary", aggregate_id: GROUP_ID },
    async (id) => { seen.push(id); return true; },
  );
  assert.deepEqual(target, {
    kind: "group", table: "video_group_evaluations", id: GROUP_ID, documentType: "video_case_summary",
  });
  assert.deepEqual(seen, [GROUP_ID]);
});

test("an unknown UUID stays a legacy aggregate", async () => {
  const target = await resolveDocumentTargetWithGroups(
    { document_type: "video_case_summary", aggregate_id: GROUP_ID },
    async () => false,
  );
  assert.deepEqual(target, {
    kind: "aggregate", table: "video_case_aggregates", id: GROUP_ID, documentType: "video_case_summary",
  });
});

test("evaluation payloads never look up groups", async () => {
  let calls = 0;
  const target = await resolveDocumentTargetWithGroups(
    { document_type: "evaluation", evaluation_id: 5 },
    async () => { calls += 1; return true; },
  );
  assert.equal(target.kind, "evaluation");
  assert.equal(calls, 0);
});

test("invalid payloads still throw", async () => {
  await assert.rejects(resolveDocumentTargetWithGroups({ document_type: "x" }, async () => true));
});
