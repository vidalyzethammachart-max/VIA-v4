import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import ConfirmModal from "../components/ConfirmModal";
import MainNavbar from "../components/MainNavbar";
import { useLanguage } from "../i18n/useLanguage";
import { normalizeRole, roleAtLeast, type AppRole } from "../lib/roles";
import { supabase } from "../lib/supabaseClient";
import {
  roleRequestService,
  type RoleRequestRow,
  type RoleRequestStatus,
} from "../services/roleRequestService";

type UserInfoMap = Record<string, { email: string | null; role: AppRole }>;

export default function RoleRequestsPage() {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentRole, setCurrentRole] = useState<AppRole>("user");
  const [requests, setRequests] = useState<RoleRequestRow[]>([]);
  const [userInfoMap, setUserInfoMap] = useState<UserInfoMap>({});
  const [error, setError] = useState<string | null>(null);
  const [cancelRequestId, setCancelRequestId] = useState<string | null>(null);

  useEffect(() => {
    void loadPage();
  }, []);

  const pendingRequest = useMemo(
    () => requests.find((request) => request.status === "pending"),
    [requests],
  );

  const loadPage = async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/", { replace: true });
        return;
      }

      const { data: me } = await supabase
        .from("user_information")
        .select("role")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      const role = normalizeRole(me?.role);
      const admin = roleAtLeast(role, "admin");
      setIsAdmin(admin);
      setCurrentRole(role);

      const fetchedRequests = admin
        ? await roleRequestService.adminGetAllRequests()
        : await roleRequestService.getMyRequests();
      setRequests(fetchedRequests);

      if (admin) {
        const { data: users } = await supabase
          .from("user_information")
          .select("auth_user_id,email,role");

        const map: UserInfoMap = {};
        for (const row of users ?? []) {
          map[row.auth_user_id] = {
            email: row.email,
            role: normalizeRole(row.role),
          };
        }
        setUserInfoMap(map);
      }
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : t("role.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestEditorRole = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await roleRequestService.requestRole("editor");
      await loadPage();
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : t("role.requestFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (requestId: string, status: RoleRequestStatus) => {
    setSubmitting(true);
    setError(null);
    try {
      if (status === "approved") {
        await roleRequestService.approveRequest(requestId);
      } else {
        await roleRequestService.rejectRequest(requestId);
      }
      await loadPage();
    } catch (reviewError: unknown) {
      setError(reviewError instanceof Error ? reviewError.message : t("role.reviewFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!cancelRequestId) return;

    setSubmitting(true);
    setError(null);
    try {
      await roleRequestService.cancelRequest(cancelRequestId);
      setCancelRequestId(null);
      await loadPage();
    } catch (cancelError: unknown) {
      setError(cancelError instanceof Error ? cancelError.message : t("role.cancelFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <ConfirmModal
        isOpen={Boolean(cancelRequestId)}
        title={t("role.cancelTitle")}
        message={t("role.cancelMessage")}
        onCancel={() => {
          if (!submitting) setCancelRequestId(null);
        }}
        onConfirm={() => void handleCancelRequest()}
        confirmLabel={t("role.confirmCancel")}
        cancelLabel={t("role.keepRequest")}
        confirmDisabled={submitting}
      />

      <MainNavbar />
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-slate-900">{t("role.title")}</h1>
          <div className="flex gap-2">
            {isAdmin && (
              <Link to="/admin-dashboard" className="btn-primary">
                {t("role.adminDashboard")}
              </Link>
            )}
          </div>
        </div>

        {!isAdmin && (
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-800">{t("role.requestUpgrade")}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {t("role.currentRole", { role: currentRole })}
            </p>
            <button
              onClick={handleRequestEditorRole}
              disabled={submitting || roleAtLeast(currentRole, "editor") || Boolean(pendingRequest)}
              className="btn-primary mt-4 disabled:bg-slate-400 dark:disabled:bg-slate-700"
            >
              {pendingRequest
                ? t("role.requestPending")
                : roleAtLeast(currentRole, "editor")
                  ? t("role.alreadyEditor")
                  : t("role.requestEditor")}
            </button>
          </section>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">
              {isAdmin ? t("role.allRequests") : t("role.myRequests")}
            </h2>
          </div>
          {loading ? (
            <div className="px-4 py-8 text-sm text-slate-500">{t("role.loading")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-left text-slate-600">
                  <tr>
                    {isAdmin && <th className="px-4 py-3">{t("role.user")}</th>}
                    <th className="px-4 py-3">{t("role.requestedRole")}</th>
                    <th className="px-4 py-3">{t("role.status")}</th>
                    <th className="px-4 py-3">{t("role.createdAt")}</th>
                    <th className="px-4 py-3">{t("role.action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request.id} className="border-t border-slate-100">
                      {isAdmin && (
                        <td className="px-4 py-3 text-slate-800">
                          {userInfoMap[request.user_id]?.email ?? request.user_id}
                        </td>
                      )}
                      <td className="px-4 py-3 text-slate-800">{request.requested_role}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={request.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(request.created_at).toLocaleString(language === "th" ? "th-TH" : "en-US")}
                      </td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          request.status === "pending" ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => void handleReview(request.id, "approved")}
                                disabled={submitting}
                                className="btn-primary rounded-lg px-3 py-1 text-xs"
                              >
                                {t("role.approve")}
                              </button>
                              <button
                                onClick={() => void handleReview(request.id, "rejected")}
                                disabled={submitting}
                                className="btn-danger rounded-lg px-3 py-1 text-xs"
                              >
                                {t("role.reject")}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">{t("role.reviewed")}</span>
                          )
                        ) : request.status === "pending" ? (
                          <button
                            onClick={() => setCancelRequestId(request.id)}
                            disabled={submitting}
                            className="btn-danger rounded-lg px-3 py-1 text-xs"
                          >
                            {t("role.cancel")}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {requests.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-slate-500" colSpan={isAdmin ? 5 : 4}>
                        {t("role.noRequests")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: RoleRequestStatus }) {
  const classes =
    status === "approved"
      ? "bg-green-100 text-green-700"
      : status === "rejected"
        ? "bg-red-100 text-red-700"
        : status === "cancelled"
          ? "bg-slate-100 text-slate-700"
          : "bg-yellow-100 text-yellow-700";
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${classes}`}>{status}</span>;
}
