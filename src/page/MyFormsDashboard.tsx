import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import ConfirmModal from "../components/ConfirmModal";
import MainNavbar from "../components/MainNavbar";
import { useLanguage } from "../i18n/useLanguage";
import { supabase } from "../lib/supabaseClient";

const DOCUMENTS_BUCKET = "evaluation-documents";

type EvaluationItem = {
  id: number;
  user_id: string | null;
  order_number: string | null;
  subject_name: string | null;
  overall_suggestion: string | null;
  pdf_storage_path: string | null;
  docx_storage_path: string | null;
  document_status: "pending" | "ready" | "failed";
  document_error: string | null;
  created_at: string;
};

export default function MyFormsDashboard() {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<EvaluationItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeDownloadKey, setActiveDownloadKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | EvaluationItem["document_status"]>("all");
  const [deleteTarget, setDeleteTarget] = useState<EvaluationItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    void loadMyForms();
  }, []);

  function formatDate(dateString: string) {
    return new Intl.DateTimeFormat(language === "th" ? "th-TH" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(dateString));
  }

  const loadMyForms = async () => {
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
        .select("id, user_id, order_number, subject_name, overall_suggestion, pdf_storage_path, docx_storage_path, document_status, document_error, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      setItems((data ?? []) as EvaluationItem[]);
    } catch (error) {
      console.error("Failed to load my forms:", error);
      setErrorMessage(error instanceof Error ? error.message : t("myForms.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

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

      window.open(await createDocumentSignedUrl(path), "_blank", "noopener,noreferrer");
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

      const { error } = await supabase
        .from("evaluations")
        .delete()
        .eq("id", deleteTarget.id)
        .eq("user_id", user.id)
        .select("id")
        .single();

      if (error) {
        throw error;
      }

      setItems((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete form:", error);
      setErrorMessage(error instanceof Error ? error.message : t("myForms.deleteFailed"));
    } finally {
      setDeletingId(null);
    }
  };

  const completedPreviewCount = items.filter((item) => item.document_status === "ready").length;
  const filteredItems = items.filter((item) => {
    const matchesStatus = statusFilter === "all" || item.document_status === statusFilter;
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
    <div className="min-h-screen bg-slate-50">
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

      <main className="mx-auto max-w-6xl px-4 py-6 md:py-8">
        <section className="grid gap-4 md:grid-cols-3">
          <div className="ui-hover-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">
              {t("myForms.totalForms")}
            </p>
            <p className="mt-3 text-4xl font-bold text-slate-900">{items.length}</p>
            <p className="mt-2 text-sm text-slate-500">{t("myForms.totalFormsDesc")}</p>
          </div>

          <div className="ui-hover-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">
              {t("myForms.readyToPreview")}
            </p>
            <p className="mt-3 text-4xl font-bold text-sky-600 dark:text-sky-400">
              {completedPreviewCount}
            </p>
            <p className="mt-2 text-sm text-slate-500">{t("myForms.readyToPreviewDesc")}</p>
          </div>

          <div className="ui-hover-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">
              {t("myForms.quickAction")}
            </p>
            <Link to="/form-submit" className="btn-primary mt-3 inline-flex">
              {t("myForms.submitNewForm")}
            </Link>
            <p className="mt-2 text-sm text-slate-500">{t("myForms.quickActionDesc")}</p>
          </div>
        </section>

        <section className="ui-hover-card mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">{t("myForms.submissionsTitle")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("myForms.submissionsDesc")}</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("myForms.searchPlaceholder")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#04418b]/30 focus:ring-4 focus:ring-[#04418b]/5 sm:w-72"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | EvaluationItem["document_status"])}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#04418b]/30 focus:ring-4 focus:ring-[#04418b]/5"
              >
                <option value="all">{t("myForms.allStatuses")}</option>
                <option value="pending">{t("common.pending")}</option>
                <option value="ready">{t("common.ready")}</option>
                <option value="failed">{t("common.failed")}</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">{t("myForms.loading")}</div>
          ) : errorMessage ? (
            <div className="px-5 py-12 text-center text-sm text-red-600">{errorMessage}</div>
          ) : items.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">{t("myForms.empty")}</div>
          ) : filteredItems.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">{t("myForms.noMatch")}</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredItems.map((item) => (
                <article
                  key={item.id}
                  className="ui-hover-card flex flex-col gap-4 px-5 py-5 md:flex-row md:items-start md:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900">
                        {item.subject_name || t("myForms.untitled")}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        #{item.order_number || "-"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{formatDate(item.created_at)}</p>
                    <p className="mt-3 line-clamp-2 text-sm text-slate-600">
                      {item.overall_suggestion?.trim() || t("myForms.noSuggestion")}
                    </p>
                    {item.document_status === "failed" ? (
                      <p className="mt-3 text-xs font-medium text-red-600">
                        {t("myForms.failed", { error: item.document_error || "-" })}
                      </p>
                    ) : item.document_status !== "ready" ? (
                      <p className="mt-3 text-xs font-medium text-amber-600">
                        {t("myForms.pendingPreview")}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
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
                          className="btn-danger text-center"
                        >
                          {t("myForms.delete")}
                        </button>
                      </>
                    ) : item.document_status === "failed" ? (
                      <>
                        <Link to={`/preview/${item.id}`} className="btn-danger text-center">
                          {t("myForms.viewError")}
                        </Link>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          disabled={deletingId === item.id}
                          className="btn-danger text-center"
                        >
                          {t("myForms.delete")}
                        </button>
                      </>
                    ) : (
                      <>
                        <Link to={`/preview/${item.id}`} className="btn-secondary text-center">
                          {t("myForms.trackStatus")}
                        </Link>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          disabled={deletingId === item.id}
                          className="btn-danger text-center"
                        >
                          {t("myForms.delete")}
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
