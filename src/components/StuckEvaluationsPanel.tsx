import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useLanguage } from "../i18n/useLanguage";
import {
  listStuckEvaluations,
  resolveStuckEvaluationReport,
  retryEvaluationExecution,
  type StuckEvaluationRow,
} from "../services/stuckEvaluationService";

function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
}

// Retry shows only on jobs that are still stuck or failed and not already being retried.
// Jobs without a recorded failure are looked up in n8n by the retry function.
const canRetry = (row: StuckEvaluationRow) =>
  row.document_status !== "ready" &&
  !row.retry_claimed_at &&
  !row.retry_execution_id &&
  (row.document_status === "pending" || row.failure_http_status === 429);

// Admin view of stuck or failed evaluations. Retry reruns the same n8n execution
// with the saved workflow, and only for quota (429) failures.
export default function StuckEvaluationsPanel() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<StuckEvaluationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (keepError = false) => {
    try {
      if (!keepError) setError(null);
      setRows(await listStuckEvaluations());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("admin.stuckLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = async (evaluationId: number) => {
    try {
      setBusyId(evaluationId);
      await resolveStuckEvaluationReport(evaluationId);
      await load();
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : t("admin.stuckLoadFailed"));
    } finally {
      setBusyId(null);
    }
  };

  const retry = async (row: StuckEvaluationRow) => {
    try {
      setBusyId(row.evaluation_id);
      setError(null);
      setNotice(null);
      const newExecution = await retryEvaluationExecution(row.evaluation_id);
      setNotice(newExecution
        ? t("admin.retryStarted", { id: String(row.evaluation_id), execution: String(newExecution) })
        : t("admin.retryStillRunning", { id: String(row.evaluation_id) }));
      await load();
    } catch (retryError) {
      setError(`#${row.evaluation_id}: ${retryError instanceof Error ? retryError.message : t("admin.retryFailed")}`);
      // A refused retry may still have recorded the failure; refresh so the row shows it.
      await load(true);
    } finally {
      setBusyId(null);
    }
  };

  const reportedCount = rows.filter((row) => row.report_id).length;
  const quotaCount = rows.filter((row) => row.document_status === "failed" && row.failure_http_status === 429 && canRetry(row)).length;

  const formatWaiting = (minutes: number) => {
    if (minutes < 60) return t("admin.stuckMinutes", { minutes: String(minutes) });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("admin.stuckHours", { hours: String(hours), minutes: String(minutes % 60) });
    return t("admin.stuckDays", { days: String(Math.floor(hours / 24)), hours: String(hours % 24) });
  };

  const statusCell = (row: StuckEvaluationRow) => {
    if (row.retry_execution_id && row.document_status === "pending") {
      return <span className="text-sky-700">{t("admin.retryRunning", { execution: String(row.retry_execution_id) })}</span>;
    }
    if (row.retry_claimed_at && row.document_status === "pending") {
      return <span className="text-sky-700">{t("admin.retryRunningInN8n")}</span>;
    }
    if (row.document_status === "failed") {
      return (
        <span className="text-red-700">
          {row.failure_http_status === 429 ? t("admin.failedQuota") : t("admin.failedOther")}
          {row.failure_http_status && row.failure_http_status !== 429 ? ` (HTTP ${row.failure_http_status})` : ""}
          {row.failure_execution_id ? ` · #${row.failure_execution_id}` : ""}
        </span>
      );
    }
    return <span>{formatWaiting(minutesSince(row.created_at))}</span>;
  };

  const actions = (row: StuckEvaluationRow) => (
    <div className="flex flex-wrap items-center gap-2">
      <Link to={`/preview/${row.evaluation_id}`} className="btn-secondary text-xs">
        {t("admin.stuckOpen")}
      </Link>
      {canRetry(row) && (
        <button
          type="button"
          onClick={() => void retry(row)}
          disabled={busyId === row.evaluation_id}
          className="btn-primary text-xs"
        >
          {busyId === row.evaluation_id ? t("admin.retrying") : t("admin.retry")}
        </button>
      )}
      {row.report_id && (
        <button
          type="button"
          onClick={() => void resolve(row.evaluation_id)}
          disabled={busyId === row.evaluation_id}
          className="btn-secondary text-xs"
        >
          {t("admin.stuckResolve")}
        </button>
      )}
    </div>
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {t("admin.stuckTitle")}
            {!error && ` (${rows.length})`}
          </h2>
          {!error && (
            <p className="mt-1 text-sm text-slate-500">
              {t("admin.stuckDesc", { reported: String(reportedCount) })} {t("admin.retryDesc", { quota: String(quotaCount) })}
            </p>
          )}
        </div>
        <button type="button" onClick={() => void load()} className="btn-secondary text-xs">
          {t("admin.stuckRefresh")}
        </button>
      </div>

      {notice && <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">{t("admin.stuckLoading")}</p>
      ) : error && rows.length === 0 ? null : rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{t("admin.stuckEmpty")}</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 md:hidden">
            {rows.map((row) => (
              <li key={row.evaluation_id} className="space-y-2 p-4 text-sm">
                <p className="break-words font-semibold text-slate-900">{row.subject_name || "-"}</p>
                <p className="text-xs text-slate-500">
                  #{row.evaluation_id}
                  {row.order_number ? ` · ${row.order_number}` : ""} · {row.owner_email || "-"}
                </p>
                <p className="text-xs">{statusCell(row)}</p>
                {row.report_id && (
                  <p className="text-xs text-amber-700">
                    {t("admin.stuckReported")}
                    {row.report_note ? `: ${row.report_note}` : ""}
                  </p>
                )}
                {row.retry_error && <p className="text-xs text-red-700">{row.retry_error}</p>}
                {actions(row)}
              </li>
            ))}
          </ul>
          <div className="mt-4 hidden overflow-x-auto rounded-xl border border-slate-200 md:block">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-3 font-semibold">{t("admin.stuckEvaluation")}</th>
                  <th className="px-3 py-3 font-semibold">{t("admin.stuckOwner")}</th>
                  <th className="px-3 py-3 font-semibold">{t("admin.stuckWaiting")}</th>
                  <th className="px-3 py-3 font-semibold">{t("admin.stuckReport")}</th>
                  <th className="px-3 py-3 font-semibold">{t("admin.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((row) => (
                  <tr key={row.evaluation_id} className="align-top">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-slate-900">{row.subject_name || "-"}</p>
                      <p className="mt-1 text-slate-500">
                        #{row.evaluation_id}
                        {row.order_number ? ` · ${row.order_number}` : ""}
                      </p>
                      {row.document_status === "failed" && row.document_error && (
                        <p className="mt-1 line-clamp-2 text-slate-500">{row.document_error}</p>
                      )}
                      {row.retry_error && <p className="mt-1 text-red-700">{row.retry_error}</p>}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{row.owner_email || "-"}</td>
                    <td className="px-3 py-3 text-slate-700">{statusCell(row)}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {row.report_id ? (
                        <>
                          <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700">
                            {t("admin.stuckReported")}
                          </span>
                          {row.report_note && <p className="mt-1">{row.report_note}</p>}
                        </>
                      ) : (
                        <span className="text-slate-500">{t("admin.stuckNotReported")}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">{actions(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
