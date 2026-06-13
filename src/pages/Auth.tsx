import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { VolleyballIcon } from "../components/icons";

type Mode = "signup" | "login";

export default function Auth() {
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/";

  const [mode, setMode] = useState<Mode>("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Recurring (already signed-in) users never see this screen.
  if (user) return <Navigate to={from} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signup") await signup(email.trim(), password, name.trim());
      else await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center bg-white px-6 py-12">
      {/* Brand */}
      <div className="mb-8 flex flex-col items-center text-center">
        <VolleyballIcon className="h-12 w-12 text-brand" />
        <span className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">
          Coterie
        </span>
        <span className="mt-1 text-sm text-slate-400">
          Find your players. Fill your games.
        </span>
      </div>

      <h1 className="mb-1 text-xl font-bold text-slate-900">
        {mode === "signup" ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mb-5 text-sm text-slate-500">
        {mode === "signup"
          ? "Free to join — takes a few seconds."
          : "Sign in to pick up where you left off."}
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

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

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
            setEmail("maria@demo.test");
            setPassword("volleyball");
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
