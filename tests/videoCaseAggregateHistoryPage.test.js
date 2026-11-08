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
    "ประวัติแบบประเมินกลุ่ม",
    "ชื่อไฟล์",
    "วันที่สร้าง",
    "ผู้รวม",
    "แบบประเมินที่ใช้",
    "สถานะ",
    "จัดการ",
  ]) {
    assert.match(pageSource, new RegExp(label));
  }
});

test("links each aggregate to its existing summary page", () => {
  assert.match(
    pageSource,
    /buildVideoCaseAggregateSummaryPath\(selectedCase\.id,\s*item\.aggregateId\)/,
  );
  assert.match(
    pageSource,
    /buildVideoCaseSummaryDocumentPreviewPath\(selectedCase\.id,\s*item\.aggregateId\)/,
  );
});

test("uses Thai evaluation labels and links each evaluation to its summary", () => {
  for (const label of [
    "รายการแบบประเมิน",
    "คะแนนเฉลี่ย",
    "ข้อเสนอแนะโดยรวม",
    "สถานะ",
    "ลบ",
  ]) {
    assert.match(pageSource, new RegExp(label));
  }
  assert.match(pageSource, /to=\{`\/preview\/\$\{run\.id\}`\}/);
  assert.match(pageSource, /disabled=\{!combinable\}/);
  assert.doesNotMatch(pageSource, /เลือกเพื่อรวม/);
});

test("guards aggregate deletion with leader permission and confirmation", () => {
  assert.match(pageSource, /canCombine\s*&&\s*\(/);
  assert.match(pageSource, /setAggregateToDelete\(aggregate\)/);
  assert.match(pageSource, /await deleteVideoCaseAggregate\(aggregateToDelete\.id\)/);
  assert.match(pageSource, /await loadCaseData\(selectedCase\.id\)/);
  assert.match(pageSource, /title="ลบแบบประเมินกลุ่ม"/);
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
  assert.match(pageSource, /ยังไม่มีแบบประเมินกลุ่มในงานประเมินนี้/);
});

test("the page uses the shared dashboard design without the old card classes", () => {
  assert.match(pageSource, /className="db-root"/);
  assert.match(pageSource, /className="db-table /);
  assert.doesNotMatch(pageSource, /rounded-2xl border border-slate-200 bg-white/);
});
