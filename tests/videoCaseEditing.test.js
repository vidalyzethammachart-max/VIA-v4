import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const path = new URL("../src/services/videoCaseEditing.ts", import.meta.url);
const code = existsSync(path) ? ts.transpileModule(readFileSync(path, "utf8").replaceAll("import.meta.env", "({})"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText : "";

function setup({ actor = "owner", role = "user", uploadFails = false, conflict = false, trashed = false } = {}) {
  const row = { id: "case-1", case_key: "KEEP-KEY", case_title: "Old title", description: "Old detail", created_by: "owner", updated_at: "2026-10-14T00:00:00Z", video_object_key: "old.mp4", source_file_name: "old.mp4" };
  const writes = [], requests = [];
  if (trashed) row.deleted_at = "2026-10-14T01:00:00Z";
  const supabase = {
    auth: { getUser: async () => ({ data: { user: actor ? { id: actor } : null }, error: null }) },
    from(table) {
      const filters = {}; let patch;
      return {
        select() { return this; }, eq(k, v) { filters[k] = v; return this; },
        update(value) { patch = value; return this; },
        async maybeSingle() {
          if (table === "user_information") return { data: { role }, error: null };
          assert.equal(table, "video_cases", "editing must never write evaluations or aggregates");
          assert.equal(filters.id, "case-1");
          if (patch) {
            writes.push({ patch, filters });
            if (conflict) return { data: null, error: null };
            Object.assign(row, patch);
          }
          return { data: { ...row }, error: null };
        },
      };
    },
  };
  const exports = {};
  runInNewContext(code, { exports, URL, AbortSignal,
    window: { location: { origin: "http://localhost:5173" } },
    require(name) {
      if (name === "../lib/supabaseClient") return { supabase };
      if (name === "../lib/roles") return { normalizeRole: r => r || "user" };
      throw Error(name);
    },
    fetch: async (url, options) => {
      requests.push({ url: String(url), ...options });
      if (options.method === "POST") return Response.json({ provider: "cloudflare-r2", objectKey: "new.mp4", uploadUrl: "https://storage.example/upload", downloadUrl: "https://storage.example/temporary-secret", bucket: "videos" });
      return new Response(null, { status: uploadFails ? 500 : 200 });
    },
  });
  return { edit: exports.updateVideoCase, row, writes, requests };
}
const input = { id: "case-1", expectedUpdatedAt: "2026-10-14T00:00:00Z", caseTitle: "  New title  ", description: "  New detail  " };
const video = { name: "replacement.mp4", size: 100, type: "video/mp4" };

test("trashed cases cannot be edited or uploaded to before restore", async () => {
  const s = setup({ trashed: true });
  await assert.rejects(s.edit({ ...input, videoFile: video }));
  assert.equal(s.writes.length, 0); assert.equal(s.requests.length, 0);
});

test("metadata edit preserves video and case identity and trims user input", async () => {
  const s = setup(); assert.equal(typeof s.edit, "function");
  const result = await s.edit(input);
  assert.equal(result.case_title, "New title"); assert.equal(result.description, "New detail");
  assert.equal(result.video_object_key, "old.mp4"); assert.equal(result.case_key, "KEEP-KEY");
  assert.equal(s.requests.length, 0);
  assert.equal(s.writes[0].filters.updated_at, input.expectedUpdatedAt);
});
test("members cannot edit another creator's case or upload a replacement", async () => {
  const s = setup({ actor: "member" }); assert.equal(typeof s.edit, "function");
  await assert.rejects(s.edit({ ...input, videoFile: video }));
  assert.equal(s.writes.length, 0); assert.equal(s.requests.length, 0);
});
test("admin replacement uses a new uploaded object and does not persist signed URLs", async () => {
  const s = setup({ actor: "admin", role: "admin" }); assert.equal(typeof s.edit, "function");
  const result = await s.edit({ ...input, videoFile: video });
  assert.equal(result.video_object_key, "new.mp4"); assert.equal(result.source_file_name, "replacement.mp4");
  assert.equal(s.requests[1].method, "PUT"); assert.equal(s.requests[1].body, video);
  assert.ok(!JSON.stringify(s.writes).includes("temporary-secret"));
});
test("failed upload leaves all case data unchanged", async () => {
  const s = setup({ uploadFails: true }); assert.equal(typeof s.edit, "function");
  await assert.rejects(s.edit({ ...input, videoFile: video }));
  assert.equal(s.writes.length, 0); assert.equal(s.row.case_title, "Old title");
  assert.equal(s.row.video_object_key, "old.mp4");
});
test("stale case update reports a conflict instead of success", async () => {
  const s = setup({ conflict: true }); assert.equal(typeof s.edit, "function");
  await assert.rejects(s.edit(input));
  assert.equal(s.row.case_title, "Old title");
});
test("blank title and invalid video are rejected before storage or database writes", async () => {
  for (const changes of [{ caseTitle: " " }, { videoFile: { ...video, name: "bad.txt" } }, { videoFile: { ...video, size: 0 } }, { videoFile: { ...video, size: 1024 ** 3 + 1 } }]) {
    const s = setup(); assert.equal(typeof s.edit, "function");
    await assert.rejects(s.edit({ ...input, ...changes }));
    assert.equal(s.writes.length, 0); assert.equal(s.requests.length, 0);
  }
});
