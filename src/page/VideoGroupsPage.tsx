import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import ConfirmModal from "../components/ConfirmModal";
import ErrorNoticeModal from "../components/ErrorNoticeModal";
import MainNavbar from "../components/MainNavbar";
import { useAuthRole } from "../hooks/useAuthRole";
import { useLanguage } from "../i18n/useLanguage";
import { normalizeRole, roleAtLeast } from "../lib/roles";
import { reportError } from "../services/errorReporter";
import { buildVideoGroupDisplayName } from "../services/videoGroupCore.js";
import {
  deleteVideoGroup,
  getVideoGroups,
  isLeaderOfAnyVideoCase,
  type VideoGroupRow,
} from "../services/videoGroupService";

const STATUS_STYLES: Record<VideoGroupRow["document_status"], string> = {
  draft: "bg-slate-100 text-slate-700",
  pending: "bg-amber-100 text-amber-800",
  ready: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-700",
};

export default function VideoGroupsPage() {
  const { t } = useLanguage();
  const { role, user } = useAuthRole();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [groups, setGroups] = useState<VideoGroupRow[]>([]);
  const [isLeader, setIsLeader] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<VideoGroupRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loadErrorPopup, setLoadErrorPopup] = useState<string | null>(null);

  const isAdmin = roleAtLeast(normalizeRole(role), "admin");
  // UX only: the RPC and RLS decide who may actually create a group.
  const isEditor = roleAtLeast(normalizeRole(role), "editor");
  const canCreate = isEditor || isLeader;
  const userId = user?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);
        const rows = await getVideoGroups();
        if (!cancelled) setGroups(rows);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : t("videoGroups.listLoadFailed");
          reportError(error, { source: "popup", context: { action: "load_groups" } });
          setErrorMessage(message);
          setLoadErrorPopup(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId || isAdmin) return;
    let cancelled = false;
    isLeaderOfAnyVideoCase(userId)
      .then((value) => {
        if (!cancelled) setIsLeader(value);
      })
      .catch(() => {
        if (!cancelled) setIsLeader(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, isAdmin]);

  async function handleDelete() {
    if (!groupToDelete || deleting) return;
    try {
      setDeleting(true);
      setErrorMessage(null);
      await deleteVideoGroup(groupToDelete.id);
      setGroups((current) => current.filter((group) => group.id !== groupToDelete.id));
      setGroupToDelete(null);
    } catch (error) {
      setGroupToDelete(null);
      reportError(error, { source: "popup", context: { action: "delete_group", groupId: groupToDelete.id } });
      setDeleteError(error instanceof Error ? error.message : t("videoGroups.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />
      <ErrorNoticeModal isOpen={loadErrorPopup !== null} detail={loadErrorPopup} onClose={() => setLoadErrorPopup(null)} />
      <ErrorNoticeModal isOpen={deleteError !== null} detail={deleteError} onClose={() => setDeleteError(null)} />
      <ConfirmModal
        isOpen={Boolean(groupToDelete)}
        title={t("videoGroups.deleteTitle")}
        message={
          groupToDelete
            ? t("videoGroups.deleteMessage", {
                name: buildVideoGroupDisplayName(groupToDelete.group_type, groupToDelete.subject_name),
              })
            : ""
        }
        confirmLabel={deleting ? t("videoGroups.deleting") : t("videoGroups.deleteConfirm")}
        cancelLabel={t("videoGroups.deleteCancel")}
        confirmDisabled={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setGroupToDelete(null)}
      />
      <main className="mx-auto max-w-5xl px-4 py-6 md:py-8">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("videoGroups.listTitle")}</h1>
            <p className="mt-1 text-sm text-slate-500">{t("videoGroups.listSubtitle")}</p>
          </div>
          {canCreate && (
            <Link to="/video-groups/new" className="btn-primary">
              {t("videoGroups.create")}
            </Link>
          )}
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            {t("videoGroups.listLoading")}
          </section>
        ) : groups.length === 0 && !errorMessage ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            {t("videoGroups.listEmpty")}
          </section>
        ) : (
          <ul className="space-y-3">
            {groups.map((group) => {
              const name = buildVideoGroupDisplayName(group.group_type, group.subject_name);
              const canDelete = (isAdmin || group.requested_by === userId) && group.document_status !== "pending";
              return (
                <li
                  key={group.id}
                  className="flex items-stretch overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-[#04418b]/40"
                >
                  <Link to={`/video-groups/${group.id}/preview`} className="flex min-w-0 flex-1 flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="break-words text-base font-semibold text-slate-900">{name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {t("videoGroups.orderNumber")}: {group.order_number} ·{" "}
                        {t("videoGroups.sourceCount", { count: group.source_count })}
                      </p>
                    </div>
                    <span
                      className={`w-fit shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[group.document_status]}`}
                    >
                      {t(`videoGroups.docStatus.${group.document_status}`)}
                    </span>
                  </Link>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => setGroupToDelete(group)}
                      className="border-l border-slate-200 px-4 text-sm font-semibold text-red-600 hover:bg-red-50"
                      aria-label={`${t("videoGroups.delete")} ${name}`}
                    >
                      {t("videoGroups.delete")}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
