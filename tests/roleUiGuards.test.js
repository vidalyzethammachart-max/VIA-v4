import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the dashboard offers 'PDF / DOCX' only to admins and 'PDF' to everyone else", () => {
  const source = read("../src/page/Dashboard.tsx");
  assert.match(source, /roleAtLeast\(normalizeRole\(authRole\), "admin"\) \? "PDF \/ DOCX" : "PDF"/);
  assert.doesNotMatch(source, />PDF \/ DOCX<\/Link>/);
  assert.equal((source.match(/\{documentLabel\}<\/Link>/g) ?? []).length, 2);
});

test("the evaluation preview shows its delete button only to the owner or an admin", () => {
  const source = read("../src/page/PreviewPage.tsx");
  assert.match(source, /const canDelete = Boolean\(record && authUser && \(record\.user_id === authUser\.id \|\| isAdmin\)\)/);
  assert.match(source, /\{canDelete && \(\s*<button[^>]*\s+type="button"\s+onClick=\{\(\) => setDeleteConfirmOpen\(true\)\}/);
});

test("the group create page sends non-admins who lead no case back to the group list", () => {
  const source = read("../src/page/VideoGroupCreatePage.tsx");
  assert.match(source, /isLeaderOfAnyVideoCase\(authUser\.id\)/);
  assert.match(source, /if \(!cancelled && !leader\) navigate\("\/video-groups", \{ replace: true \}\)/);
  assert.match(source, /if \(authLoading \|\| !authUser \|\| isAdmin\) return;/);
});
