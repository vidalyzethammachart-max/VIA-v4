import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./index.css";
import { AuthRoleProvider } from "./hooks/useAuthRole";
import { ThemeProvider } from "./theme/ThemeProvider";
import { LanguageProvider } from "./i18n/LanguageProvider";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { installGlobalErrorHandlers } from "./services/errorReporter";

installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <AuthRoleProvider>
            <AppErrorBoundary>
              <App />
            </AppErrorBoundary>
          </AuthRoleProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
