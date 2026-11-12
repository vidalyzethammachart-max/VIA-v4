import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import ConfirmModal from "../components/ConfirmModal";
import MainNavbar from "../components/MainNavbar";
import { useAuthRole } from "../hooks/useAuthRole";
import { useLanguage } from "../i18n/useLanguage";
import { normalizeRole, roleAtLeast } from "../lib/roles";
import { buildDocumentDownloadUrl } from "../services/documentDownload.js";
import { buildVideoGroupDisplayName } from "../services/videoGroupCore.js";
import { deleteVideoGroup, getVideoGroup, getVideoGroupDocumentUrls, type VideoGroupRow } from "../services/videoGroupService";

type ArtifactUrls = { pdfUrl: string | null; docxUrl: string | null };

const POLL_INTERVAL_MS = 5000;
const SIGNED_URL_REFRESH_MS = 50 * 60 * 1000;
const SIGNED_URL_RETRY_MS = 30 * 1000;

export default function VideoGroupDocumentPreviewPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { role, user } = useAuthRole();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<VideoGroupRow | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [artifactUrls, setArtifactUrls] = useState<ArtifactUrls | null>(null);
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [artifactError, setArtifactError] = useState<string | null>(null);

  const documentStatus = group?.document_status;
  const hasArtifact = Boolean(group?.pdf_storage_path || group?.docx_storage_path);

  useEffect(() => {
    setLoading(true);
    setGroup(null);
    setQueryError(null);
    setArtifactUrls(null);
    setArtifactError(null);
    if (!groupId) {
      setLoading(false);
      return;
    }

    let active = true;
    void (async () => {
      try {
        const row = await getVideoGroup(groupId);
        if (active) setGroup(row);
      } catch (error) {
        if (active) setQueryError(error instanceof Error ? error.message : t("videoGroups.detailLoadFailed"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Poll while the document is being generated.
  useEffect(() => {
    if (!groupId || documentStatus !== "pending") return;

    let active = true;
    let timeoutId: number | undefined;
    const poll = async () => {
      let shouldContinue = true;
      try {
        const row = await getVideoGroup(groupId);
        if (!active) return;
        setGroup(row);
        setQueryError(null);
        shouldContinue = row?.document_status === "pending";
      } catch (error) {
        if (!active) return;
        setQueryError(error instanceof Error ? error.message : t("videoGroups.detailLoadFailed"));
      } finally {
        if (active && shouldContinue) timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    };
    timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, documentStatus]);

  // Signed URLs expire, so refresh them periodically while the page is open.
  useEffect(() => {
    if (!groupId || documentStatus !== "ready" || !hasArtifact) {
      setArtifactUrls(null);
      setArtifactLoading(false);
      setArtifactError(null);
      return;
    }

    let active = true;
    let refreshTimeoutId: number | undefined;
    const loadUrls = async (showLoading: boolean) => {
      let nextDelay = SIGNED_URL_REFRESH_MS;
      if (showLoading) setArtifactLoading(true);
      try {
        const urls = await getVideoGroupDocumentUrls(groupId);
        if (!urls.pdfUrl && !urls.docxUrl) throw new Error(t("videoGroups.docLoadFailed"));
        if (active) {
          setArtifactUrls(urls);
          setArtifactError(null);
        }
      } catch (error) {
        nextDelay = SIGNED_URL_RETRY_MS;
        if (!active) return;
        if (showLoading) setArtifactUrls(null);
        setArtifactError(error instanceof Error ? error.message : t("videoGroups.docLoadFailed"));
      } finally {
        if (active) {
          if (showLoading) setArtifactLoading(false);
          refreshTimeoutId = window.setTimeout(() => void loadUrls(false), nextDelay);
        }
      }
    };

    void loadUrls(true);
    return () => {
      active = false;
      if (refreshTimeoutId !== undefined) window.clearTimeout(refreshTimeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, documentStatus, hasArtifact]);

  async function handleDelete() {
    if (!groupId || deleting) return;
    try {
      setDeleting(true);
      await deleteVideoGroup(groupId);
      navigate("/video-groups");
    } catch (error) {
      setConfirmDelete(false);
      setQueryError(error instanceof Error ? error.message : t("videoGroups.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  if (!groupId) {
    return <Navigate to="/video-groups" replace />;
  }

  // UX only: the DELETE policy still authorizes the creator or an admin and blocks pending groups.
  const canDelete = Boolean(
    group && user && (group.requested_by === user.id || roleAtLeast(normalizeRole(role), "admin")) && documentStatus !== "pending",
  );

  const displayName = group ? buildVideoGroupDisplayName(group.group_type, group.subject_name) : null;
  const stateError =
    documentStatus === "failed"
      ? `${t("videoGroups.docFailed")}${group?.document_error ? `: ${group.document_error}` : ""}`
      : documentStatus === "ready" && !hasArtifact
        ? t("videoGroups.previewNoArtifact")
        : null;
  const displayError = queryError || stateError || (artifactUrls ? null : artifactError);

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />
      <ConfirmModal
        isOpen={confirmDelete}
        title={t("videoGroups.deleteTitle")}
        message={t("videoGroups.deleteMessage", { name: displayName ?? "" })}
        confirmLabel={deleting ? t("videoGroups.deleting") : t("videoGroups.deleteConfirm")}
        cancelLabel={t("videoGroups.deleteCancel")}
        confirmDisabled={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 md:py-8">
        <section className="ui-hover-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#04418b]">
                {t("videoGroups.previewEyebrow")}
              </p>
              <h1 className="mt-1 text-xl font-semibold text-slate-900">
                {displayName || t("videoGroups.previewTitle")}
              </h1>
              {group && (
                <p className="mt-2 text-xs text-slate-500">
                  {t("videoGroups.orderNumber")}: {group.order_number} ·{" "}
                  {t("videoGroups.sourceCount", { count: group.source_count })}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {artifactUrls?.docxUrl && (
                <a
                  href={buildDocumentDownloadUrl(artifactUrls.docxUrl, displayName, "docx", `group-${groupId}`)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary text-center"
                >
                  {t("videoGroups.downloadDocx")}
                </a>
              )}
              {artifactUrls?.pdfUrl && (
                <a
                  href={buildDocumentDownloadUrl(artifactUrls.pdfUrl, displayName, "pdf", `group-${groupId}`)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary text-center"
                >
                  {t("videoGroups.downloadPdf")}
                </a>
              )}
              <Link to={`/video-groups/${groupId}`} className="btn-secondary text-center">
                {t("videoGroups.previewBackToDetail")}
              </Link>
              <Link to="/video-groups" className="btn-secondary text-center">
                {t("videoGroups.backToList")}
              </Link>
              {canDelete && (
                <button type="button" className="btn-danger text-center" onClick={() => setConfirmDelete(true)}>
                  {t("videoGroups.delete")}
                </button>
              )}
            </div>
          </div>
        </section>

        {artifactError && artifactUrls && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
            {t("videoGroups.previewRefreshFailed")}
          </section>
        )}

        {loading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            {t("videoGroups.previewLoading")}
          </section>
        ) : !group && !queryError ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700 shadow-sm">
            {t("videoGroups.notFound")}
          </section>
        ) : displayError ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700 shadow-sm" role="alert">
            {displayError}
          </section>
        ) : documentStatus === "draft" ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-slate-600">{t("videoGroups.docDraft")}</p>
            <Link to={`/video-groups/${groupId}`} className="btn-primary mt-4 inline-flex">
              {t("videoGroups.previewReviewAndSend")}
            </Link>
          </section>
        ) : documentStatus === "pending" ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-8 shadow-sm">
            <h2 className="text-base font-semibold text-amber-900">{t("videoGroups.previewPendingTitle")}</h2>
            <p className="mt-2 text-sm text-amber-800">{t("videoGroups.previewPendingHint")}</p>
          </section>
        ) : artifactLoading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            {t("videoGroups.previewPreparing")}
          </section>
        ) : artifactUrls?.pdfUrl ? (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <p className="border-b border-slate-200 px-4 py-3 text-sm text-slate-500">
              {t("videoGroups.previewPdfHint")}
            </p>
            <iframe title={t("videoGroups.previewTitle")} src={artifactUrls.pdfUrl} className="h-[800px] w-full" />
          </section>
        ) : artifactUrls?.docxUrl ? (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm">
            <h2 className="text-base font-semibold text-emerald-900">{t("videoGroups.previewDocxOnlyTitle")}</h2>
            <p className="mt-2 text-sm text-emerald-800">{t("videoGroups.previewDocxOnlyHint")}</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
