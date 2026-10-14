import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../src/services/videoCaseService.ts", import.meta.url), "utf8").replaceAll("import.meta.env", "({})"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup({ role = "user", fail = false } = {}) {
  const active = { id: "active", deleted_at: null };
  const trashed = { id: "trash", deleted_at: "2026-10-14T00:00:00Z" };
  const calls = [], exports = {};
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: "owner" } }, error: null }) },
    rpc: async (name, args) => { calls.push({ name, args }); return fail ? { data: null, error: { message: "Permission denied" } } : { data: args.p_trashed ? trashed : active, error: null }; },
    from(table) {
      let rows = table === "video_cases" ? [active, trashed] : [{ video_case_id: "active" }, { video_case_id: "trash" }];
      return {
        select() { return this; }, eq() { return this; }, order() { return this; },
        in(k, values) { rows = rows.filter(r => values.includes(r[k])); return this; },
        is(k, v) { rows = rows.filter(r => r[k] === v); return this; },
        not(k, op, v) { assert.equal(op, "is"); rows = rows.filter(r => r[k] !== v); return this; },
        maybeSingle: async () => ({ data: { role }, error: null }),
        then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
      };
    },
  };
  runInNewContext(compiled, { exports, require(name) {
    if (name === "../lib/supabaseClient") return { supabase };
    if (name === "../lib/roles") return { normalizeRole: value => value };
    return {};
  } });
  return { service: exports, calls };
}
for (const role of ["user", "admin"]) {
  test(`${role} case list separates active and trash records`, async () => {
    const { service } = setup({ role });
    assert.deepEqual((await service.getMyVideoCases()).map(r => r.id), ["active"]);
    assert.deepEqual((await service.getMyVideoCases({ trashed: true })).map(r => r.id), ["trash"]);
  });
}
test("trash and restore use the same case ID with reversible state and server permission checks", async () => {
  const { service, calls } = setup();
  assert.equal(typeof service.setVideoCaseTrashed, "function");
  await service.setVideoCaseTrashed("case-1", true);
  await service.setVideoCaseTrashed("case-1", false);
  assert.equal(calls[0].name, "set_video_case_trashed");
  assert.equal(calls[0].args.p_video_case_id, "case-1");
  assert.equal(calls[0].args.p_trashed, true);
  assert.equal(calls[1].args.p_video_case_id, "case-1");
  assert.equal(calls[1].args.p_trashed, false);
});
test("rejected trash operation is reported as a failure", async () => {
  const { service } = setup({ fail: true });
  assert.equal(typeof service.setVideoCaseTrashed, "function");
  await assert.rejects(service.setVideoCaseTrashed("case-1", true), /Permission denied/);
});
