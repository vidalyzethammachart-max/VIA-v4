import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import MainNavbar from "../components/MainNavbar";
import { useLanguage } from "../i18n/useLanguage";
import { normalizeRole, roleAtLeast, type AppRole } from "../lib/roles";
import { supabase } from "../lib/supabaseClient";
import { useTheme } from "../theme/useTheme";

type UserRow = {
  auth_user_id: string;
  user_id: string | null;
  full_name: string | null;
  employee_number: string | null;
  gender: string | null;
  email: string | null;
  avatar_url: string | null;
  role: AppRole;
};

type DashboardStats = {
  totalUsers: number;
  totalRequests: number;
  pendingRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
};

type DeleteTarget = {
  authUserId: string;
  label: string;
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { t } = useLanguage();
  const isDark = theme === "dark";
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    totalRequests: 0,
    pendingRequests: 0,
    approvedRequests: 0,
    rejectedRequests: 0,
  });
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | AppRole>("all");
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  const [pendingRoleByUser, setPendingRoleByUser] = useState<Record<string, AppRole>>({});
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  useEffect(() => {
    void loadDashboard();
  }, []);

  const loadDashboard = async () => {
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

      setCurrentAdminId(user.id);

      const { data: userInfo, error: userInfoError } = await supabase
        .from("user_information")
        .select("role")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      const currentRole = normalizeRole(userInfo?.role);
      if (userInfoError || !roleAtLeast(currentRole, "admin")) {
        navigate("/form-submit", { replace: true });
        return;
      }

      const [
        usersCount,
        requestsCount,
        pendingCount,
        approvedCount,
        rejectedCount,
        usersList,
      ] = await Promise.all([
        supabase.from("user_information").select("*", { count: "exact", head: true }),
        supabase.from("role_requests").select("*", { count: "exact", head: true }),
        supabase.from("role_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("role_requests").select("*", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("role_requests").select("*", { count: "exact", head: true }).eq("status", "rejected"),
        supabase
          .from("user_information")
          .select("auth_user_id,user_id,full_name,employee_number,gender,email,avatar_url,role")
          .order("email", { ascending: true }),
      ]);

      if (
        usersCount.error ||
        requestsCount.error ||
        pendingCount.error ||
        approvedCount.error ||
        rejectedCount.error ||
        usersList.error
      ) {
        throw new Error(t("admin.loadFailed"));
      }

      setStats({
        totalUsers: usersCount.count ?? 0,
        totalRequests: requestsCount.count ?? 0,
        pendingRequests: pendingCount.count ?? 0,
        approvedRequests: approvedCount.count ?? 0,
        rejectedRequests: rejectedCount.count ?? 0,
      });

      const nextUsers = (usersList.data ?? []).map((row) => ({
        auth_user_id: row.auth_user_id,
        user_id: row.user_id,
        full_name: row.full_name,
        employee_number: row.employee_number,
        gender: row.gender,
        email: row.email,
        avatar_url: row.avatar_url,
        role: normalizeRole(row.role),
      }));

      setUsers(nextUsers);
      setPendingRoleByUser(
        Object.fromEntries(nextUsers.map((row) => [row.auth_user_id, row.role])),
      );
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : t("admin.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((row) => {
    const matchesRole = roleFilter === "all" || row.role === roleFilter;
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return matchesRole;
    }

    const haystack = [
      row.full_name,
      row.user_id,
      row.employee_number,
      row.gender,
      row.email,
      row.role,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return matchesRole && haystack.includes(query);
  });

  const hasPendingRoleChange = (row: UserRow) =>
    (pendingRoleByUser[row.auth_user_id] ?? row.role) !== row.role;

  const updateUserRole = async (targetAuthUserId: string) => {
    const role = pendingRoleByUser[targetAuthUserId];
    if (!role) return;

    setBusyUserId(targetAuthUserId);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("admin-user-management", {
        body: {
          action: "update_role",
          targetAuthUserId,
          role,
        },
      });

      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.error || t("admin.roleUpdateFailed"));

      setUsers((current) =>
        current.map((row) =>
          row.auth_user_id === targetAuthUserId ? { ...row, role } : row,
        ),
      );
      setSuccess(t("admin.roleUpdated"));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t("admin.roleUpdateFailed"));
    } finally {
      setBusyUserId(null);
    }
  };

  const deleteUserAccount = async (targetAuthUserId: string) => {
    setBusyUserId(targetAuthUserId);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke("admin-user-management", {
        body: {
          action: "delete_user",
          targetAuthUserId,
        },
      });

      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.error || t("admin.deleteFailed"));

      setUsers((current) => current.filter((row) => row.auth_user_id !== targetAuthUserId));
      setPendingRoleByUser((current) => {
        const next = { ...current };
        delete next[targetAuthUserId];
        return next;
      });
      setDeleteTarget(null);
      setSuccess(t("admin.deleteSuccess"));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t("admin.deleteFailed"));
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <MainNavbar />
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-slate-900">{t("admin.title")}</h1>
          <div className="flex gap-2">
            <Link to="/role-requests" className="btn-primary">
              {t("admin.manageRoleRequests")}
            </Link>
            <button
              onClick={() => navigate(-1)}
              className={`btn-base ${
                isDark
                  ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {t("common.back")}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label={t("admin.totalUsers")} value={stats.totalUsers} />
          <StatCard label={t("admin.totalRequests")} value={stats.totalRequests} />
          <StatCard label={t("admin.pending")} value={stats.pendingRequests} />
          <StatCard label={t("admin.approved")} value={stats.approvedRequests} />
          <StatCard label={t("admin.rejected")} value={stats.rejectedRequests} />
        </div>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t("admin.searchPlaceholder")}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#04418b]/30 focus:ring-4 focus:ring-[#04418b]/5 sm:w-72"
                />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as "all" | AppRole)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#04418b]/30 focus:ring-4 focus:ring-[#04418b]/5"
                >
                  <option value="all">{t("admin.allRoles")}</option>
                  <option value="user">User</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
          </div>
          {loading ? (
            <div className="px-4 py-8 text-sm text-slate-500">{t("admin.loadingUsers")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3">{t("admin.user")}</th>
                    <th className="px-4 py-3">{t("profile.userId")}</th>
                    <th className="px-4 py-3">{t("admin.employeeNo")}</th>
                    <th className="px-4 py-3">{t("admin.gender")}</th>
                    <th className="px-4 py-3">{t("admin.email")}</th>
                    <th className="px-4 py-3">{t("admin.role")}</th>
                    <th className="px-4 py-3">{t("admin.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((row) => (
                    <tr key={row.auth_user_id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 aspect-square shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                            {row.avatar_url ? (
                              <img
                                src={row.avatar_url}
                                alt={row.full_name ?? row.email ?? "User"}
                                className="block h-full w-full rounded-full object-cover object-center"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-slate-500">
                                {(row.full_name ?? row.email ?? "U").slice(0, 1).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-800">{row.full_name ?? "-"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-800">{row.user_id ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-800">{row.employee_number ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-800">{formatGender(row.gender, t)}</td>
                      <td className="px-4 py-3 text-slate-800">{row.email ?? "-"}</td>
                      <td className="px-4 py-3">
                        <select
                          value={pendingRoleByUser[row.auth_user_id] ?? row.role}
                          onChange={(e) =>
                            setPendingRoleByUser((current) => ({
                              ...current,
                              [row.auth_user_id]: e.target.value as AppRole,
                            }))
                          }
                          disabled={row.auth_user_id === currentAdminId || busyUserId === row.auth_user_id}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#04418b]/30 focus:ring-4 focus:ring-[#04418b]/5 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                        >
                          <option value="user">user</option>
                          <option value="editor">editor</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => void updateUserRole(row.auth_user_id)}
                            disabled={
                              row.auth_user_id === currentAdminId ||
                              busyUserId === row.auth_user_id ||
                              !hasPendingRoleChange(row)
                            }
                            className={`px-3 py-2 text-xs font-medium ${
                              hasPendingRoleChange(row) ? "btn-primary" : "btn-ghost-primary"
                            }`}
                          >
                            {t("admin.saveRole")}
                          </button>
                          <button
                            onClick={() =>
                              setDeleteTarget({
                                authUserId: row.auth_user_id,
                                label: row.full_name ?? row.email ?? row.user_id ?? row.auth_user_id,
                              })
                            }
                            disabled={row.auth_user_id === currentAdminId || busyUserId === row.auth_user_id}
                            className="btn-danger rounded-xl px-3 py-2 text-xs"
                          >
                            {t("admin.delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-slate-500" colSpan={7}>
                        {t("admin.noUsersFound")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm dark:bg-slate-950/70">
          <div className="relative w-full max-w-md rounded-[28px] border border-slate-200 bg-white px-8 pb-8 pt-6 shadow-[0_24px_80px_rgba(15,23,42,0.18)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_24px_80px_rgba(2,6,23,0.55)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-500 dark:bg-red-950/40 dark:text-red-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5.25 6.75h13.5m-11.25 0 .62 10.18A2.25 2.25 0 0010.36 19.5h3.28a2.25 2.25 0 002.24-2.57l.62-10.18m-7.5 0V5.63c0-.62.5-1.13 1.13-1.13h2.74c.62 0 1.13.5 1.13 1.13v1.12m-3.75 3.38v5.25m3-5.25v5.25" />
              </svg>
            </div>

            <div className="mt-6 text-center">
              <h2 className="text-[32px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {t("admin.deleteTitle")}
              </h2>
              <p className="mt-3 text-base leading-7 text-slate-500 dark:text-slate-400">
                {t("admin.deleteMessage", { label: deleteTarget.label })}
              </p>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-4">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={busyUserId === deleteTarget.authUserId}
                className="btn-secondary rounded-2xl px-4 py-3.5 text-base font-medium"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => void deleteUserAccount(deleteTarget.authUserId)}
                disabled={busyUserId === deleteTarget.authUserId}
                className="btn-danger rounded-2xl px-4 py-3.5 text-base"
              >
                {busyUserId === deleteTarget.authUserId ? t("admin.deleting") : t("admin.confirmDelete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatGender(gender: string | null, t: (key: string) => string) {
  switch (gender) {
    case "male":
      return t("profile.male");
    case "female":
      return t("profile.female");
    case "other":
      return t("profile.other");
    case "prefer_not_to_say":
      return t("profile.preferNotToSay");
    default:
      return "-";
  }
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
