import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import ConfirmModal from "../components/ConfirmModal";
import MainNavbar from "../components/MainNavbar";
import { useLanguage } from "../i18n/useLanguage";
import { supabase } from "../lib/supabaseClient";

const DOCUMENTS_BUCKET = "evaluation-documents";

type PreviewRecord = {
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

type ArtifactUrls = {
  source: "storage";
  previewUrl: string | null;
  pdfUrl: string | null;
  docxUrl: string | null;
};

export default function PreviewPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { docId } = useParams<{ docId: string }>();
  const evaluationId = Number(docId);
  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState<PreviewRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [artifactUrls, setArtifactUrls] = useState<ArtifactUrls | null>(null);
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const hasStorageArtifact = Boolean(record?.pdf_storage_path || record?.docx_storage_path);

  useEffect(() => {
    const loadPreview = async () => {
      if (!Number.isInteger(evaluationId) || evaluationId <= 0) {
        setErrorMessage(t("preview.invalidRequest"));
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("evaluations")
        .select("id, user_id, order_number, subject_name, overall_suggestion, pdf_storage_path, docx_storage_path, document_status, document_error, created_at")
        .eq("id", evaluationId)
        .maybeSingle();

      if (error) {
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setErrorMessage(t("preview.notFound"));
        setLoading(false);
        return;
      }

      setRecord(data as PreviewRecord);
      setLoading(false);
    };

    void loadPreview();
  }, [evaluationId, t]);

  useEffect(() => {
    if (!record || record.document_status !== "pending") {
      return;
    }

    const intervalId = window.setInterval(async () => {
      const { data, error } = await supabase
        .from("evaluations")
        .select("id, user_id, order_number, subject_name, overall_suggestion, pdf_storage_path, docx_storage_path, document_status, document_error, created_at")
        .eq("id", evaluationId)
        .maybeSingle();

      if (!error && data) {
        setRecord(data as PreviewRecord);
      }
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [evaluationId, record]);

  useEffect(() => {
    const loadArtifactUrls = async () => {
      if (!record || record.document_status !== "ready" || !hasStorageArtifact) {
        setArtifactUrls(null);
        return;
      }

      setArtifactLoading(true);

      const [pdfSigned, docxSigned] = await Promise.all([
        record.pdf_storage_path
          ? supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(record.pdf_storage_path, 60 * 60)
          : Promise.resolve({ data: null, error: null }),
        record.docx_storage_path
          ? supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(record.docx_storage_path, 60 * 60)
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (pdfSigned.error || docxSigned.error) {
        setArtifactUrls(null);
        setErrorMessage(
          `${pdfSigned.error?.message || docxSigned.error?.message || t("preview.resolveFailed")} Bucket: ${DOCUMENTS_BUCKET}. Path: ${record.pdf_storage_path || record.docx_storage_path || "-"}`,
        );
        setArtifactLoading(false);
        return;
      }

      setArtifactUrls({
        source: "storage",
        previewUrl: pdfSigned.data?.signedUrl ?? null,
        pdfUrl: pdfSigned.data?.signedUrl ?? null,
        docxUrl: docxSigned.data?.signedUrl ?? null,
      });
      setArtifactLoading(false);
    };

    void loadArtifactUrls();
  }, [hasStorageArtifact, record, t]);

  const handleDelete = async () => {
    if (!record) {
      return;
    }

    try {
      setDeleting(true);
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
        .eq("id", record.id)
        .eq("user_id", user.id)
        .select("id")
        .single();

      if (error) {
        throw error;
      }

      navigate("/my-forms", { replace: true });
    } catch (error) {
      console.error("Failed to delete preview record:", error);
      setErrorMessage(error instanceof Error ? error.message : t("myForms.deleteFailed"));
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  };

  if (!docId) {
    return <Navigate to="/my-forms" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title={t("myForms.deleteTitle")}
        message={t("myForms.deleteMessage", {
          label: record?.subject_name || t("myForms.untitled"),
        })}
        variant="danger"
        onCancel={() => {
          if (!deleting) setDeleteConfirmOpen(false);
        }}
        onConfirm={() => void handleDelete()}
        confirmLabel={t("myForms.confirmDelete")}
        cancelLabel={t("common.cancel")}
        confirmDisabled={deleting}
      />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 md:py-8">
        <section className="ui-hover-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">
                {t("preview.documentLabel")}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900 md:text-xl">
                {record?.subject_name || t("preview.generatedDoc")}
              </h2>
              {location.state && "generated" in (location.state as Record<string, unknown>) && (
                <p className="mt-2 text-sm font-medium text-emerald-600">
                  {t("preview.generatedSuccess")}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {artifactUrls && record?.document_status === "ready" && (
                <>
                  {artifactUrls.docxUrl && (
                    <a
                      href={artifactUrls.docxUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-primary text-center"
                    >
                      {t("preview.downloadDocx")}
                    </a>
                  )}
                  {artifactUrls.pdfUrl && (
                    <a
                      href={artifactUrls.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary text-center"
                    >
                      {t("preview.downloadPdf")}
                    </a>
                  )}
                </>
              )}
              <Link to="/my-forms" className="btn-secondary text-center">
                {t("preview.backToMyForms")}
              </Link>
              {record && (
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={deleting}
                  className="btn-danger text-center"
                >
                  {t("myForms.delete")}
                </button>
              )}
            </div>
          </div>
        </section>

        {loading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            {t("preview.loading")}
          </section>
        ) : errorMessage ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700 shadow-sm">
            {errorMessage}
          </section>
        ) : record?.document_status === "failed" ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-8 shadow-sm">
            <h3 className="text-base font-semibold text-red-800">{t("preview.generationFailed")}</h3>
            <p className="mt-2 text-sm text-red-700">
              {record.document_error || t("preview.generatorNoDoc")}
            </p>
          </section>
        ) : record?.document_status !== "ready" || artifactLoading || !hasStorageArtifact ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-8 shadow-sm">
            <h3 className="text-base font-semibold text-amber-900">{t("preview.processingTitle")}</h3>
            <p className="mt-2 text-sm text-amber-800">{t("preview.processingDesc")}</p>
            {record?.document_status === "ready" && !hasStorageArtifact && (
              <p className="mt-3 text-xs text-amber-700">
                Document status is ready, but pdf_storage_path and docx_storage_path are still empty.
              </p>
            )}
          </section>
        ) : artifactUrls?.previewUrl ? (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <iframe
              title="Generated document preview"
              src={artifactUrls.previewUrl}
              className="h-[800px] w-full"
            />
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <dl className="grid gap-4 text-sm md:grid-cols-2">
              <div>
                <dt className="font-semibold text-slate-700">Evaluation ID</dt>
                <dd className="mt-1 text-slate-900">{record?.id}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-700">User ID</dt>
                <dd className="mt-1 break-all text-slate-900">{record?.user_id || "-"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-700">Order number</dt>
                <dd className="mt-1 text-slate-900">{record?.order_number || "-"}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-700">Created at</dt>
                <dd className="mt-1 text-slate-900">
                  {record?.created_at ? new Date(record.created_at).toLocaleString() : "-"}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="font-semibold text-slate-700">Overall suggestion</dt>
                <dd className="mt-1 whitespace-pre-wrap text-slate-900">
                  {record?.overall_suggestion || "-"}
                </dd>
              </div>
            </dl>
          </section>
        )}
      </main>
    </div>
  );
}
