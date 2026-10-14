import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function compile(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8").replaceAll("import.meta.env", "({})"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
test("case keys use only normalized order and subject, including Thai text", () => {
  const path = new URL("../src/services/videoCaseIdentity.ts", import.meta.url);
  const exports = {};
  if (existsSync(path)) runInNewContext(compile("../src/services/videoCaseIdentity.ts"), { exports });
  assert.equal(typeof exports.buildVideoCaseKey, "function");
  for (const [order, subject, expected] of [
    ["ทดสอบการประเมิน-1", "141069", "ทดสอบการประเมิน-1-141069"],
    ["  JOB  001 ", " Lesson ONE ", "job-001-lesson-one"],
    ["", "Video", ""], ["001", "  ", ""],
  ]) assert.equal(exports.buildVideoCaseKey(order, subject), expected);
});

test("form membership resolves by two-field identity without a random short code", async () => {
  const calls = [], exports = {};
  runInNewContext(compile("../src/services/videoCaseService.ts"), {
    exports,
    require(name) {
      if (name === "../lib/supabaseClient") return { supabase: {
        auth: { getUser: async () => ({ data: { user: { id: "reviewer" } }, error: null }) },
        rpc: async (name, args) => { calls.push({ name, args }); return { data: { id: "shared-case" }, error: null }; },
      } };
      return {};
    },
  });
  await exports.resolveVideoCaseMembership({ orderNumber: "001", subjectName: "Lesson" });
  await exports.resolveVideoCaseMembership({ orderNumber: "001", subjectName: "Lesson", videoCaseId: "existing-case" });
  assert.equal(calls[0].name, "resolve_video_case_by_identity");
  assert.equal(calls[0].args.p_order_number, "001");
  assert.equal(calls[0].args.p_subject_name, "Lesson");
  assert.equal(calls[0].args.p_video_case_id, null);
  assert.equal(calls[1].args.p_video_case_id, "existing-case");
  assert.ok(!Object.hasOwn(calls[0].args, "p_short_code"));
});
