import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("editors may create a group evaluation, not only admins and case leaders", () => {
  const sql = read("../supabase/migrations/20261114090000_video_group_editor_create.sql");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_video_group_evaluation\(/);
  assert.match(sql, /caller_is_editor := public\.role_at_least\('editor'::public\.app_role\)/);
  assert.match(sql, /IF NOT caller_is_editor AND NOT EXISTS/);
  // Editors still need to see every source case.
  assert.match(sql, /NOT public\.can_view_video_case\(evaluation\.video_case_id\)/);
  assert.match(sql, /GRANT EXECUTE[\s\S]*TO authenticated/);
});

test("the group list shows the create button to editors", () => {
  const source = read("../src/page/VideoGroupsPage.tsx");
  assert.match(source, /roleAtLeast\(normalizeRole\(role\), "editor"\)/);
});

test("the case page shows the combine button to editors without widening delete rights", () => {
  const source = read("../src/page/VideoCaseDetailPage.tsx");
  assert.match(source, /const canCreateGroup = canCombine \|\| roleAtLeast\(appRole, "editor"\)/);
  assert.match(source, /\{canCreateGroup && selectedCase && \(/);
});
