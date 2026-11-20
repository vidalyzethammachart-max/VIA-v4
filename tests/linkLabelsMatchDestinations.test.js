import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// Extract the text of the first <Link to="..."> whose target matches `to`.
function linkText(source, to) {
  const escaped = to.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const match = source.match(new RegExp(`<Link\\s+to=${escaped}[\\s\\S]*?>([\\s\\S]*?)</Link>`));
  assert.ok(match, `no <Link to=${to}> found`);
  return match[1].replace(/\s+/g, " ").trim();
}

test("the preview's 'view stuck list' link opens the stuck jobs page, not the admin dashboard", () => {
  const source = read("../src/page/PreviewPage.tsx");
  assert.match(linkText(source, '"/admin/stuck-jobs"'), /preview\.stuckAdminList/);
  assert.doesNotMatch(source, /<Link to="\/admin" className="btn-secondary text-sm">\s*\{t\("preview\.stuckAdminList"\)\}/);
});

test("the case page's back button names its real destination, the group list", () => {
  const source = read("../src/page/VideoCaseDetailPage.tsx");
  assert.equal(linkText(source, '"/video-groups"'), "กลับไปรายการแบบประเมินกลุ่ม");
  assert.doesNotMatch(source, /กลับไปรายการวิดีโอ/);
});

test("both pages that go back to a case use the same Thai label", () => {
  const summary = read("../src/page/VideoCaseSummaryPage.tsx");
  const preview = read("../src/page/VideoCaseSummaryDocumentPreviewPage.tsx");
  assert.match(linkText(summary, "{`/video-cases/${videoCaseId}`}"), /กลับไปวิดีโอ/);
  assert.match(linkText(preview, "{`/video-cases/${videoCaseId}`}"), /กลับไปวิดีโอ/);
  assert.doesNotMatch(summary, /Back to video case/);
  assert.doesNotMatch(preview, /กลับไป Video Case/);
});

test("the dashboard names the group list like the menu does, through i18n", () => {
  const source = read("../src/page/Dashboard.tsx");
  const text = linkText(source, '"/video-groups"');
  assert.match(text, /videoGroups\.navLabel/);
  assert.match(text, /videoGroups\.navLabelResults/);
  assert.doesNotMatch(source, /Video group evaluations/);
});
