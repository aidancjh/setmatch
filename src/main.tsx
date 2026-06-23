import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as Sentry from "@sentry/react";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { registerSW } from "virtual:pwa-register";
import "./index.css";

// PWA auto-update: the service worker uses skipWaiting + clientsClaim, so a new
// deploy's worker takes control immediately. If this page was already controlled
// by a worker (i.e. a real update, not a first visit), reload once so the user
// sees the fresh build instead of a stale cached one.
if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

// Register the worker and aggressively check for new deploys: immediately on
// load (so a plain refresh picks up the latest build), whenever the app regains
// focus, and on an interval while it stays open. A found update activates right
// away and the controllerchange handler above reloads — no need to close and
// reopen the app.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const check = () => registration.update().catch(() => {});
    setInterval(check, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
  },
});

// DSN comes from VITE_SENTRY_DSN (a browser Sentry DSN is public by design —
// it can only submit events). When unset, Sentry stays disabled.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.2,
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);
