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

test("uses Thai evaluation labels and button actions", () => {
  for (const label of [
    "รายการแบบประเมิน",
    "แบบประเมิน",
    "คะแนนเฉลี่ย",
    "ข้อเสนอแนะโดยรวม",
    "ดูสรุปผล",
    "ลบ",
  ]) {
    assert.match(pageSource, new RegExp(label));
  }
  assert.match(pageSource, /to=\{`\/preview\/\$\{run\.id\}`\}/);
  assert.match(pageSource, />ดูสรุปผล<\/th>/);
  assert.match(pageSource, />ลบ<\/th>/);
  assert.match(
    pageSource,
    /ดูสรุปผล<\/th>\s*\{canCombine && <th[^>]*>ลบ<\/th>\}/,
  );
  assert.doesNotMatch(pageSource, /disabled=\{!combinable\}/);
  assert.match(pageSource, />สถานะ<\/th>/);
  assert.doesNotMatch(pageSource, />ผลวิเคราะห์ AI<\/th>/);
  assert.doesNotMatch(pageSource, /min-w-40 border-b border-l border-slate-200 px-3 py-3 text-center font-semibold">จัดการ<\/th>/);
  assert.doesNotMatch(pageSource, /เลือกเพื่อรวม/);
});

test("old per-case aggregate history is replaced by video groups", () => {
  assert.doesNotMatch(pageSource, /ประวัติการรวมผลการประเมิน/);
  assert.doesNotMatch(pageSource, /deleteVideoCaseAggregate|getVideoCaseAggregates|aggregateToDelete/);
  assert.match(pageSource, /\/video-groups\/new\?caseId=/);
  const casesPage = readFileSync(new URL("../src/page/VideoCasesPage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(casesPage, /getVideoCaseAggregates|ผลรวมล่าสุด/);
  assert.match(casesPage, /\/video-groups\/new\?caseId=/);
});
