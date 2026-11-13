import assert from "node:assert/strict";
import test from "node:test";
import { fakeQuery, installTsLoader } from "./helpers/tsLoader.js";

installTsLoader();

// UC-20: admin-user-management Edge Function, run with fake Deno + Supabase.
const state = { authUser: null, actorRole: "admin", roleRows: [], calls: [], deleteUserError: null, updateError: null, ownedCases: [], ownedCasesError: null };

globalThis.Deno = { env: { get: (k) => `fake-${k}` } };
globalThis.__createClient = (_url, key) => {
  if (key === "fake-SUPABASE_ANON_KEY") {
    return { auth: { getUser: async () => ({ data: { user: state.authUser }, error: state.authUser ? null : { message: "bad jwt" } }) } };
  }
  return {
    from: (table) => {
      state.calls.push(["from", table]);
      // roleRows lets a test give the actor lookup and the target lookup different roles.
      const result = table === "user_information"
        ? { data: { role: state.roleRows.length ? state.roleRows.shift() : state.actorRole }, error: state.updateError }
        : table === "video_cases"
          ? { data: state.ownedCases, error: state.ownedCasesError }
          : { data: null, error: null };
      return fakeQuery(result, state.calls);
    },
    storage: { from: (b) => ({ remove: async (paths) => { state.calls.push(["storage.remove", b, paths]); } }) },
    auth: { admin: { deleteUser: async (id) => { state.calls.push(["auth.deleteUser", id]); return { error: state.deleteUserError }; } } },
  };
};

await import("../supabase/functions/admin-user-management/index.ts");
const handler = globalThis.__denoServe;

function call(body, { token = "jwt", method = "POST" } = {}) {
  return handler(new Request("https://fn.test/admin", {
    method,
    headers: token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {},
    body: method === "POST" ? JSON.stringify(body) : undefined,
  }));
}

function reset(over = {}) {
  Object.assign(state, { authUser: { id: "admin-1" }, actorRole: "admin", roleRows: [], calls: [], deleteUserError: null, updateError: null, ownedCases: [], ownedCasesError: null }, over);
}

test("UC-20 rejects missing token, bad token and non-POST methods", async () => {
  reset();
  assert.equal((await call({}, { token: null })).status, 401);
  reset({ authUser: null });
  assert.equal((await call({})).status, 401);
  reset();
  assert.equal((await call(null, { method: "GET" })).status, 405);
  assert.equal((await handler(new Request("https://fn.test/admin", { method: "OPTIONS" }))).status, 200);
});

test("UC-20 editors and users get 403 and nothing is modified", async () => {
  for (const actorRole of ["editor", "user", undefined]) {
    reset({ actorRole });
    const res = await call({ action: "update_role", targetAuthUserId: "u2", role: "admin" });
    assert.equal(res.status, 403);
    assert.ok(!state.calls.some((c) => c[0] === "update" || c[0] === "delete"));
  }
});

test("UC-20 validates the target and blocks self-management", async () => {
  reset();
  assert.equal((await call({ action: "update_role", targetAuthUserId: "  " })).status, 400);
  const self = await call({ action: "delete_user", targetAuthUserId: "admin-1" });
  assert.equal(self.status, 400);
  assert.match((await self.json()).error, /own admin account/);
  reset();
  assert.equal((await call({ action: "bogus", targetAuthUserId: "u2" })).status, 400);
});

test("UC-20 admin can change a role; unknown role values downgrade to user", async () => {
  reset();
  const res = await call({ action: "update_role", targetAuthUserId: "u2", role: "editor" });
  assert.deepEqual(await res.json(), { ok: true, action: "update_role", targetAuthUserId: "u2", role: "editor" });
  assert.deepEqual(state.calls.find((c) => c[0] === "update")[1], { role: "editor" });

  reset();
  const bad = await call({ action: "update_role", targetAuthUserId: "u2", role: "superadmin" });
  assert.equal((await bad.json()).role, "user");
});

test("UC-20 update_role reports database failures as 500", async () => {
  reset();
  // actor lookup succeeds (role row), but the update shares the same table result,
  // so flip the error on after the actor check by using a result that carries it.
  state.updateError = { message: "update failed" };
  const res = await call({ action: "update_role", targetAuthUserId: "u2", role: "editor" });
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /update failed/);
});

test("UC-20 delete_user removes the account data, avatar and auth user", async () => {
  reset();
  const res = await call({ action: "delete_user", targetAuthUserId: "u2" });
  assert.deepEqual(await res.json(), { ok: true, action: "delete_user", targetAuthUserId: "u2" });
  const deletedTables = state.calls.filter((c) => c[0] === "from").map((c) => c[1]);
  for (const t of ["activity_logs", "evaluations", "role_requests", "user_information"]) {
    assert.ok(deletedTables.includes(t), t);
  }
  assert.deepEqual(state.calls.find((c) => c[0] === "storage.remove").slice(1), ["profile-avatars", ["u2/avatar.jpg"]]);
  assert.deepEqual(state.calls.find((c) => c[0] === "auth.deleteUser"), ["auth.deleteUser", "u2"]);
});

test("UC-20 delete_user reports auth deletion failure as 500", async () => {
  reset({ deleteUserError: { message: "cannot delete" } });
  const res = await call({ action: "delete_user", targetAuthUserId: "u2" });
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /cannot delete/);
});

test("UC-20 delete_user is refused with 409 and deletes nothing when the user created video cases", async () => {
  reset({ ownedCases: [{ id: "case-1" }] });
  const res = await call({ action: "delete_user", targetAuthUserId: "u2" });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /video case/i);
  assert.ok(!state.calls.some((c) => c[0] === "delete" || c[0] === "storage.remove" || c[0] === "auth.deleteUser"));
});

test("UC-20 delete_user stops with 500 and deletes nothing if the video case check fails", async () => {
  reset({ ownedCasesError: { message: "lookup failed" } });
  const res = await call({ action: "delete_user", targetAuthUserId: "u2" });
  assert.equal(res.status, 500);
  assert.ok(!state.calls.some((c) => c[0] === "delete" || c[0] === "auth.deleteUser"));
});

test("super_admin can manage roles like an admin", async () => {
  reset({ roleRows: ["super_admin", "user"] });
  const res = await call({ action: "update_role", targetAuthUserId: "u2", role: "editor" });
  assert.equal(res.status, 200);
  assert.deepEqual(state.calls.find((c) => c[0] === "update")[1], { role: "editor" });
});

test("nobody can change or delete the super admin through this function", async () => {
  for (const action of ["update_role", "delete_user"]) {
    reset({ roleRows: ["admin", "super_admin"] });
    const res = await call({ action, targetAuthUserId: "boss", role: "user" });
    assert.equal(res.status, 403, action);
    assert.match((await res.json()).error, /super admin/i);
    assert.ok(!state.calls.some((c) => c[0] === "update" || c[0] === "delete" || c[0] === "auth.deleteUser"), action);
  }
});

test("an admin cannot hand out the super_admin role", async () => {
  reset({ roleRows: ["admin", "user"] });
  const res = await call({ action: "update_role", targetAuthUserId: "u2", role: "super_admin" });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /super_admin/);
  assert.ok(!state.calls.some((c) => c[0] === "update"));
});
