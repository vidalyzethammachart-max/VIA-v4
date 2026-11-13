// Pure helpers for the application error log. The limits mirror public.log_app_error.
export const ERROR_SOURCES = Object.freeze([
  "popup",
  "window_error",
  "unhandled_rejection",
  "react",
  "network",
]);

const MESSAGE_MAX = 2000;
const STACK_MAX = 8000;
const PAGE_PATH_MAX = 500;
const USER_AGENT_MAX = 300;
const CONTEXT_MAX = 8192;
const DEDUPE_MAX_ENTRIES = 200;

function hashToHex(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildFingerprint(source, message, stack) {
  const firstStackLine = String(stack ?? "").split("\n")[0].trim();
  return hashToHex(`${source}|${String(message ?? "").trim()}|${firstStackLine}`);
}

function limit(value, max) {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, max);
}

function safeContext(context) {
  if (context === null || context === undefined) return {};
  try {
    const json = JSON.stringify(context);
    if (json === undefined || json.length > CONTEXT_MAX) return { truncated: true };
    return context;
  } catch {
    return { truncated: true };
  }
}

export function truncateReport(report) {
  return {
    source: report.source,
    message: limit(report.message, MESSAGE_MAX) ?? "",
    stack: limit(report.stack, STACK_MAX),
    pagePath: limit(report.pagePath, PAGE_PATH_MAX),
    userAgent: limit(report.userAgent, USER_AGENT_MAX),
    context: safeContext(report.context),
  };
}

export function normalizeError(error) {
  if (error === null || error === undefined) return { message: "Unknown error", stack: null };
  if (error instanceof Error) {
    return { message: error.message || error.name || "Unknown error", stack: error.stack ?? null };
  }
  if (typeof error === "string") return { message: error || "Unknown error", stack: null };
  if (typeof error === "object" && typeof error.message === "string") {
    return {
      message: error.message || "Unknown error",
      stack: typeof error.stack === "string" ? error.stack : null,
    };
  }
  try {
    return { message: String(error), stack: null };
  } catch {
    return { message: "Unknown error", stack: null };
  }
}

export function shouldIgnoreNetworkError({ url, aborted }) {
  if (aborted) return true;
  const target = String(url ?? "");
  // The log endpoint itself: reporting its failure would loop forever.
  if (target.includes("/rest/v1/rpc/log_app_error")) return true;
  // Sign-in, sign-up and token refresh failures are expected user noise, not application errors.
  if (target.includes("/auth/v1/")) return true;
  return false;
}

export function createDedupe(windowMs = 60_000, now = Date.now) {
  const lastSent = new Map();
  return (fingerprint) => {
    const time = now();
    const previous = lastSent.get(fingerprint);
    if (previous !== undefined && time - previous < windowMs) return false;
    if (lastSent.size >= DEDUPE_MAX_ENTRIES) {
      for (const [key, sentAt] of lastSent) {
        if (time - sentAt >= windowMs) lastSent.delete(key);
      }
      // Still full of fresh entries: drop the oldest so memory stays bounded.
      while (lastSent.size >= DEDUPE_MAX_ENTRIES) {
        lastSent.delete(lastSent.keys().next().value);
      }
    }
    lastSent.set(fingerprint, time);
    return true;
  };
}
