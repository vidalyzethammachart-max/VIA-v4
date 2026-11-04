import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useLanguage } from "../i18n/useLanguage";
import {
  listStuckEvaluations,
  resolveStuckEvaluationReport,
  type StuckEvaluationRow,
} from "../services/stuckEvaluationService";

function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
}

// Admin view of evaluations pending for 30+ minutes. Recovery itself stays manual in n8n.
export default function StuckEvaluationsPanel() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<StuckEvaluationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
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

  const reportedCount = rows.filter((row) => row.report_id).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {t("admin.stuckTitle")}
            {!error && ` (${rows.length})`}
          </h2>
          {!error && (
            <p className="mt-1 text-sm text-slate-500">{t("admin.stuckDesc", { reported: String(reportedCount) })}</p>
          )}
        </div>
        <button type="button" onClick={() => void load()} className="btn-secondary text-xs">
          {t("admin.stuckRefresh")}
        </button>
      </div>

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
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[860px] text-left text-xs">
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
                    {row.document_error && <p className="mt-1 text-red-700">{row.document_error}</p>}
                  </td>
                  <td className="px-3 py-3 text-slate-700">{row.owner_email || "-"}</td>
                  <td className="px-3 py-3 text-slate-700">
                    {row.document_status === "pending"
                      ? t("admin.stuckMinutes", { minutes: String(minutesSince(row.created_at)) })
                      : row.document_status}
                  </td>
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
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link to={`/preview/${row.evaluation_id}`} className="btn-secondary text-xs">
                        {t("admin.stuckOpen")}
                      </Link>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
