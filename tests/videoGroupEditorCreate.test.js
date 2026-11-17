import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const NEW = "../supabase/migrations/20261117090000_video_group_no_editor_create.sql";

test("editors can no longer create a group evaluation; admins and source-case leaders still can", () => {
  const sql = read(NEW);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.create_video_group_evaluation\(/);
  assert.doesNotMatch(sql, /caller_is_editor/);
  assert.doesNotMatch(sql, /role_at_least\('editor'/);
  assert.match(sql, /IF NOT caller_is_admin THEN/);
  assert.match(sql, /NOT public\.can_view_video_case\(evaluation\.video_case_id\)/);
  assert.match(sql, /current_video_case_role\(evaluation\.video_case_id\) = 'leader'/);
  assert.match(sql, /Only an admin or a leader of a source case can create a group evaluation/);
  assert.match(sql, /GRANT EXECUTE[\s\S]*TO authenticated/);
});

test("the group picker no longer lists every case for editors", () => {
  const sql = read(NEW);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.list_group_source_cases\(\)/);
  assert.match(sql, /public\.can_view_video_case\(vc\.id\)/);
  assert.doesNotMatch(sql, /list_group_source_cases[\s\S]*role_at_least\('editor'/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.list_group_source_cases\(\) TO authenticated/);
});

test("editors keep read access: the new migration does not touch can_view_video_group", () => {
  assert.doesNotMatch(read(NEW), /FUNCTION public\.can_view_video_group/);
  assert.match(
    read("../supabase/migrations/20261114090000_video_group_editor_create.sql"),
    /CREATE OR REPLACE FUNCTION public\.can_view_video_group[\s\S]*role_at_least\('editor'::public\.app_role\)/,
  );
});

test("the group list shows the create button only to admins and leaders", () => {
  const source = read("../src/page/VideoGroupsPage.tsx");
  assert.match(source, /const canCreate = isAdmin \|\| isLeader;/);
  assert.doesNotMatch(source, /"editor"/);
});

test("the case page shows the combine button only to case leaders and admins", () => {
  const source = read("../src/page/VideoCaseDetailPage.tsx");
  assert.doesNotMatch(source, /canCreateGroup/);
  assert.match(source, /\{canCombine && selectedCase && \(/);
});

test("the picker loads case labels through list_group_source_cases instead of the RLS-filtered embed", () => {
  const source = read("../src/services/videoGroupService.ts");
  assert.match(source, /rpc\("list_group_source_cases"\)/);
  assert.doesNotMatch(source, /video_cases!inner/);
});
