export type ErrorSource = "popup" | "window_error" | "unhandled_rejection" | "react" | "network";

export const ERROR_SOURCES: readonly ErrorSource[];

export type ErrorReport = {
  source: ErrorSource;
  message: string;
  stack?: string | null;
  pagePath?: string | null;
  userAgent?: string | null;
  context?: unknown;
};

export function buildFingerprint(source: string, message: string, stack?: string | null): string;

export function truncateReport(report: ErrorReport): {
  source: ErrorSource;
  message: string;
  stack: string | null;
  pagePath: string | null;
  userAgent: string | null;
  context: Record<string, unknown>;
};

export function normalizeError(error: unknown): { message: string; stack: string | null };

export function shouldIgnoreNetworkError(info: {
  url: string;
  status: number;
  method: string;
  aborted?: boolean;
}): boolean;

export function createDedupe(windowMs?: number, now?: () => number): (fingerprint: string) => boolean;
