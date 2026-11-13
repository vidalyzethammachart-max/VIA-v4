import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installTsLoader } from "./helpers/tsLoader.js";

installTsLoader();

const rpcCalls = [];
let rpcBehavior = () => Promise.resolve({ error: null });
globalThis.__fakeSupabase = {
  rpc: (name, args) => {
    rpcCalls.push([name, args]);
    return rpcBehavior();
  },
};
const listeners = {};
globalThis.window = {
  location: { pathname: "/video-groups/1", search: "?tab=a" },
  addEventListener: (type, fn) => { listeners[type] = fn; },
  removeEventListener: (type, fn) => { if (listeners[type] === fn) delete listeners[type]; },
};

const { reportError, installGlobalErrorHandlers } = await import("../src/services/errorReporter.ts");
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("reportError sends the seven log_app_error parameters", async () => {
  rpcCalls.length = 0;
  reportError(new Error("first failure"), { source: "popup", context: { action: "create_group" } });
  await flush();
  assert.equal(rpcCalls.length, 1);
  const [name, args] = rpcCalls[0];
  assert.equal(name, "log_app_error");
  assert.deepEqual(Object.keys(args).sort(), [
    "p_context", "p_fingerprint", "p_message", "p_page_path", "p_source", "p_stack", "p_user_agent",
  ]);
  assert.equal(args.p_source, "popup");
  assert.equal(args.p_message, "first failure");
  assert.equal(args.p_page_path, "/video-groups/1?tab=a");
  assert.deepEqual(args.p_context, { action: "create_group" });
  assert.match(args.p_fingerprint, /^[0-9a-f]{8}$/);
});

test("the same error inside the dedupe window is sent once", async () => {
  rpcCalls.length = 0;
  for (let i = 0; i < 50; i += 1) reportError(new Error("loop failure"), { source: "react" });
  await flush();
  assert.equal(rpcCalls.length, 1);
});

test("reporting never throws: a rejected, failing or throwing rpc is swallowed", async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    rpcBehavior = () => Promise.reject(new Error("offline"));
    assert.doesNotThrow(() => reportError(new Error("offline case"), { source: "popup" }));
    rpcBehavior = () => Promise.resolve({ error: { message: "rls denied" } });
    assert.doesNotThrow(() => reportError(new Error("rls case"), { source: "popup" }));
    rpcBehavior = () => { throw new Error("sync boom"); };
    assert.doesNotThrow(() => reportError(new Error("sync case"), { source: "popup" }));
    await flush();
    assert.ok(warnings.length >= 3, "each failure is logged to the console only");
  } finally {
    console.warn = originalWarn;
    rpcBehavior = () => Promise.resolve({ error: null });
  }
});

test("global handlers report window errors, rejections and network failures, and clean up", async () => {
  rpcCalls.length = 0;
  const cleanup = installGlobalErrorHandlers();
  assert.equal(typeof listeners.error, "function");
  assert.equal(typeof listeners.unhandledrejection, "function");
  assert.equal(typeof globalThis.__networkListener, "function");

  listeners.error({ error: new Error("window failure"), message: "window failure", filename: "a.js", lineno: 3, colno: 4 });
  listeners.unhandledrejection({ reason: new Error("rejected promise") });
  globalThis.__networkListener({ url: "https://p.supabase.co/rest/v1/evaluations?select=*&id=eq.7", status: 500, method: "GET" });
  await flush();

  const bySource = Object.fromEntries(rpcCalls.map(([, args]) => [args.p_source, args]));
  assert.equal(bySource.window_error.p_message, "window failure");
  assert.equal(bySource.unhandled_rejection.p_message, "rejected promise");
  assert.equal(bySource.network.p_message, "HTTP 500 GET /rest/v1/evaluations");
  assert.deepEqual(bySource.network.p_context, { status: 500, method: "GET", endpoint: "/rest/v1/evaluations" });
  assert.doesNotMatch(JSON.stringify(bySource.network), /select=|id=eq/, "query strings are never stored");

  cleanup();
  assert.equal(listeners.error, undefined);
  assert.equal(listeners.unhandledrejection, undefined);
  assert.equal(globalThis.__networkListener, null);
});

test("the Supabase client reports failed responses without altering them", () => {
  const client = read("../src/lib/supabaseClient.ts");
  assert.match(client, /export function setNetworkErrorListener\(/);
  assert.match(client, /global:\s*\{\s*fetch:/);
  assert.match(client, /shouldIgnoreNetworkError\(/);
  assert.match(client, /return response;/);
  assert.match(client, /try\s*{[\s\S]*?networkErrorListener[\s\S]*?}\s*catch/, "listener errors must not reach callers");
  assert.doesNotMatch(client, /errorReporter/, "no circular import: the reporter registers itself as the listener");
});

test("the app is wrapped in the error boundary and installs the global handlers", () => {
  const main = read("../src/main.tsx");
  assert.match(main, /installGlobalErrorHandlers\(\)/);
  assert.match(main, /<AuthRoleProvider>\s*<AppErrorBoundary>\s*<App \/>\s*<\/AppErrorBoundary>\s*<\/AuthRoleProvider>/);
  const boundary = read("../src/components/AppErrorBoundary.tsx");
  assert.match(boundary, /componentDidCatch/);
  assert.match(boundary, /reportError\(error, \{ source: "react", context: \{ componentStack/);
  assert.match(boundary, /t\("common\.errorOccurred"\)/);
  assert.match(boundary, /window\.location\.reload\(\)/);
});
