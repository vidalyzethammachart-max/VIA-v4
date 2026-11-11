import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { combineAggregateStatistics } from "../src/services/aggregateStatistics.js";
import * as selectionCore from "../src/services/videoCaseCombineSelectionCore.js";

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
      return { insert(value) { saved.push(value); return this; }, select() { return this; }, single: async () => ({ data: unavailable ? null : { id: "new-aggregate", ...saved[0] }, error: unavailable ? {message:"Database unavailable"} : null }) };
    },
  };
  runInNewContext(compiled, {
    exports, testEnv, URL, window: { location: { origin: "http://localhost:5173" } },
    require: name => name === "../lib/supabaseClient" ? { supabase } : name === "./aggregateStatistics.js" ? {combineAggregateStatistics} : name === "./videoCaseCombineSelectionCore.js" ? selectionCore : {},
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

test("combining preserves source IDs and calculates scores without a duplicate AI request", async () => {
  const { combine, requests, saved } = setup({ VITE_VIDEO_CASE_API_URL: "http://localhost:8080", VITE_UPLOAD_VIDEO_API_URL: "https://upload.example/api/upload-video" });
  const row = await combine();
  assert.equal(requests.length, 0);
  assert.equal(row.id, "new-aggregate");
  assert.deepEqual(Array.from(saved[0].source_evaluation_ids), [101, 102]);
  assert.equal(saved[0].combined_scores.a.q1, 3);
  assert.equal(saved[0].ai_model, null);
  assert.equal(saved[0].ai_output, null);
});
test("combining is independent of upload backend availability", async () => {
  const { combine, requests } = setup({ VITE_UPLOAD_VIDEO_API_URL: "https://upload.example/api/upload-video" });
  await combine();
  assert.equal(requests.length, 0);
});
test("database failure rejects the combined report", async () => {
  const { combine, saved } = setup({ VITE_VIDEO_CASE_API_URL: "http://localhost:8080" }, true);
  await assert.rejects(combine(), /Database unavailable/);
  assert.equal(saved.length, 1);
});

test("combining fewer than two evaluations is rejected before touching the database", async () => {
  const { saved } = setup({ VITE_VIDEO_CASE_API_URL: "http://localhost:8080" });
  const exportsHolder = {};
  runInNewContext(compiled, {
    exports: exportsHolder, testEnv: {}, URL, window: { location: { origin: "http://localhost:5173" } },
    require: name => name === "../lib/supabaseClient" ? { supabase: { auth: { getUser: async () => ({ data: { user: { id: "leader" } }, error: null }) }, from() { saved.push("db"); } } } : name === "./aggregateStatistics.js" ? { combineAggregateStatistics } : name === "./videoCaseCombineSelectionCore.js" ? selectionCore : {},
  });
  await assert.rejects(
    exportsHolder.combineVideoCaseAnalyses({ videoCaseId: "case-1", caseTitle: "T", sourceRuns: [{ id: 1, evaluation_id: 1, rubric: { a: { q1: 1 } } }] }),
    /อย่างน้อย 2/,
  );
  assert.equal(saved.length, 0);
});
test("null scores are skipped, not counted as zero", () => {
  const mixed = combineAggregateStatistics([{ rubric: { a: { q1: null } } }, { rubric: { a: { q1: 4 } } }]);
  assert.equal(mixed.aggregatedScores.a.q1, 4);
  const none = combineAggregateStatistics([{ rubric: { a: { q1: null } } }, { rubric: { a: { q1: null } } }]);
  assert.equal(Object.hasOwn(none.aggregatedScores.a ?? {}, "q1"), false);
});
