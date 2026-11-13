import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import ConfirmModal from "../components/ConfirmModal";
import ErrorNoticeModal from "../components/ErrorNoticeModal";
import MainNavbar from "../components/MainNavbar";
import { useLanguage } from "../i18n/useLanguage";
import { ERROR_SOURCES, type ErrorSource } from "../services/errorReportCore.js";
import {
  ERROR_LOG_PAGE_SIZE,
  deleteErrorLog,
  deleteErrorLogsBefore,
  listErrorLogs,
  type ErrorLogRow,
} from "../services/errorLogService";

const DELETE_OLDER_DAYS = [7, 30, 90, 180];
const DAY_MS = 24 * 60 * 60 * 1000;

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

type Draft = { source: ErrorSource | ""; from: string; to: string; search: string };
const EMPTY_DRAFT: Draft = { source: "", from: "", to: "", search: "" };

// A date input holds a local calendar day; the query needs the matching instants.
function startOfDayIso(day: string): string | undefined {
  return day ? new Date(`${day}T00:00:00`).toISOString() : undefined;
}
function endOfDayIso(day: string): string | undefined {
  return day ? new Date(`${day}T23:59:59.999`).toISOString() : undefined;
}

export default function SuperAdminErrorsPage() {
  const { t, language } = useLanguage();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [applied, setApplied] = useState<Draft>(EMPTY_DRAFT);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ErrorLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [popupError, setPopupError] = useState<string | null>(null);
  const [olderDays, setOlderDays] = useState(DELETE_OLDER_DAYS[1]);
  const [confirmOlder, setConfirmOlder] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listErrorLogs({
      page,
      source: applied.source,
      from: startOfDayIso(applied.from),
      to: endOfDayIso(applied.to),
      search: applied.search,
    })
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setTotal(result.total);
      })
      .catch((error) => {
        if (!cancelled) setPopupError(error instanceof Error ? error.message : t("superAdmin.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, page, reloadKey]);

  const repeatCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.fingerprint, (counts.get(row.fingerprint) ?? 0) + 1);
    return counts;
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(total / ERROR_LOG_PAGE_SIZE));
  const locale = language === "th" ? "th-TH" : "en-GB";

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  async function handleDeleteOne(id: number) {
    try {
      await deleteErrorLog(id);
      setExpandedId(null);
      // Removing the last row of the last page would otherwise request an empty range.
      if (rows.length === 1 && page > 1) setPage(page - 1);
      else reload();
    } catch (error) {
      setPopupError(error instanceof Error ? error.message : t("superAdmin.deleteFailed"));
    }
  }

  async function handleDeleteOlder() {
    if (deleting) return;
    try {
      setDeleting(true);
      await deleteErrorLogsBefore(new Date(Date.now() - olderDays * DAY_MS).toISOString());
      setConfirmOlder(false);
      setPage(1);
      reload();
    } catch (error) {
      setConfirmOlder(false);
      setPopupError(error instanceof Error ? error.message : t("superAdmin.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />
      <ErrorNoticeModal isOpen={popupError !== null} detail={popupError} onClose={() => setPopupError(null)} />
      <ConfirmModal
        isOpen={confirmOlder}
        title={t("superAdmin.deleteOlderTitle")}
        message={t("superAdmin.deleteOlderMessage", { days: olderDays })}
        confirmLabel={deleting ? t("superAdmin.deleting") : t("superAdmin.deleteConfirm")}
        cancelLabel={t("superAdmin.cancel")}
        confirmDisabled={deleting}
        onConfirm={() => void handleDeleteOlder()}
        onCancel={() => setConfirmOlder(false)}
      />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:py-8">
        <section className="ui-hover-card rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
          <h1 className="text-sm font-semibold text-slate-900 md:text-base">{t("superAdmin.title")}</h1>
          <p className="mt-1 text-xs text-slate-500">{t("superAdmin.subtitle")}</p>
        </section>

        <form
          className="ui-hover-card space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            setApplied(draft);
            setPage(1);
          }}
        >
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1">
              <label htmlFor="error-source" className="text-xs font-medium text-slate-700">
                {t("superAdmin.filterSource")}
              </label>
              <select
                id="error-source"
                value={draft.source}
                onChange={(event) => setDraft({ ...draft, source: event.target.value as ErrorSource | "" })}
                className={inputClass}
              >
                <option value="">{t("superAdmin.allSources")}</option>
                {ERROR_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {t(`superAdmin.source.${source}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="error-from" className="text-xs font-medium text-slate-700">
                {t("superAdmin.filterFrom")}
              </label>
              <input
                id="error-from"
                type="date"
                value={draft.from}
                onChange={(event) => setDraft({ ...draft, from: event.target.value })}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="error-to" className="text-xs font-medium text-slate-700">
                {t("superAdmin.filterTo")}
              </label>
              <input
                id="error-to"
                type="date"
                value={draft.to}
                onChange={(event) => setDraft({ ...draft, to: event.target.value })}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="error-search" className="text-xs font-medium text-slate-700">
                {t("superAdmin.filterSearch")}
              </label>
              <input
                id="error-search"
                type="search"
                value={draft.search}
                placeholder={t("superAdmin.searchPlaceholder")}
                onChange={(event) => setDraft({ ...draft, search: event.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary rounded-full px-6 py-2 text-sm">
              {t("superAdmin.apply")}
            </button>
            <button
              type="button"
              className="btn-secondary rounded-full px-6 py-2 text-sm"
              onClick={() => {
                setDraft(EMPTY_DRAFT);
                setApplied(EMPTY_DRAFT);
                setPage(1);
              }}
            >
              {t("superAdmin.reset")}
            </button>
            <span className="text-xs text-slate-500">{t("superAdmin.total", { count: total })}</span>
          </div>
        </form>

        <section className="ui-hover-card space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          {loading ? (
            <p className="text-center text-sm text-slate-500" role="status">
              {t("superAdmin.loading")}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-center text-sm text-slate-500">{t("superAdmin.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {[
                      "superAdmin.colTime",
                      "superAdmin.colUser",
                      "superAdmin.colRole",
                      "superAdmin.colSource",
                      "superAdmin.colMessage",
                      "superAdmin.colPage",
                      "superAdmin.colRepeat",
                    ].map((key) => (
                      <th key={key} className="border-b border-slate-200 px-3 py-3 font-semibold">
                        {t(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <Fragment key={row.id}>
                      <tr
                        className="cursor-pointer align-top hover:bg-slate-50/70"
                        onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                        aria-expanded={expandedId === row.id}
                      >
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                          {new Date(row.created_at).toLocaleString(locale)}
                        </td>
                        <td className="px-3 py-3 font-mono text-slate-600">{row.user_id?.slice(0, 8) ?? "-"}</td>
                        <td className="px-3 py-3 text-slate-600">{row.user_role ?? "-"}</td>
                        <td className="px-3 py-3 text-slate-700">{t(`superAdmin.source.${row.source}`)}</td>
                        <td className="max-w-md break-words px-3 py-3 font-medium text-slate-900">{row.message}</td>
                        <td className="max-w-[200px] break-all px-3 py-3 text-slate-600">{row.page_path ?? "-"}</td>
                        <td className="px-3 py-3 text-slate-700">{repeatCounts.get(row.fingerprint) ?? 1}</td>
                      </tr>
                      {expandedId === row.id && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={7} className="space-y-3 px-3 py-4">
                            <dl className="grid gap-2 text-xs text-slate-600 md:grid-cols-3">
                              <div>
                                <dt className="font-semibold">{t("superAdmin.detailUserId")}</dt>
                                <dd className="break-all font-mono">{row.user_id ?? "-"}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold">{t("superAdmin.detailFingerprint")}</dt>
                                <dd className="font-mono">{row.fingerprint}</dd>
                              </div>
                              <div>
                                <dt className="font-semibold">{t("superAdmin.detailUserAgent")}</dt>
                                <dd className="break-words">{row.user_agent ?? "-"}</dd>
                              </div>
                            </dl>
                            <div>
                              <p className="text-xs font-semibold text-slate-700">{t("superAdmin.detailStack")}</p>
                              <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">
                                {row.stack ?? t("superAdmin.noStack")}
                              </pre>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-700">{t("superAdmin.detailContext")}</p>
                              <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">
                                {JSON.stringify(row.context, null, 2)}
                              </pre>
                            </div>
                            <button
                              type="button"
                              className="btn-danger rounded-full px-4 py-1.5 text-xs"
                              onClick={() => void handleDeleteOne(row.id)}
                            >
                              {t("superAdmin.deleteOne")}
                            </button>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <nav className="flex items-center justify-between gap-3 text-sm" aria-label="pagination">
              <button
                type="button"
                className="btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                {t("superAdmin.prevPage")}
              </button>
              <span className="text-slate-600">{t("superAdmin.page", { page, total: totalPages })}</span>
              <button
                type="button"
                className="btn-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                {t("superAdmin.nextPage")}
              </button>
            </nav>
          )}
        </section>

        <section className="ui-hover-card flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <label htmlFor="older-days" className="text-xs font-medium text-slate-700">
            {t("superAdmin.deleteOlderLabel")}
          </label>
          <select
            id="older-days"
            value={olderDays}
            onChange={(event) => setOlderDays(Number(event.target.value))}
            className={`${inputClass} !w-auto`}
          >
            {DELETE_OLDER_DAYS.map((days) => (
              <option key={days} value={days}>
                {t("superAdmin.days", { days })}
              </option>
            ))}
          </select>
          <button type="button" className="btn-danger rounded-full px-5 py-2 text-sm" onClick={() => setConfirmOlder(true)}>
            {t("superAdmin.deleteOlder")}
          </button>
        </section>
      </main>
    </div>
  );
}
