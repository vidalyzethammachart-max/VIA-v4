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
    "ประวัติการรวมผลการประเมิน",
    "ชื่อไฟล์",
    "วันที่สร้าง",
    "ผู้รวมผล",
    "รหัสพนักงาน",
    "แบบประเมินที่ใช้",
    "สถานะการวิเคราะห์",
    "สถานะเอกสาร",
    "จัดการ",
  ]) {
    assert.match(pageSource, new RegExp(label.replace(".", "\\.")));
  }
});

test("links each aggregate to its existing summary page", () => {
  assert.match(
    pageSource,
    /buildVideoCaseAggregateSummaryPath\(selectedCase\.id,\s*item\.aggregateId\)/,
  );
  assert.match(pageSource, />\s*ดูสรุปผล\s*</);
  assert.match(pageSource, /className="btn-secondary text-xs"/);
  assert.match(pageSource, /className="btn-danger text-xs"/);
});

test("uses Thai evaluation labels and button actions", () => {
  for (const label of [
    "รายการแบบประเมิน",
    "แบบประเมิน",
    "คะแนนเฉลี่ย",
    "ข้อเสนอแนะโดยรวม",
    "เลือก",
    "ดูสรุปผล",
    "ลบ",
  ]) {
    assert.match(pageSource, new RegExp(label));
  }
  assert.match(pageSource, /to=\{`\/preview\/\$\{run\.id\}`\}/);
  assert.match(pageSource, />เลือก<\/th>/);
  assert.match(pageSource, />ดูสรุปผล<\/th>/);
  assert.match(pageSource, />ลบ<\/th>/);
  assert.match(
    pageSource,
    /ดูสรุปผล<\/th>\s*\{canCombine && <th[^>]*>เลือก<\/th>\}\s*\{canCombine && <th[^>]*>ลบ<\/th>\}/,
  );
  assert.match(pageSource, /className="h-5 w-5 accent-emerald-600"/);
  assert.doesNotMatch(pageSource, />ผลวิเคราะห์ AI<\/th>/);
  assert.doesNotMatch(pageSource, /min-w-40 border-b border-l border-slate-200 px-3 py-3 text-center font-semibold">จัดการ<\/th>/);
  assert.doesNotMatch(pageSource, /เลือกเพื่อรวม/);
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
    /ยังไม่มีการรวมผลแบบประเมินสำหรับ Video Case นี้/,
  );
});
