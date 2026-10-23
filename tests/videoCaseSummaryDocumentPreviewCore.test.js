import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("registers the protected aggregate document preview route", () => {
  const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(
    appSource,
    /path="\/video-cases\/:videoCaseId\/summaries\/:summaryId\/preview"\s+element=\{\s*<ProtectedRoute>\s*<VideoCaseSummaryDocumentPreviewPage \/>\s*<\/ProtectedRoute>\s*\}/,
  );
});

test("guards aggregate polling and signed URL lifecycle", () => {
  const pageSource = readFileSync(
    new URL("../src/page/VideoCaseSummaryDocumentPreviewPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(pageSource, /const SIGNED_URL_REFRESH_MS = 50 \* 60 \* 1000;/);
  assert.match(pageSource, /const SIGNED_URL_RETRY_MS = 30 \* 1000;/);
  assert.match(pageSource, /nextRefreshDelay = SIGNED_URL_RETRY_MS;/);
  assert.match(pageSource, /artifactUrls \? null : artifactError/);
  assert.match(pageSource, /setLoading\(true\);\s*setAggregate\(null\);/);
  assert.match(pageSource, /aggregate\.id === summaryId/);
  assert.match(pageSource, /aggregate\.video_case_id === videoCaseId/);
  assert.match(pageSource, /window\.setTimeout\(poll, POLL_INTERVAL_MS\)/);
  assert.doesNotMatch(pageSource, /window\.setInterval\(/);
});

test("links summary document states to the nested preview page", () => {
  const summaryPageSource = readFileSync(
    new URL("../src/page/VideoCaseSummaryPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    summaryPageSource,
    /import\s+\{\s*buildVideoCaseSummaryDocumentPreviewPath\s*\}\s+from\s+"\.\.\/services\/videoCaseSummaryDocumentPreviewCore";/,
  );
  assert.match(
    summaryPageSource,
    /buildVideoCaseSummaryDocumentPreviewPath\(videoCaseId,\s*aggregate\.id\)/,
  );
  assert.match(
    summaryPageSource,
    /aggregate\?\.document_status === "ready"\s*&&\s*\(aggregate\.pdf_storage_path \|\| aggregate\.docx_storage_path\)\s*\?\s*"ดูเอกสาร"/,
  );
  assert.match(
    summaryPageSource,
    /aggregate\?\.document_status === "pending" \|\| aggregate\?\.document_status === "failed"\s*\?\s*"ตรวจสอบสถานะเอกสาร"/,
  );
  assert.match(
    summaryPageSource,
    /aggregate\?\.document_status === "failed"\s*\?\s*"ตรวจสอบสถานะเอกสาร"\s*:\s*null;/,
  );
  assert.match(summaryPageSource, />\s*ดูเอกสาร\s*</);
  assert.match(summaryPageSource, />\s*ตรวจสอบสถานะเอกสาร\s*</);
  assert.doesNotMatch(summaryPageSource, /getVideoCaseAggregateDocumentUrls/);
  assert.doesNotMatch(summaryPageSource, /<iframe/);
});
