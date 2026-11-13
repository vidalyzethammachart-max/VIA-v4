import assert from "node:assert/strict";
import test from "node:test";
import {
  ERROR_SOURCES,
  buildFingerprint,
  createDedupe,
  normalizeError,
  shouldIgnoreNetworkError,
  truncateReport,
} from "../src/services/errorReportCore.js";

test("the five sources match the database check", () => {
  assert.deepEqual([...ERROR_SOURCES], ["popup", "window_error", "unhandled_rejection", "react", "network"]);
});

test("a fingerprint is stable, 8 hex chars, and only the first stack line matters", () => {
  const a = buildFingerprint("popup", "boom", "Error: boom\n    at a (x.js:1:1)");
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.equal(a, buildFingerprint("popup", "boom", "Error: boom\n    at b (y.js:9:9)"));
  assert.notEqual(a, buildFingerprint("react", "boom", "Error: boom\n    at a (x.js:1:1)"));
  assert.notEqual(a, buildFingerprint("popup", "bang", "Error: boom\n    at a (x.js:1:1)"));
  assert.match(buildFingerprint("popup", "no stack", null), /^[0-9a-f]{8}$/);
});

test("truncateReport cuts each field at its limit", () => {
  const out = truncateReport({
    source: "popup",
    message: "m".repeat(2500),
    stack: "s".repeat(9000),
    pagePath: "p".repeat(700),
    userAgent: "u".repeat(400),
    context: { action: "x" },
  });
  assert.equal(out.message.length, 2000);
  assert.equal(out.stack.length, 8000);
  assert.equal(out.pagePath.length, 500);
  assert.equal(out.userAgent.length, 300);
  assert.deepEqual(out.context, { action: "x" });
});

test("a circular or oversized context becomes { truncated: true } instead of throwing", () => {
  const circular = {};
  circular.self = circular;
  assert.deepEqual(truncateReport({ source: "popup", message: "m", context: circular }).context, { truncated: true });
  assert.deepEqual(truncateReport({ source: "popup", message: "m", context: { big: "x".repeat(9000) } }).context, { truncated: true });
  assert.deepEqual(truncateReport({ source: "popup", message: "m" }).context, {});
  assert.equal(truncateReport({ source: "popup", message: "m" }).stack, null);
});

test("normalizeError copes with errors, strings, plain objects and nothing", () => {
  const error = new Error("x");
  assert.deepEqual(normalizeError(error), { message: "x", stack: error.stack ?? null });
  assert.deepEqual(normalizeError("boom"), { message: "boom", stack: null });
  assert.deepEqual(normalizeError({ message: "m", stack: "st" }), { message: "m", stack: "st" });
  assert.deepEqual(normalizeError(null), { message: "Unknown error", stack: null });
  assert.deepEqual(normalizeError(undefined), { message: "Unknown error", stack: null });
  assert.equal(normalizeError(new Error("")).message, "Error");
  assert.equal(normalizeError(42).message, "42");
});

test("network failures of the log endpoint, auth calls and aborted requests are ignored", () => {
  const base = { method: "POST", status: 500 };
  assert.equal(shouldIgnoreNetworkError({ ...base, url: "https://p.supabase.co/rest/v1/rpc/log_app_error" }), true);
  assert.equal(shouldIgnoreNetworkError({ ...base, status: 400, url: "https://p.supabase.co/auth/v1/token?grant_type=password" }), true);
  assert.equal(shouldIgnoreNetworkError({ ...base, status: 401, url: "https://p.supabase.co/auth/v1/token?grant_type=refresh_token" }), true);
  assert.equal(shouldIgnoreNetworkError({ ...base, aborted: true, url: "https://p.supabase.co/rest/v1/evaluations" }), true);
  // The error log page must not log its own failed reads and deletes.
  assert.equal(shouldIgnoreNetworkError({ ...base, url: "https://p.supabase.co/rest/v1/app_error_logs?select=*" }), true);
  assert.equal(shouldIgnoreNetworkError({ ...base, url: "https://p.supabase.co/rest/v1/evaluations" }), false);
  assert.equal(shouldIgnoreNetworkError({ ...base, status: 403, url: "https://p.supabase.co/functions/v1/forward-to-n8n" }), false);
});

test("the dedupe lets an identical fingerprint through once per window", () => {
  let now = 1_000;
  const shouldSend = createDedupe(60_000, () => now);
  assert.equal(shouldSend("aaaa0000"), true);
  assert.equal(shouldSend("aaaa0000"), false);
  assert.equal(shouldSend("bbbb1111"), true);
  now += 59_999;
  assert.equal(shouldSend("aaaa0000"), false);
  now += 1;
  assert.equal(shouldSend("aaaa0000"), true);
  assert.equal(shouldSend("aaaa0000"), false);
});

test("the dedupe stays bounded under a flood of distinct fingerprints", () => {
  let now = 0;
  const shouldSend = createDedupe(60_000, () => now);
  for (let i = 0; i < 5000; i += 1) {
    now += 1;
    assert.equal(shouldSend(`fp${i}`), true);
  }
  now += 120_000;
  assert.equal(shouldSend("fp0"), true);
});
