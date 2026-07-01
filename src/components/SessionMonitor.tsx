import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useLanguage } from "../i18n/useLanguage";

const SESSION_TIMEOUT = 24 * 60 * 60 * 1000;
const WARNING_TIME = 5 * 60 * 1000;

export default function SessionMonitor() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    let timeoutId: number;
    let warningId: number;

    const handleLogout = async () => {
      await supabase.auth.signOut();
      setShowWarning(false);
      navigate("/", { replace: true });
    };

    const startSessionTimer = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      const warningTime = SESSION_TIMEOUT - WARNING_TIME;
      if (warningTime > 0) {
        warningId = window.setTimeout(() => {
          setShowWarning(true);
        }, warningTime);
      }

      timeoutId = window.setTimeout(() => {
        void handleLogout();
      }, SESSION_TIMEOUT);
    };

    void startSessionTimer();

    const checkInterval = window.setInterval(() => {
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session) {
          navigate("/", { replace: true });
        }
      });
    }, 60 * 1000);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (warningId) window.clearTimeout(warningId);
      if (checkInterval) window.clearInterval(checkInterval);
    };
  }, [navigate]);

  if (!showWarning) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        zIndex: 9999,
        background: "#fff3cd",
        border: "1px solid #ffc107",
        borderRadius: 8,
        padding: "16px 20px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        maxWidth: 360,
      }}
    >
      <div style={{ display: "flex", alignItems: "start", gap: 12 }}>
        <span style={{ fontSize: 24 }}>⚠️</span>
        <div>
          <h4 style={{ margin: 0, marginBottom: 8, color: "#856404" }}>{t("session.expiringTitle")}</h4>
          <p style={{ margin: 0, fontSize: 14, color: "#856404" }}>{t("session.expiringDesc")}</p>
        </div>
      </div>
    </div>
  );
}
