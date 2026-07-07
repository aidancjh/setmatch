import { StrictMode, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { AdminAuthProvider, useAdminAuth } from "./admin/auth/AdminAuthContext";
import AdminApp from "./admin/AdminApp";
import AdminErrorBoundary from "./admin/components/AdminErrorBoundary";
import "./index.css";

function AdminLoginForm() {
  const { login } = useAdminAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-bold text-slate-900">Coterie Admin</h1>
      <p className="max-w-xs text-sm text-slate-500">Enter the admin password to continue.</p>
      <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-3">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
          aria-label="Admin password"
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-sm outline-none focus:border-brand"
        />
        {error && (
          <p className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</p>
        )}
        <button
          type="submit"
          disabled={!password || submitting}
          className="w-full rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

function AdminGate() {
  const { user, loading } = useAdminAuth();

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-400">Loading…</p>;
  }
  if (!user) {
    return <AdminLoginForm />;
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
