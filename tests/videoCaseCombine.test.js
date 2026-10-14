import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../src/services/videoCaseService.ts", import.meta.url), "utf8")
  .replaceAll("import.meta.env", "testEnv"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup(testEnv, unavailable = false) {
  const exports = {}, requests = [], saved = [];
  const result = { caseId: "case-1", caseTitle: "Test", sourceRunCount: 2, aggregatedScores: { a: { q1: 3 } }, sectionAverages: { a: 3 }, aggregatedMatrix: {}, model: "test-model", analysis: { summary: "Combined result" } };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: "leader" } }, error: null }) },
    from(table) {
      assert.equal(table, "video_case_aggregates");
      return { insert(value) { saved.push(value); return this; }, select() { return this; }, single: async () => ({ data: { id: "new-aggregate", ...saved[0] }, error: null }) };
    },
  };
  runInNewContext(compiled, {
    exports, testEnv, URL, window: { location: { origin: "http://localhost:5173" } },
    require: name => name === "../lib/supabaseClient" ? { supabase } : {},
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: !unavailable, statusText: "Service Unavailable", text: async () => '{"error":"Service unavailable"}', json: async () => result };
    },
  });
  const combine = () => exports.combineVideoCaseAnalyses({ videoCaseId: "case-1", caseTitle: "Test", sourceRuns: [
    { id: 101, evaluation_id: 101, user_id: "reviewer", rubric: { a: { q1: 1 } } },
    { id: 102, evaluation_id: 102, user_id: "reviewer", rubric: { a: { q1: 5 } } },
  ] });
  return { combine, requests, saved };
}

test("local aggregation override saves a distinct summary preserving both source evaluation IDs", async () => {
  const { combine, requests, saved } = setup({ VITE_VIDEO_CASE_API_URL: "http://localhost:8080", VITE_UPLOAD_VIDEO_API_URL: "https://upload.example/api/upload-video" });
  const row = await combine();
  assert.equal(requests[0].url, "http://localhost:8080/api/analyze-video-case");
  assert.deepEqual(requests[0].body.sourceRuns.map(r => r.evaluation_id), [101, 102]);
  assert.equal(row.id, "new-aggregate");
  assert.deepEqual(Array.from(saved[0].source_evaluation_ids), [101, 102]);
  assert.equal(saved[0].combined_scores.a.q1, 3);
});
test("aggregation keeps the configured upload backend when no override is supplied", async () => {
  const { combine, requests } = setup({ VITE_UPLOAD_VIDEO_API_URL: "https://upload.example/api/upload-video" });
  await combine();
  assert.equal(requests[0].url, "https://upload.example/api/analyze-video-case");
});
test("unavailable aggregation backend never saves a false successful summary", async () => {
  const { combine, saved } = setup({ VITE_VIDEO_CASE_API_URL: "http://localhost:8080" }, true);
  await assert.rejects(combine(), /Service unavailable/);
  assert.equal(saved.length, 0);
});
