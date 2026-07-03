import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AdminAuthProvider, useAdminAuth } from "./admin/auth/AdminAuthContext";
import AdminApp from "./admin/AdminApp";
import AdminErrorBoundary from "./admin/components/AdminErrorBoundary";
import "./index.css";

function AdminGate() {
  const { user, loading, authError } = useAdminAuth();

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-400">Loading…</p>;
  }
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-bold text-slate-900">Coterie Admin</h1>
        <p className="max-w-xs text-sm text-slate-500">Sign in with your admin Google account.</p>
        {authError && (
          <p className="max-w-sm rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-600">
            {authError}
          </p>
        )}
        <a
          href="/api/auth/google"
          className="rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition active:scale-95"
        >
          Continue with Google
        </a>
      </div>
    );
  }
  return <AdminApp />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AdminErrorBoundary>
      <AdminAuthProvider>
        <AdminGate />
      </AdminAuthProvider>
    </AdminErrorBoundary>
  </StrictMode>
);
