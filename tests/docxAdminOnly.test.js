import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the storage policy lets only admins read DOCX objects", () => {
  const sql = read("../supabase/migrations/20261117100000_docx_admin_only.sql");
  assert.match(sql, /DROP POLICY IF EXISTS evaluation_documents_read_authenticated ON storage\.objects/);
  assert.match(sql, /bucket_id = 'evaluation-documents'/);
  assert.match(sql, /public\.role_at_least\('admin'::public\.app_role\)\s+OR NOT public\.is_docx_artifact_path\(name\)/);
  for (const table of ["evaluations", "video_case_aggregates", "video_group_evaluations"]) {
    assert.match(sql, new RegExp(`public\\.${table} \\w+ WHERE \\w+\\.docx_storage_path = p_name`), table);
  }
  assert.match(sql, /p_name ILIKE '%\.docx'/);
});

test("document-artifact-url drops the DOCX path for non-admins before signing", () => {
  const source = read("../supabase/functions/document-artifact-url/index.ts");
  const guard = source.indexOf("if (!isAdminRole(role)) docxPath = null;");
  assert.ok(guard > 0, "guard present");
  assert.ok(guard < source.indexOf("if (pdfPath || docxPath)"), "guard runs before the signing branch");
});

test("the preview and my-forms pages only sign or show DOCX for admins", () => {
  const preview = read("../src/page/PreviewPage.tsx");
  assert.match(preview, /record\.docx_storage_path && isAdmin/);
  const forms = read("../src/page/MyFormsDashboard.tsx");
  assert.match(forms, /canDownloadDocx && item\.docx_storage_path/);
  assert.match(forms, /\(canDownloadDocx && item\.docx_storage_path\)/);
});
