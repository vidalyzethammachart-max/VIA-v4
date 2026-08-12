import test from "node:test";
import assert from "node:assert/strict";
import { resolveDocumentTarget } from "../supabase/functions/_shared/documentTarget.js";

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
