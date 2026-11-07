import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// Lets node:test import the app's .ts sources and swaps the Supabase client,
// accounting service and Deno-only URL imports for in-memory fakes.
// Fakes are read from globalThis at call time:
//   globalThis.__fakeSupabase   -> `supabase` export of lib/supabaseClient
//   globalThis.__fakeAccounting -> `accountingService` export
//   globalThis.__denoServe      -> receives the handler passed to Deno `serve`
const STUBS = {
  "stub:supabaseClient":
    'export const supabase = new Proxy({}, { get: (_, k) => globalThis.__fakeSupabase[k] });\n' +
    'export const supabaseAuthStorageKey = "test-auth";\n',
  "stub:accounting":
    'export const accountingService = { logActivity: (...a) => globalThis.__fakeAccounting.logActivity(...a) };\n',
  "stub:denoServe":
    "export const serve = (handler) => { globalThis.__denoServe = handler; };\n",
  "stub:supabaseJs":
    "export const createClient = (url, key) => globalThis.__createClient(url, key);\n",
};

let installed = false;

export function installTsLoader() {
  if (installed) return;
  installed = true;

  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("https://deno.land/")) {
        return { url: "stub:denoServe", shortCircuit: true };
      }
      if (specifier.startsWith("https://esm.sh/@supabase/supabase-js")) {
        return { url: "stub:supabaseJs", shortCircuit: true };
      }
      if (/(^|\/)lib\/supabaseClient$/.test(specifier)) {
        return { url: "stub:supabaseClient", shortCircuit: true };
      }
      if (/(^|\/)accountingService$/.test(specifier)) {
        return { url: "stub:accounting", shortCircuit: true };
      }
      if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
        const base = fileURLToPath(new URL(specifier, context.parentURL));
        for (const ext of [".ts", ".tsx", ".js"]) {
          if (existsSync(base + ext)) {
            return { url: pathToFileURL(base + ext).href, shortCircuit: true };
          }
        }
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url in STUBS) {
        return { format: "module", source: STUBS[url], shortCircuit: true };
      }
      return nextLoad(url, context);
    },
  });
}

// Minimal chainable query builder. `result` is what awaiting the chain yields;
// every call is recorded in `calls` as [method, ...args].
export function fakeQuery(result, calls = []) {
  const builder = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === "then") {
          return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
        }
        return (...args) => {
          calls.push([prop, ...args]);
          return builder;
        };
      },
    },
  );
  return builder;
}
