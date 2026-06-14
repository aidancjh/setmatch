import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, setToken } from "../lib/api";
import type { User } from "../types";
import { VolleyballIcon } from "../components/icons";

type Mode = "signup" | "login" | "forgot" | "reset";

export default function Auth() {
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const urlToken = params.get("token");
  const urlReset = params.get("reset");
  const urlGoogleError = params.get("error");
  const from = (location.state as { from?: string } | null)?.from || "/";

  const [mode, setMode] = useState<Mode>(() => (urlReset ? "reset" : "login"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [error, setError] = useState(
    urlGoogleError === "google_cancelled"
      ? "Google sign-in was cancelled."
      : urlGoogleError === "google_failed"
      ? "Google sign-in failed. Please try again."
      : ""
  );
  const [busy, setBusy] = useState(false);

  // Google OAuth: token returned in URL → store and go home
  useEffect(() => {
    if (urlToken) {
      setToken(urlToken);
      window.location.replace("/");
    }
  }, [urlToken]);

  if (urlToken) return null; // redirecting
  if (user) return <Navigate to={from} replace />;

  // ── Submit handlers ────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signup") {
        await signup(email.trim(), password, name.trim());
        navigate("/welcome", { replace: true });
      } else {
        await login(email.trim(), password);
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError("Enter your email address."); return; }
    setBusy(true);
    setError("");
    try {
      await api.post("/auth/forgot-password", { email: email.trim() });
      setForgotSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    setBusy(true);
    setError("");
    try {
      const r = await api.post<{ token: string; user: User }>("/auth/reset-password", {
        token: urlReset,
        password: newPassword,
      });
      setToken(r.token);
      window.location.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  // ── Reset password form ────────────────────────────────────────────────────

  if (mode === "reset") {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center bg-white px-6 py-12">
        <div className="mb-8 flex flex-col items-center text-center">
          <VolleyballIcon className="h-12 w-12 text-brand" />
          <span className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">Coterie</span>
        </div>
        <h1 className="mb-1 text-xl font-bold text-slate-900">Set a new password</h1>
        <p className="mb-5 text-sm text-slate-500">Choose something you haven't used before.</p>
        <form onSubmit={handleReset} className="space-y-3">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min 6 characters)"
            className={inputCls}
            autoComplete="new-password"
          />
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {busy ? "Saving…" : "Set new password"}
          </button>
        </form>
      </div>
    );
  }

  // ── Forgot password form ───────────────────────────────────────────────────

  if (mode === "forgot") {
    if (forgotSent) {
      return (
        <div className="mx-auto flex min-h-full max-w-md flex-col justify-center bg-white px-6 py-12">
          <div className="mb-8 flex flex-col items-center text-center">
            <VolleyballIcon className="h-12 w-12 text-brand" />
            <span className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">Coterie</span>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm">
            <p className="text-3xl mb-2">📬</p>
            <p className="font-semibold text-slate-900">Check your inbox</p>
            <p className="mt-1 text-sm text-slate-500">
              If an account exists for <strong>{email}</strong>, a reset link is on its way.
            </p>
          </div>
          <button
            onClick={() => { setMode("login"); setForgotSent(false); }}
            className="mt-4 text-center text-sm font-semibold text-brand"
          >
            Back to sign in
          </button>
        </div>
      );
    }

    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col justify-center bg-white px-6 py-12">
        <div className="mb-8 flex flex-col items-center text-center">
          <VolleyballIcon className="h-12 w-12 text-brand" />
          <span className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">Coterie</span>
        </div>
        <h1 className="mb-1 text-xl font-bold text-slate-900">Forgot your password?</h1>
        <p className="mb-5 text-sm text-slate-500">Enter your email and we'll send a reset link.</p>
        <form onSubmit={handleForgot} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className={inputCls}
            autoComplete="email"
          />
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <button
          onClick={() => { setMode("login"); setError(""); }}
          className="mt-4 text-center text-sm font-semibold text-brand"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  // ── Main sign-up / sign-in form ────────────────────────────────────────────

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center bg-white px-6 py-12">
      {/* Brand */}
      <div className="mb-8 flex flex-col items-center text-center">
        <VolleyballIcon className="h-12 w-12 text-brand" />
        <span className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">Coterie</span>
        <span className="mt-1 text-sm text-slate-400">Find your players. Fill your games.</span>
      </div>

      <h1 className="mb-1 text-xl font-bold text-slate-900">
        {mode === "signup" ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mb-5 text-sm text-slate-500">
        {mode === "signup" ? "Free to join — takes a few seconds." : "Sign in to pick up where you left off."}
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "signup" && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className={inputCls}
            autoComplete="name"
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className={inputCls}
          autoComplete="email"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === "signup" ? "Password (min 6 characters)" : "Password"}
          className={inputCls}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />

        {mode === "login" && (
          <div className="text-right">
            <button
              type="button"
              onClick={() => { setMode("forgot"); setError(""); }}
              className="text-xs font-medium text-slate-400 hover:text-brand"
            >
              Forgot password?
            </button>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      {/* Google sign-in */}
      <div className="my-4 flex items-center gap-3">
        <div className="flex-1 border-t border-slate-100" />
        <span className="text-xs text-slate-400">or</span>
        <div className="flex-1 border-t border-slate-100" />
      </div>
      <a
        href="/api/auth/google"
        className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </a>

      <p className="mt-4 text-center text-sm text-slate-500">
        {mode === "signup" ? "Already have an account? " : "New to Coterie? "}
        <button
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setError("");
          }}
          className="font-semibold text-brand underline"
        >
          {mode === "signup" ? "Sign in" : "Create one"}
        </button>
      </p>

      <p className="mt-6 text-center text-xs text-slate-400">
        Just exploring? Sign in with{" "}
        <button
          onClick={() => {
            setMode("login");
            setEmail("1@demo.test");
            setPassword("111111");
          }}
          className="font-medium text-slate-500 underline"
        >
          a demo account
        </button>
      </p>

      <p className="mt-4 text-center text-xs text-slate-300">
        By continuing you agree to our{" "}
        <Link to="/privacy" className="underline hover:text-slate-400">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400";
