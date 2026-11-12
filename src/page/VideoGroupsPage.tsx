import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import MainNavbar from "../components/MainNavbar";
import { useAuthRole } from "../hooks/useAuthRole";
import { useLanguage } from "../i18n/useLanguage";
import { normalizeRole, roleAtLeast } from "../lib/roles";
import { buildVideoGroupDisplayName } from "../services/videoGroupCore.js";
import {
  getVideoGroups,
  isLeaderOfAnyVideoCase,
  type VideoGroupRow,
} from "../services/videoGroupService";

export default function VideoGroupsPage() {
  const { t } = useLanguage();
  const { role, user } = useAuthRole();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [groups, setGroups] = useState<VideoGroupRow[]>([]);
  const [isLeader, setIsLeader] = useState(false);

  const isAdmin = roleAtLeast(normalizeRole(role), "admin");
  // UX only: the RPC and RLS decide who may actually create a group.
  const canCreate = isAdmin || isLeader;
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
          setErrorMessage(error instanceof Error ? error.message : t("videoGroups.listLoadFailed"));
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

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />
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
            {groups.map((group) => (
              <li key={group.id}>
                <Link
                  to={`/video-groups/${group.id}`}
                  className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-[#04418b]/40 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {buildVideoGroupDisplayName(group.group_type, group.subject_name)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {t("videoGroups.orderNumber")}: {group.order_number}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                      {t("videoGroups.sourceCount", { count: group.source_count })}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                      {t(`videoGroups.docStatus.${group.document_status}`)}
                    </span>
                    <span className="font-semibold text-[#04418b]">{t("videoGroups.open")}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
