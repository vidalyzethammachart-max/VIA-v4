import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./page/Login";
import Home from "./page/Home";
import FormSubmit from "./page/FormSubmit";
import Register from "./page/Register";
import Profile from "./page/Profile";
import Dashboard from "./page/Dashboard";
import AdminDashboard from "./page/AdminDashboard";
import RoleRequestsPage from "./page/RoleRequestsPage";
import ForgotPassword from "./page/ForgotPassword";
import ResetPassword from "./page/ResetPassword";
import MyFormsDashboard from "./page/MyFormsDashboard";
import PreviewPage from "./page/PreviewPage";
import SessionMonitor from "./components/SessionMonitor";
import Footer from "./components/Footer";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuthRole } from "./hooks/useAuthRole";
import type { AppRole } from "./lib/roles";
import { useLanguage } from "./i18n/useLanguage";

function getDefaultRouteForRole(role: AppRole | null): string {
  if (!role) return "/";
  return "/home";
}

export default function App() {
  const { loading, session, role } = useAuthRole();
  const { t } = useLanguage();

  if (loading) return <p>{t("common.loading")}</p>;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
      {session && <SessionMonitor />}

      <div className="flex-grow">
        <Routes>
          <Route
            path="/"
            element={
              !session ? (
                <Login />
              ) : (
                <Navigate to={getDefaultRouteForRole(role)} replace />
              )
            }
          />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />

          <Route
            path="/form-submit"
            element={
              <ProtectedRoute requiredRole="editor">
                <FormSubmit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-forms"
            element={
              <ProtectedRoute>
                <MyFormsDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/preview/:docId"
            element={
              <ProtectedRoute>
                <PreviewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin-dashboard"
            element={<Navigate to="/admin" replace />}
          />
          <Route
            path="/role-requests"
            element={
              <ProtectedRoute>
                <RoleRequestsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>

      <Footer />
    </div>
  );
}
