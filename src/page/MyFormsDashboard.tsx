import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import ConfirmModal from "../components/ConfirmModal";
import MainNavbar from "../components/MainNavbar";
import { useLanguage } from "../i18n/useLanguage";
import { supabase } from "../lib/supabaseClient";
import { buildDocumentDownloadUrl } from "../services/documentDownload.js";
import { collapseSupersededEvaluations } from "../services/evaluationSupersedeCore.js";
import { isEvaluationStuck } from "../services/stuckEvaluationCore.js";
import { deleteEvaluationWithFiles } from "../services/evaluationDelete";
import { describeEvaluationDeleteError, isEvaluationInUseError } from "../utils/evaluationDeleteError";
import "./dashboard.css";

const DOCUMENTS_BUCKET = "evaluation-documents";

type EvaluationItem = {
  id: number;
  user_id: string | null;
  order_number: string | null;
  subject_name: string | null;
  overall_suggestion: string | null;
  video_case_id: string | null;
  pdf_storage_path: string | null;
  docx_storage_path: string | null;
  document_status: "pending" | "ready" | "failed";
  document_error: string | null;
  created_at: string;
};

export default function MyFormsDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<EvaluationItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeDownloadKey, setActiveDownloadKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "stuck" | EvaluationItem["document_status"]>("all");
  const [deleteTarget, setDeleteTarget] = useState<EvaluationItem | null>(null);
  const [blockedItem, setBlockedItem] = useState<EvaluationItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const navigationState = location.state as
    | { generated?: boolean; evaluationId?: number; submissionId?: string; aggregateId?: string }
    | null;
  const showSuccessBanner = Boolean(navigationState?.generated);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);


  function formatDate(dateString: string) {
    return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-US", {
      day: "numeric",
      month: "short",
      year: language === "th" ? "2-digit" : "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateString));
  }

  const loadMyForms = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        navigate("/", { replace: true });
        return;
      }

      const { data, error } = await supabase
        .from("evaluations")
        .select("id, user_id, order_number, subject_name, overall_suggestion, video_case_id, pdf_storage_path, docx_storage_path, document_status, document_error, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      // A resubmitted case replaces its stuck copy, so each case shows once.
      setItems(collapseSupersededEvaluations((data ?? []) as EvaluationItem[]));
    } catch (error) {
      console.error("Failed to load my forms:", error);
      setErrorMessage(error instanceof Error ? error.message : t("myForms.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [navigate, t]);

  useEffect(() => {
    void loadMyForms();
  }, [loadMyForms]);

  const createDocumentSignedUrl = async (path: string) => {
    const { data, error } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(path, 60 * 60);

    if (error || !data?.signedUrl) {
      throw new Error(
        `${error?.message || "Could not prepare document URL."} Bucket: ${DOCUMENTS_BUCKET}. Path: ${path}`,
      );
    }

    return data.signedUrl;
  };

  const handleDownload = async (item: EvaluationItem, format: "pdf" | "docx") => {
    const downloadKey = `${item.id}:${format}`;
    const path = format === "pdf" ? item.pdf_storage_path : item.docx_storage_path;

    try {
      setActiveDownloadKey(downloadKey);

      if (!path) {
        throw new Error(t("myForms.noArtifact", { format: format.toUpperCase() }));
      }

      const url = await createDocumentSignedUrl(path);
      window.open(buildDocumentDownloadUrl(url, item.subject_name, format, `evaluation-${item.id}`), "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error(`Failed to download ${format}:`, error);
      setErrorMessage(error instanceof Error ? error.message : t("myForms.downloadFailed", { format: format.toUpperCase() }));
    } finally {
      setActiveDownloadKey(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      setDeletingId(deleteTarget.id);
      setErrorMessage(null);

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        navigate("/", { replace: true });
        return;
      }

      await deleteEvaluationWithFiles(deleteTarget.id, user.id);

      setItems((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete form:", error);
      if (isEvaluationInUseError(error)) {
        // Explain in a dialog and point at the case where the summary can be removed.
        setBlockedItem(deleteTarget);
      } else {
        setErrorMessage(describeEvaluationDeleteError(error, t));
      }
      // Close the confirmation so the reason is visible instead of a dialog that looks stuck.
      setDeleteTarget(null);
    } finally {
      setDeletingId(null);
    }
  };

  const completedPreviewCount = items.filter((item) => item.document_status === "ready").length;
  const filteredItems = items.filter((item) => {
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "stuck" ? isEvaluationStuck(item) : item.document_status === statusFilter);
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return matchesStatus;
    }

    const haystack = [
      item.subject_name,
      item.order_number,
      item.overall_suggestion,
      item.user_id,
      item.document_status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return matchesStatus && haystack.includes(query);
  });

  return (
    <div className="db-root">
      <MainNavbar />
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title={t("myForms.deleteTitle")}
        message={t("myForms.deleteMessage", {
          label: deleteTarget?.subject_name || t("myForms.untitled"),
        })}
        variant="danger"
        onCancel={() => {
          if (!deletingId) setDeleteTarget(null);
        }}
        onConfirm={() => void handleDelete()}
        confirmLabel={t("myForms.confirmDelete")}
        cancelLabel={t("common.cancel")}
        confirmDisabled={Boolean(deletingId)}
      />

      <ConfirmModal
        isOpen={Boolean(blockedItem)}
        title={t("myForms.deleteBlockedTitle")}
        message={t("myForms.deleteInUse")}
        variant="primary"
        onCancel={() => setBlockedItem(null)}
        onConfirm={() => {
          const caseId = blockedItem?.video_case_id;
          setBlockedItem(null);
          navigate(caseId ? `/video-cases/${caseId}` : "/video-cases");
        }}
        confirmLabel={t("myForms.deleteBlockedAction")}
        cancelLabel={t("common.close")}
      />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-bold leading-snug">{t("myForms.submissionsTitle")}</h1>
            <p className="db-muted max-w-xl">{t("myForms.submissionsDesc")}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/video-cases" className="btn-secondary">{t("myForms.videoCases")}</Link>
            <Link to="/form-submit" className="btn-primary">{t("myForms.submitNewForm")}</Link>
          </div>
        </header>

        {showSuccessBanner && (
          <section role="status" className="db-ok mb-6">
            <p className="font-semibold">
              {navigationState?.aggregateId
                ? "Combined summary sent for re-analysis."
                : "Evaluation sent for analysis."}
            </p>
            <p className="mt-1">
              {navigationState?.aggregateId
                ? `Aggregate ID: ${navigationState.aggregateId}`
                : navigationState?.evaluationId
                  ? `Evaluation ID: ${navigationState.evaluationId}`
                  : "Your submission has been saved and sent to the processing flow."}
            </p>
          </section>
        )}

        <dl className="db-kpis mb-8" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
          <div className="db-kpi">
            <dt className="db-muted text-sm">{t("myForms.totalForms")}</dt>
            <dd>{items.length}</dd>
          </div>
          <div className="db-kpi">
            <dt className="db-muted text-sm">{t("myForms.readyToPreview")}</dt>
            <dd>{completedPreviewCount}</dd>
          </div>
        </dl>

        <section className="db-panel">
          <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row" style={{ borderColor: "var(--db-line)" }}>
            <input
              type="search"
              aria-label={t("myForms.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("myForms.searchPlaceholder")}
              className="db-input sm:w-80"
            />
            <select
              aria-label={t("myForms.allStatuses")}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "stuck" | EvaluationItem["document_status"])}
              className="db-input sm:w-56"
            >
              <option value="all">{t("myForms.allStatuses")}</option>
              <option value="pending">{t("common.pending")}</option>
              <option value="stuck">{t("myForms.stuckFilter")}</option>
              <option value="ready">{t("common.ready")}</option>
              <option value="failed">{t("common.failed")}</option>
            </select>
          </div>

          {loading ? (
            <p className="db-muted px-5 py-12 text-center text-sm" role="status">{t("myForms.loading")}</p>
          ) : errorMessage ? (
            <p className="px-5 py-12 text-center text-sm" role="alert" style={{ color: "#dc2626" }}>{errorMessage}</p>
          ) : items.length === 0 ? (
            <p className="db-muted px-5 py-12 text-center text-sm">{t("myForms.empty")}</p>
          ) : filteredItems.length === 0 ? (
            <p className="db-muted px-5 py-12 text-center text-sm">{t("myForms.noMatch")}</p>
          ) : (
            <ul>
              {filteredItems.map((item) => {
                const stuck = isEvaluationStuck(item);
                const state = item.document_status === "ready" ? "ready" : item.document_status === "failed" || stuck ? "alert" : "pending";
                return (
                  <li
                    key={item.id}
                    data-state={state}
                    className="db-row flex flex-col gap-4 px-5 py-5 md:flex-row md:items-start md:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold leading-relaxed">
                          <Link to={`/preview/${item.id}`} className="db-link">{item.subject_name || t("myForms.untitled")}</Link>
                        </h2>
                        <span className="db-chip">#{item.order_number || "-"}</span>
                      </div>
                      <p className="db-muted text-sm">{formatDate(item.created_at)}</p>
                      {item.video_case_id && (
                        <p className="mt-1 text-xs">
                          <Link to={`/video-cases/${item.video_case_id}`} className="db-link">{t("myForms.linkedCase")}</Link>
                        </p>
                      )}
                      <p className="mt-3 line-clamp-2 text-sm leading-relaxed">
                        {item.overall_suggestion?.trim() || t("myForms.noSuggestion")}
                      </p>
                      {item.document_status === "failed" ? (
                        <p className="db-status-alert mt-3 text-xs font-medium">
                          {/\(HTTP 429\)/.test(item.document_error || "")
                            ? t("myForms.failedQuota")
                            : t("myForms.failed", { error: item.document_error || "-" })}
                        </p>
                      ) : item.document_status !== "ready" ? (
                        <p className={`mt-3 text-xs font-medium ${stuck ? "db-status-alert" : "db-status-pending"}`}>
                          {stuck ? t("myForms.stuckPreview") : t("myForms.pendingPreview")}
                        </p>
                      ) : null}
                    </div>

                    <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-row">
                      {item.document_status === "ready" && (item.pdf_storage_path || item.docx_storage_path) ? (
                        <>
                          <Link to={`/preview/${item.id}`} className="btn-primary text-center">
                            {t("common.preview")}
                          </Link>
                          {item.pdf_storage_path && (
                            <button
                              type="button"
                              onClick={() => void handleDownload(item, "pdf")}
                              disabled={activeDownloadKey === `${item.id}:pdf`}
                              className="btn-secondary text-center"
                            >
                              {activeDownloadKey === `${item.id}:pdf`
                                ? t("myForms.preparingPdf")
                                : t("myForms.downloadPdf")}
                            </button>
                          )}
                          {item.docx_storage_path && (
                            <button
                              type="button"
                              onClick={() => void handleDownload(item, "docx")}
                              disabled={activeDownloadKey === `${item.id}:docx`}
                              className="btn-secondary text-center"
                            >
                              {activeDownloadKey === `${item.id}:docx`
                                ? t("myForms.preparingDocx")
                                : t("myForms.downloadDocx")}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            disabled={deletingId === item.id}
                            className="db-danger-link col-span-2 justify-self-end sm:col-span-1 sm:self-center"
                          >
                            {t("myForms.delete")}
                          </button>
                        </>
                      ) : item.document_status === "failed" ? (
                        <>
                          <Link to={`/preview/${item.id}`} className="btn-secondary text-center">
                            {t("myForms.viewError")}
                          </Link>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            disabled={deletingId === item.id}
                            className="db-danger-link col-span-2 justify-self-end sm:col-span-1 sm:self-center"
                          >
                            {t("myForms.delete")}
                          </button>
                        </>
                      ) : (
                        <>
                          <Link to={`/preview/${item.id}`} className="btn-secondary text-center">
                            {stuck ? t("myForms.stuckAction") : t("myForms.trackStatus")}
                          </Link>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            disabled={deletingId === item.id}
                            className="db-danger-link col-span-2 justify-self-end sm:col-span-1 sm:self-center"
                          >
                            {t("myForms.delete")}
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
