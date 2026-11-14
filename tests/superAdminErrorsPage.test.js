import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fakeQuery, installTsLoader } from "./helpers/tsLoader.js";

installTsLoader();

const calls = [];
let result = { data: [], error: null, count: 0 };
globalThis.__fakeSupabase = {
  from: (table) => {
    calls.push(["from", table]);
    return fakeQuery(result, calls);
  },
};
const { ERROR_LOG_PAGE_SIZE, listErrorLogs, deleteErrorLog, deleteErrorLogsBefore } = await import(
  "../src/services/errorLogService.ts"
);

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const find = (method) => calls.filter((call) => call[0] === method);

test("the list is newest first, 50 per page, with an exact total", async () => {
  calls.length = 0;
  result = { data: [{ id: 1 }, { id: 2 }], error: null, count: 120 };
  const out = await listErrorLogs({ page: 3 });
  assert.equal(ERROR_LOG_PAGE_SIZE, 50);
  assert.deepEqual(calls[0], ["from", "app_error_logs"]);
  assert.deepEqual(find("select")[0].slice(1), ["*", { count: "exact" }]);
  assert.deepEqual(find("order")[0].slice(1), ["created_at", { ascending: false }]);
  assert.deepEqual(find("range")[0].slice(1), [100, 149]);
  assert.deepEqual(out, { rows: [{ id: 1 }, { id: 2 }], total: 120 });
});

test("filters apply source, date range and an escaped message search", async () => {
  calls.length = 0;
  await listErrorLogs({ page: 1, source: "network", from: "2026-11-01T00:00:00Z", to: "2026-11-30T00:00:00Z", search: " 50%_x " });
  assert.deepEqual(find("eq")[0].slice(1), ["source", "network"]);
  assert.deepEqual(find("gte")[0].slice(1), ["created_at", "2026-11-01T00:00:00Z"]);
  assert.deepEqual(find("lte")[0].slice(1), ["created_at", "2026-11-30T00:00:00Z"]);
  assert.deepEqual(find("ilike")[0].slice(1), ["message", "%50\\%\\_x%"]);
  calls.length = 0;
  await listErrorLogs({ page: 0, source: "", search: "   " });
  assert.equal(find("eq").length + find("ilike").length, 0, "empty filters add no conditions");
  assert.deepEqual(find("range")[0].slice(1), [0, 49], "page is clamped to 1");
});

test("a failed query throws its message; deletes target one row or everything older", async () => {
  result = { data: null, error: { message: "denied" }, count: null };
  await assert.rejects(listErrorLogs({ page: 1 }), /denied/);
  result = { data: null, error: null, count: null };
  calls.length = 0;
  await deleteErrorLog(7);
  assert.deepEqual(find("delete").length, 1);
  assert.deepEqual(find("eq")[0].slice(1), ["id", 7]);
  calls.length = 0;
  await deleteErrorLogsBefore("2026-08-01T00:00:00Z");
  assert.deepEqual(find("lt")[0].slice(1), ["created_at", "2026-08-01T00:00:00Z"]);
  result = { data: null, error: { message: "nope" }, count: null };
  await assert.rejects(deleteErrorLog(1), /nope/);
  await assert.rejects(deleteErrorLogsBefore("2026-08-01T00:00:00Z"), /nope/);
});

test("the page is routed for the super admin only and linked only from their menu", () => {
  const app = read("../src/App.tsx");
  assert.match(
    app,
    /path="\/super-admin\/errors"[\s\S]*?<ProtectedRoute requiredRole="super_admin">\s*<SuperAdminErrorsPage \/>/,
  );
  const dropdown = read("../src/components/ProfileDropdown.tsx");
  assert.match(dropdown, /const isSuperAdmin = currentRole === "super_admin"/);
  assert.match(dropdown, /\{isSuperAdmin && \([\s\S]*?closeAndNavigate\("\/super-admin\/errors"\)/);
});

test("the page filters, lists, expands, deletes with confirmation and paginates", () => {
  const page = read("../src/page/SuperAdminErrorsPage.tsx");
  assert.match(page, /export default function SuperAdminErrorsPage/);
  for (const name of [
    "listErrorLogs", "deleteErrorLog(", "deleteErrorLogsBefore(", "ConfirmModal", "ErrorNoticeModal",
    "ERROR_LOG_PAGE_SIZE", "ERROR_SOURCES", "fingerprint",
  ]) {
    assert.ok(page.includes(name), `${name} missing`);
  }
  for (const key of [
    "superAdmin.colTime", "superAdmin.colUser", "superAdmin.colRole", "superAdmin.colSource",
    "superAdmin.colMessage", "superAdmin.colPage", "superAdmin.colRepeat",
  ]) {
    assert.ok(page.includes(`"${key}"`), `${key} column missing`);
  }
  assert.match(page, /<pre[^>]*>\s*\{row\.stack/);
  assert.match(page, /JSON\.stringify\(row\.context/);
  assert.doesNotMatch(page, /reportError/, "the page must not report its own failures (loop)");
  // Deleting the last row of the last page must step back instead of requesting an empty range.
  assert.match(page, /rows\.length === 1 && page > 1/);
  assert.match(page, /setPage\(page - 1\)/);
});

test("every superAdmin translation key used by the page and menu exists in both languages", () => {
  const sources = [read("../src/page/SuperAdminErrorsPage.tsx"), read("../src/components/ProfileDropdown.tsx")];
  const keys = [...new Set(sources.flatMap((source) => [...source.matchAll(/t\(\s*"(superAdmin\.[^"]+)"/g)].map((m) => m[1])))];
  assert.ok(keys.length > 10, "expected the page to use superAdmin.* keys");
  const translations = read("../src/i18n/translations.ts");
  const enStart = translations.indexOf("  en: {");
  for (const key of keys) {
    assert.ok(translations.slice(0, enStart).includes(`"${key}":`), `th missing ${key}`);
    assert.ok(translations.slice(enStart).includes(`"${key}":`), `en missing ${key}`);
  }
});

test("deleting a single entry asks for confirmation first", () => {
  const page = read("../src/page/SuperAdminErrorsPage.tsx");
  // The row button only opens the dialog; the delete runs from the dialog's confirm.
  assert.match(page, /onClick=\{\(\) => setConfirmDeleteId\(row\.id\)\}/);
  assert.doesNotMatch(page, /onClick=\{\(\) => void handleDeleteOne\(row\.id\)\}/);
  assert.match(
    page,
    /<ConfirmModal\s+isOpen=\{confirmDeleteId !== null\}[\s\S]*?t\("superAdmin\.deleteOneTitle"\)[\s\S]*?t\("superAdmin\.deleteOneMessage"\)[\s\S]*?onConfirm=\{\(\) => confirmDeleteId !== null && void handleDeleteOne\(confirmDeleteId\)\}[\s\S]*?onCancel=\{\(\) => setConfirmDeleteId\(null\)\}/,
  );
});

test("pressing search reloads the list even when the filters did not change", () => {
  const page = read("../src/page/SuperAdminErrorsPage.tsx");
  assert.match(page, /onSubmit=\{\(event\) => \{\s*event\.preventDefault\(\);\s*setApplied\(draft\);\s*setPage\(1\);\s*reload\(\);/);
});
