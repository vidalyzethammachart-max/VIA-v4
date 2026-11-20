import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EvaluationDeleteError,
  deleteEvaluationById,
} from "../src/services/evaluationDeleteCore.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// Fake supabase client: records the chain and resolves with the given result.
function fakeClient(result) {
  const calls = [];
  const chain = {
    delete() { calls.push(["delete"]); return chain; },
    eq(column, value) { calls.push(["eq", column, value]); return chain; },
    select(columns) { calls.push(["select", columns]); return chain; },
    maybeSingle() { calls.push(["maybeSingle"]); return Promise.resolve(result); },
  };
  return { calls, client: { from(table) { calls.push(["from", table]); return chain; } } };
}

test("deletes by id only and lets RLS decide who may delete", async () => {
  const { client, calls } = fakeClient({ data: { id: 7 }, error: null });
  await deleteEvaluationById(client, 7);
  assert.deepEqual(calls, [
    ["from", "evaluations"],
    ["delete"],
    ["eq", "id", 7],
    ["select", "id"],
    ["maybeSingle"],
  ]);
  assert.equal(calls.some((call) => call[0] === "eq" && call[1] === "user_id"), false);
});

test("zero deleted rows means the caller is not allowed (RLS hides the row)", async () => {
  const { client } = fakeClient({ data: null, error: null });
  await assert.rejects(
    deleteEvaluationById(client, 7),
    (error) => error instanceof EvaluationDeleteError && error.code === "not_allowed",
  );
});

test("a foreign-key violation means the evaluation is used by a group or summary", async () => {
  const { client } = fakeClient({ data: null, error: { code: "23503", message: "violates foreign key" } });
  await assert.rejects(
    deleteEvaluationById(client, 7),
    (error) => error instanceof EvaluationDeleteError && error.code === "in_use",
  );
});

test("any other database error is reported as a failure and keeps its message", async () => {
  const { client } = fakeClient({ data: null, error: { code: "XX000", message: "boom" } });
  await assert.rejects(
    deleteEvaluationById(client, 7),
    (error) => error instanceof EvaluationDeleteError && error.code === "failed" && error.message === "boom",
  );
});

for (const page of ["MyFormsDashboard", "PreviewPage"]) {
  test(`${page} deletes through the shared helper, not a user_id-filtered query`, () => {
    const source = read(`../src/page/${page}.tsx`);
    assert.match(source, /deleteEvaluationById\(supabase, /);
    assert.doesNotMatch(source, /\.from\("evaluations"\)\s*\.delete\(\)/);
    assert.match(source, /EvaluationDeleteError/);
    assert.match(source, /myForms\.deleteInUse/);
    assert.match(source, /myForms\.deleteNotAllowed/);
  });
}

test("both languages define the new delete messages", () => {
  const source = read("../src/i18n/translations.ts");
  assert.equal((source.match(/"myForms\.deleteInUse"/g) ?? []).length, 2);
  assert.equal((source.match(/"myForms\.deleteNotAllowed"/g) ?? []).length, 2);
});
