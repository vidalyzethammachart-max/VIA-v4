import { setNetworkErrorListener, supabase } from "../lib/supabaseClient";
import {
  buildFingerprint,
  createDedupe,
  normalizeError,
  truncateReport,
  type ErrorSource,
} from "./errorReportCore.js";

export type { ErrorSource };

const shouldSend = createDedupe();

function currentPagePath(): string | null {
  if (typeof window === "undefined" || !window.location) return null;
  return `${window.location.pathname}${window.location.search ?? ""}`;
}

function currentUserAgent(): string | null {
  return typeof navigator === "undefined" ? null : navigator.userAgent ?? null;
}

// Best effort: reporting must never throw into the UI, so every failure only reaches the console.
export function reportError(
  error: unknown,
  options: { source: ErrorSource; context?: Record<string, unknown> },
): void {
  try {
    const { message, stack } = normalizeError(error);
    const fingerprint = buildFingerprint(options.source, message, stack);
    if (!shouldSend(fingerprint)) return;

    const report = truncateReport({
      source: options.source,
      message,
      stack,
      pagePath: currentPagePath(),
      userAgent: currentUserAgent(),
      context: options.context,
    });

    void Promise.resolve(
      supabase.rpc("log_app_error", {
        p_source: report.source,
        p_message: report.message,
        p_stack: report.stack,
        p_page_path: report.pagePath,
        p_user_agent: report.userAgent,
        p_context: report.context,
        p_fingerprint: fingerprint,
      }),
    ).then(
      (result) => {
        if (result?.error) console.warn("Error report was rejected:", result.error.message);
      },
      (rpcError) => console.warn("Error report could not be sent:", rpcError),
    );
  } catch (reportingError) {
    console.warn("Error reporting failed:", reportingError);
  }
}

function endpointPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

export function installGlobalErrorHandlers(): () => void {
  const onError = (event: ErrorEvent) => {
    reportError(event.error ?? event.message, {
      source: "window_error",
      context: { filename: event.filename, line: event.lineno, column: event.colno },
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportError(event.reason, { source: "unhandled_rejection" });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  // Only the path is kept: query strings can hold ids or filters the log must not store.
  setNetworkErrorListener(({ url, status, method }) => {
    const endpoint = endpointPath(url);
    reportError(`HTTP ${status} ${method} ${endpoint}`, {
      source: "network",
      context: { status, method, endpoint },
    });
  });

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    setNetworkErrorListener(null);
  };
}
