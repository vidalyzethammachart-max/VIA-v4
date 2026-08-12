import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../src/page/VideoCaseDetailPage.tsx", import.meta.url),
  "utf8",
);
const serviceSource = readFileSync(
  new URL("../src/services/videoCaseService.ts", import.meta.url),
  "utf8",
);

test("renders the aggregate audit columns", () => {
  for (const label of [
    "Aggregate history",
    "Aggregate",
    "Created",
    "Created by",
    "Employee no.",
    "Sources",
    "Analysis",
    "Document",
    "Action",
  ]) {
    assert.match(pageSource, new RegExp(label.replace(".", "\\.")));
  }
});

test("links each aggregate to its existing summary page", () => {
  assert.match(
    pageSource,
    /buildVideoCaseAggregateSummaryPath\(selectedCase\.id,\s*item\.aggregateId\)/,
  );
  assert.match(pageSource, />\s*View summary\s*</);
});

test("guards aggregate deletion with leader permission and confirmation", () => {
  assert.match(pageSource, /canCombine\s*&&\s*\(/);
  assert.match(pageSource, /setAggregateToDelete\(aggregate\)/);
  assert.match(pageSource, /await deleteVideoCaseAggregate\(aggregateToDelete\.id\)/);
  assert.match(pageSource, /await loadCaseData\(selectedCase\.id\)/);
  assert.match(pageSource, /title="Delete aggregate"/);
  assert.match(
    serviceSource,
    /\.delete\(\)\s*\.eq\("id", aggregateId\)\s*\.select\("id"\)\s*\.maybeSingle\(\)/,
  );
  assert.match(
    serviceSource,
    /Aggregate not found or you do not have permission to delete it\./,
  );
});

test("shows an explicit empty aggregate history state", () => {
  assert.match(
    pageSource,
    /No evaluation summaries have been combined for this Video Case yet\./,
  );
});
