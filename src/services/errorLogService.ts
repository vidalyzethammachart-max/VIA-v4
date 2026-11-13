import { supabase } from "../lib/supabaseClient";
import type { ErrorSource } from "./errorReportCore.js";

export const ERROR_LOG_PAGE_SIZE = 50;

export type ErrorLogRow = {
  id: number;
  created_at: string;
  user_id: string | null;
  user_role: string | null;
  source: ErrorSource;
  message: string;
  stack: string | null;
  page_path: string | null;
  user_agent: string | null;
  context: Record<string, unknown>;
  fingerprint: string;
};

export type ErrorLogFilters = {
  source?: ErrorSource | "";
  from?: string;
  to?: string;
  search?: string;
  page: number;
};

// ilike treats % and _ (and the escape character) as wildcards, so a typed search is escaped.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export async function listErrorLogs(
  filters: ErrorLogFilters,
): Promise<{ rows: ErrorLogRow[]; total: number }> {
  let query = supabase
    .from("app_error_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters.source) query = query.eq("source", filters.source);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", filters.to);
  const search = filters.search?.trim();
  if (search) query = query.ilike("message", `%${escapeLike(search)}%`);

  const page = Math.max(1, Math.floor(filters.page) || 1);
  const start = (page - 1) * ERROR_LOG_PAGE_SIZE;
  const { data, error, count } = await query.range(start, start + ERROR_LOG_PAGE_SIZE - 1);

  if (error) {
    throw new Error(error.message);
  }

  return { rows: (data ?? []) as ErrorLogRow[], total: count ?? 0 };
}

export async function deleteErrorLog(id: number): Promise<void> {
  const { error } = await supabase.from("app_error_logs").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteErrorLogsBefore(isoDate: string): Promise<void> {
  const { error } = await supabase.from("app_error_logs").delete().lt("created_at", isoDate);
  if (error) {
    throw new Error(error.message);
  }
}
