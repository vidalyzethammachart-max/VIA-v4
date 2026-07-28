import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVideoCaseSummaryDocumentPreviewPath,
  resolveVideoCaseSummaryDocumentState,
} from "../src/services/videoCaseSummaryDocumentPreviewCore.js";

const base = {
  video_case_id: "case-1",
  document_status: "ready",
  document_error: null,
  pdf_storage_path: "video-case-aggregates/a/result.pdf",
  docx_storage_path: "video-case-aggregates/a/result.docx",
};

test("builds the nested aggregate document preview route", () => {
  assert.equal(
    buildVideoCaseSummaryDocumentPreviewPath("case 1", "aggregate/1"),
    "/video-cases/case%201/summaries/aggregate%2F1/preview",
  );
});

test("rejects an aggregate from another video case", () => {
  assert.deepEqual(
    resolveVideoCaseSummaryDocumentState(base, "case-2"),
    { kind: "mismatched_case" },
  );
});

test("classifies pending and failed aggregates", () => {
  assert.deepEqual(
    resolveVideoCaseSummaryDocumentState(
      { ...base, document_status: "pending" },
      "case-1",
    ),
    { kind: "pending" },
  );
  assert.deepEqual(
    resolveVideoCaseSummaryDocumentState(
      { ...base, document_status: "failed", document_error: "generation failed" },
      "case-1",
    ),
    { kind: "failed", error: "generation failed" },
  );
});

test("requires at least one artifact for a ready aggregate", () => {
  assert.deepEqual(
    resolveVideoCaseSummaryDocumentState(
      { ...base, pdf_storage_path: null, docx_storage_path: null },
      "case-1",
    ),
    { kind: "ready_without_artifact" },
  );
});

test("returns available formats for a ready aggregate", () => {
  assert.deepEqual(
    resolveVideoCaseSummaryDocumentState(base, "case-1"),
    { kind: "ready", hasPdf: true, hasDocx: true },
  );
});
