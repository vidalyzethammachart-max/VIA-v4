import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { AppRole } from "../lib/roles";
import { roleAtLeast } from "../lib/roles";
import { useAuthRole } from "../hooks/useAuthRole";
import { useLanguage } from "../i18n/useLanguage";

type ProtectedRouteProps = {
  children: ReactNode;
  requiredRole?: AppRole;
};

function getHomeRouteForRole(role: AppRole): string {
  if (roleAtLeast(role, "admin")) return "/admin";
  if (roleAtLeast(role, "editor")) return "/form-submit";
  return "/dashboard";
}

export default function ProtectedRoute({
  children,
  requiredRole = "user",
}: ProtectedRouteProps) {
  const location = useLocation();
  const { loading, session, role } = useAuthRole();
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        {t("common.loading")}
      </div>
    );
  }

  if (!session || !role) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  if (!roleAtLeast(role, requiredRole)) {
    return <Navigate to={getHomeRouteForRole(role)} replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
