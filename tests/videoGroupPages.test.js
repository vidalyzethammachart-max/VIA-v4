import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("create page wires selection, naming, review and creation", () => {
  const source = read("../src/page/VideoGroupCreatePage.tsx");
  assert.match(source, /export default function VideoGroupCreatePage/);
  for (const name of [
    "getSelectableEvaluations",
    "CaseEvaluationPicker",
    "GROUP_TYPES",
    "validateVideoGroupForm",
    "createVideoGroupEvaluation",
    "getCombineBlockReason",
    "combineAggregateStatistics",
  ]) {
    assert.match(source, new RegExp(name), `${name} missing`);
  }
  assert.match(source, /searchParams\.get\(\s*"caseId"\s*\)/);
  assert.match(source, /navigate\(`\/video-groups\/\$\{/);
  assert.match(source, /finally\s*{[^}]*setBusy\(false\)/);
});

test("picker shows the case label when video_cases is present", () => {
  const source = read("../src/components/CaseEvaluationPicker.tsx");
  assert.match(source, /video_cases/);
  assert.match(source, /case_title \|\| [\w.?]*case_key/);
});

test("page does not re-merge hidden selected ids when the picker changes", () => {
  const source = read("../src/page/VideoGroupCreatePage.tsx");
  assert.match(source, /onChange=\{setSelectedIds\}/);
  assert.doesNotMatch(source, /selectedIds\.filter\(\(id\) => !visible\.has\(id\)\)/);
});

test("picker accepts a block reason and count override computed from the full list", () => {
  const picker = read("../src/components/CaseEvaluationPicker.tsx");
  assert.match(picker, /blockReason\?: string \| null/);
  assert.match(picker, /selectedCount\?: number/);
  assert.match(picker, /blockReasonOverride !== undefined/);
  const page = read("../src/page/VideoGroupCreatePage.tsx");
  assert.match(page, /blockReason=\{blockReason\}/);
  assert.match(page, /selectedCount=\{selected\.length\}/);
});

test("every videoGroups translation key used by the page exists in th and en", () => {
  const source = read("../src/page/VideoGroupCreatePage.tsx");
  const keys = [...new Set([...source.matchAll(/t\(\s*"(videoGroups\.[^"]+)"/g)].map((m) => m[1]))];
  assert.ok(keys.length > 5, "expected the page to use videoGroups.* keys");
  const translations = read("../src/i18n/translations.ts");
  const enStart = translations.indexOf("  en: {");
  assert.ok(enStart > 0);
  const th = translations.slice(0, enStart);
  const en = translations.slice(enStart);
  for (const key of keys) {
    assert.ok(th.includes(`"${key}":`), `th missing ${key}`);
    assert.ok(en.includes(`"${key}":`), `en missing ${key}`);
  }
});

test("App registers the three group routes with a plain ProtectedRoute", () => {
  const app = read("../src/App.tsx");
  for (const [path, component] of [
    ["/video-groups", "VideoGroupsPage"],
    ["/video-groups/new", "VideoGroupCreatePage"],
    ["/video-groups/:groupId", "VideoGroupDetailPage"],
  ]) {
    const re = new RegExp(
      `path="${path}"\\s+element=\\{\\s*<ProtectedRoute>\\s*<${component} />\\s*</ProtectedRoute>`,
    );
    assert.match(app, re, `${path} route missing or not a plain ProtectedRoute`);
  }
});

test("list page uses getVideoGroups and links to the create page", () => {
  const source = read("../src/page/VideoGroupsPage.tsx");
  assert.match(source, /export default function VideoGroupsPage/);
  assert.match(source, /getVideoGroups/);
  assert.match(source, /buildVideoGroupDisplayName/);
  assert.match(source, /["'`]\/video-groups\/new["'`]/);
  assert.match(source, /["'`]\/video-groups\/\$\{/);
});

test("detail page sends, links to the document preview and takes sources from the sources table", () => {
  const source = read("../src/page/VideoGroupDetailPage.tsx");
  assert.match(source, /export default function VideoGroupDetailPage/);
  for (const name of [
    "sendVideoGroupToN8n",
    "getVideoGroupSources",
    "buildCombinedSuggestionDraft",
    "submittingRef",
    "SectionCard",
  ]) {
    assert.match(source, new RegExp(name), `${name} missing`);
  }
  assert.match(source, /finally\s*{[^}]*submittingRef\.current = false/);
  assert.doesNotMatch(source, /source_runs[^;\n]*(case_title|case_key|video_case)/);
  assert.match(source, /video_case_id/);
});

test("navigation links to /video-groups from the dropdown and Home", () => {
  assert.match(read("../src/components/ProfileDropdown.tsx"), /\/video-groups/);
  assert.match(read("../src/page/Home.tsx"), /\/video-groups/);
});

test("every videoGroups key used by list and detail pages exists in th and en", () => {
  const translations = read("../src/i18n/translations.ts");
  const enStart = translations.indexOf("  en: {");
  const th = translations.slice(0, enStart);
  const en = translations.slice(enStart);
  for (const file of [
    "../src/page/VideoGroupsPage.tsx",
    "../src/page/VideoGroupDetailPage.tsx",
    "../src/components/ProfileDropdown.tsx",
    "../src/page/Home.tsx",
  ]) {
    const keys = [...new Set([...read(file).matchAll(/t\(\s*"(videoGroups\.[^"]+)"/g)].map((m) => m[1]))];
    for (const key of keys) {
      assert.ok(th.includes(`"${key}":`), `th missing ${key}`);
      assert.ok(en.includes(`"${key}":`), `en missing ${key}`);
    }
  }
});

test("detail page resets stale state on load and clears the group when the load fails", () => {
  const source = read("../src/page/VideoGroupDetailPage.tsx");
  const effect = source.slice(source.indexOf("const load = async"), source.indexOf("void load();"));
  for (const reset of ["setGroup(null)", "setSources([])", "setCaseLabels({})", "setSendError(null)", "setSourcesError(null)"]) {
    assert.ok(effect.includes(reset), `${reset} missing from load`);
  }
  const catchBlock = effect.slice(effect.lastIndexOf("catch (error)"));
  assert.match(catchBlock, /setGroup\(null\)/);
});

test("detail page reports a sources-load failure separately from an empty list", () => {
  const source = read("../src/page/VideoGroupDetailPage.tsx");
  assert.match(source, /sourcesError/);
  assert.match(source, /t\("videoGroups\.sourcesLoadFailed"\)/);
  const translations = read("../src/i18n/translations.ts");
  const enStart = translations.indexOf("  en: {");
  assert.ok(translations.slice(0, enStart).includes('"videoGroups.sourcesLoadFailed":'));
  assert.ok(translations.slice(enStart).includes('"videoGroups.sourcesLoadFailed":'));
});

test("draft groups show a not-sent label, never the generating notice", () => {
  const detail = read("../src/page/VideoGroupDetailPage.tsx");
  assert.match(detail, /documentStatus === "draft" && \(/);
  assert.match(detail, /t\("videoGroups\.docDraft"\)/);
  // The generating/refresh-later notice stays limited to pending.
  assert.match(detail, /documentStatus === "pending" && \(\s*<p[^>]*>\s*\{t\("videoGroups\.docPending"\)\}/);
  assert.doesNotMatch(detail, /documentStatus !== "ready"[^\n]*docPending/);
  // The send button is only disabled while sending or when ready (draft stays enabled).
  assert.match(detail, /disabled=\{sending \|\| documentStatus === "ready"\}/);
  const service = read("../src/services/videoGroupService.ts");
  assert.match(service, /document_status: "draft" \| "pending" \| "ready" \| "failed"/);
  const translations = read("../src/i18n/translations.ts");
  const enStart = translations.indexOf("  en: {");
  for (const part of [translations.slice(0, enStart), translations.slice(enStart)]) {
    assert.ok(part.includes('"videoGroups.docStatus.draft":'));
    assert.ok(part.includes('"videoGroups.docDraft":'));
  }
  assert.match(translations.slice(0, enStart), /"videoGroups\.docStatus\.draft": "ยังไม่ได้ส่ง"/);
});

test("detail page shows the send button only to the requester or an admin", () => {
  const detail = read("../src/page/VideoGroupDetailPage.tsx");
  assert.match(detail, /useAuthRole\(\)/);
  assert.match(detail, /roleAtLeast\(normalizeRole\(role\), "admin"\)/);
  assert.match(detail, /const canSend = Boolean\(group && user && \(group\.requested_by === user\.id \|\| isAdmin\)\)/);
  assert.match(detail, /\{canSend \? \(\s*<>\s*<button type="submit"/);
  assert.match(detail, /t\("videoGroups\.sendNotAllowed"\)/);
  // The submit handler also refuses for non-authorized readers.
  assert.match(detail, /if \(!group \|\| !canSend \|\| submittingRef\.current\)/);
  const translations = read("../src/i18n/translations.ts");
  const enStart = translations.indexOf("  en: {");
  assert.ok(translations.slice(0, enStart).includes('"videoGroups.sendNotAllowed":'));
  assert.ok(translations.slice(enStart).includes('"videoGroups.sendNotAllowed":'));
});

test("group preview page polls, previews the PDF and is routed; sending opens it", () => {
  const page = read("../src/page/VideoGroupDocumentPreviewPage.tsx");
  assert.match(page, /export default function VideoGroupDocumentPreviewPage/);
  for (const name of ["getVideoGroup(", "getVideoGroupDocumentUrls", "POLL_INTERVAL_MS", "<iframe", "buildDocumentDownloadUrl"]) {
    assert.ok(page.includes(name), `${name} missing`);
  }
  assert.match(read("../src/App.tsx"), /path="\/video-groups\/:groupId\/preview"/);
  const detail = read("../src/page/VideoGroupDetailPage.tsx");
  assert.match(detail, /navigate\(`\/video-groups\/\$\{updated\.id\}\/preview`\)/);
  assert.match(detail, /\/video-groups\/\$\{group\.id\}\/preview/);

  const keys = [...new Set([...page.matchAll(/t\(\s*"(videoGroups\.[^"]+)"/g)].map((m) => m[1]))];
  const translations = read("../src/i18n/translations.ts");
  const enStart = translations.indexOf("  en: {");
  for (const key of keys) {
    assert.ok(translations.slice(0, enStart).includes(`"${key}":`), `th missing ${key}`);
    assert.ok(translations.slice(enStart).includes(`"${key}":`), `en missing ${key}`);
  }
});

test("list opens the preview, deletes with confirmation and paints status badges", () => {
  const list = read("../src/page/VideoGroupsPage.tsx");
  assert.match(list, /to=\{`\/video-groups\/\$\{group\.id\}\/preview`\}/);
  assert.doesNotMatch(list, /to=\{`\/video-groups\/\$\{group\.id\}`\}/);
  for (const name of ["deleteVideoGroup", "ConfirmModal", "STATUS_STYLES", "requested_by === userId"]) {
    assert.ok(list.includes(name), `${name} missing`);
  }
  assert.match(list, /document_status !== "pending"/);
  const preview = read("../src/page/VideoGroupDocumentPreviewPage.tsx");
  assert.match(preview, /deleteVideoGroup/);
  assert.match(preview, /previewReviewAndSend/);
});

test("create page names the group first and the picker pages by 10", () => {
  const page = read("../src/page/VideoGroupCreatePage.tsx");
  const nameAt = page.indexOf('t("videoGroups.step1")');
  const pickAt = page.indexOf('t("videoGroups.step2")');
  const reviewAt = page.indexOf('t("videoGroups.step3")');
  assert.ok(nameAt > 0 && nameAt < pickAt && pickAt < reviewAt, "steps are out of order");
  assert.ok(page.indexOf("videoGroups.orderNumber") < page.indexOf("<CaseEvaluationPicker"));
  const picker = read("../src/components/CaseEvaluationPicker.tsx");
  assert.match(picker, /PAGE_SIZE = 10/);
  assert.match(picker, /analyses\.slice\(/);
  const translations = read("../src/i18n/translations.ts");
  assert.match(translations, /"videoGroups\.step1": "1\. ตั้งชื่อกลุ่ม"/);
  assert.match(translations, /"videoGroups\.step2": "2\. เลือกแบบประเมิน"/);
});

test("delete migration only lets the creator or an admin delete non-pending groups", () => {
  const sql = read("../supabase/migrations/20261112092000_video_group_delete.sql");
  assert.match(sql, /create policy video_group_evaluations_delete_owner_or_admin/i);
  assert.match(sql, /for delete/i);
  assert.match(sql, /document_status <> 'pending'/i);
  assert.match(sql, /requested_by = auth\.uid\(\)/i);
  assert.match(sql, /role_at_least\('admin'::public\.app_role\)/i);
  assert.doesNotMatch(sql, /for\s+(insert|update|all)\b/i);
  const service = read("../src/services/videoGroupService.ts");
  assert.match(service, /\.from\("video_group_evaluations"\)\s*\.delete\(\)\s*\.eq\("id", id\)\s*\.select\("id"\)\s*\.maybeSingle\(\)/);
});
