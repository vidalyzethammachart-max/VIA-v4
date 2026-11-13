import { createClient } from "@supabase/supabase-js";

import { shouldIgnoreNetworkError } from "../services/errorReportCore.js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function getProjectRef(url: string) {
  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return "via";
  }
}

export const supabaseAuthStorageKey = `sb-${getProjectRef(supabaseUrl)}-auth-token`;

export type NetworkErrorInfo = { url: string; status: number; method: string };

// The error reporter registers itself here; the client never imports it (no circular import).
let networkErrorListener: ((info: NetworkErrorInfo) => void) | null = null;

export function setNetworkErrorListener(listener: ((info: NetworkErrorInfo) => void) | null): void {
  networkErrorListener = listener;
}

// Reports non-OK responses to the listener and always hands the untouched response back.
// Errors thrown by fetch itself (offline, aborted) propagate unchanged and are not reported here.
const trackedFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (!response.ok && networkErrorListener) {
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
      if (!shouldIgnoreNetworkError({ url, status: response.status, method })) {
        networkErrorListener({ url, status: response.status, method });
      }
    } catch {
      // Reporting is best effort and must never affect the request.
    }
  }
  return response;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "implicit",
    storageKey: supabaseAuthStorageKey,
  },
  global: { fetch: trackedFetch },
});
