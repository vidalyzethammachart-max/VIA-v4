import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as payloadCore from "../src/services/videoCaseSummaryPayloadCore.js";
import * as sourceIds from "../src/services/videoCaseSourceIds.js";

// Execute the real service; replace only its external Supabase boundary.
const compiled = ts.transpileModule(
  readFileSync(new URL("../src/services/videoCaseService.ts", import.meta.url), "utf8")
    .replaceAll("import.meta.env", "({})"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function setup({ dispatchError = null, callbackReady = false, pendingError = null } = {}) {
  const row = {
    id: "aggregate-1", video_case_id: "case-1", source_evaluation_ids: [101, 102],
    source_count: 2, source_snapshot: { case_title: "Video 001" },
    combined_scores: { 1: { q1: 3 } }, section_averages: { 1: 3 },
    ai_output: { summary: "Combined analysis" }, document_status: null, document_error: null,
  };
  const requests = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: "leader-1" } }, error: null }) },
    from(table) {
      let patch;
      const result = () => {
        if (patch?.document_status === "pending" && pendingError) {
          return { data: null, error: { message: pendingError } };
        }
        if (patch) Object.assign(row, patch);
        return { data: table === "user_information" ? { employee_number: "E001" } : { ...row }, error: null };
      };
      return {
        select() { return this; }, eq() { return this; },
        update(value) { patch = value; return this; },
        maybeSingle: async () => result(), single: async () => result(),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
    },
    functions: { async invoke(name, { body }) {
      requests.push({ name, body, statusAtDispatch: row.document_status });
      if (callbackReady) row.document_status = "ready";
      return { data: null, error: dispatchError ? { message: dispatchError } : null };
    } },
  };
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "../lib/supabaseClient") return { supabase };
      if (name === "../lib/roles") return {};
      if (name === "./videoCaseSummaryPayloadCore.js") return payloadCore;
      if (name === "./videoCaseSourceIds.js") return sourceIds;
      if (name === "./aggregateStatistics.js") return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { submit: exports.sendVideoCaseAggregateToN8nWithPrompt, row, requests };
}

test("summary submission dispatches the entered suggestion and selected sources in one call", async () => {
  const { submit, row, requests } = setup();
  const result = await submit("aggregate-1", "  Improve pacing  ");
  assert.equal(result.document_status, "pending");
  assert.equal(row.document_error, null);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].name, "forward-to-n8n");
  assert.equal(requests[0].statusAtDispatch, "pending");
  assert.equal(requests[0].body.combine_prompt, "Improve pacing");
  assert.equal(requests[0].body.aggregate_id, "aggregate-1");
  assert.deepEqual(requests[0].body.source_evaluation_ids, [101, 102]);
});

test("failed dispatch rejects submission so the form cannot navigate as a success", async () => {
  const { submit, row } = setup({ dispatchError: "Workflow unavailable" });
  await assert.rejects(submit("aggregate-1", "Suggestion"), /Workflow unavailable/);
  assert.equal(row.document_status, "failed");
  assert.equal(row.document_error, "Workflow unavailable");
});

test("submission preserves a callback that completes before dispatch returns", async () => {
  const { submit } = setup({ callbackReady: true });
  assert.equal((await submit("aggregate-1", "Suggestion")).document_status, "ready");
});

test("submission does not dispatch when saving its pending status fails", async () => {
  const { submit, requests } = setup({ pendingError: "Permission denied" });
  await assert.rejects(submit("aggregate-1", "Suggestion"), /Permission denied/);
  assert.equal(requests.length, 0);
});
