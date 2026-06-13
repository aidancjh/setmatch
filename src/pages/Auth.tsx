import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { VolleyballIcon } from "../components/icons";

type Mode = "signup" | "login";

const intro = [
  { icon: "🔍", title: "Find open games", text: "Browse pickup volleyball near you that still needs players." },
  { icon: "➕", title: "Post your own", text: "Set the time, place, and how many slots you need to fill." },
  { icon: "🔔", title: "Join in a tap", text: "Claim a spot, chat with players, and get notified of changes." },
];

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
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-white">
      {/* Hero / intro */}
      <div className="bg-slate-900 px-6 pb-8 pt-12 text-white">
        <div className="mb-5 flex items-center gap-2.5">
          <VolleyballIcon className="h-8 w-8" />
          <span className="text-2xl font-bold tracking-tight">SetMatch</span>
        </div>
        <h1 className="text-2xl font-bold leading-snug">
          Pickup volleyball,
          <br />
          sorted.
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          The simplest way to find players and fill your games.
        </p>
      </div>

      {/* How it works — only meaningful for new users seeing this the first time */}
      <div className="space-y-3 px-6 py-6">
        {intro.map((s) => (
          <div key={s.title} className="flex items-start gap-3">
            <span className="text-xl" aria-hidden>
              {s.icon}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{s.title}</p>
              <p className="text-sm leading-snug text-slate-500">{s.text}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Auth form */}
      <div className="flex-1 rounded-t-3xl border-t border-slate-100 bg-slate-50 px-6 pb-10 pt-6">
        <h2 className="mb-1 text-lg font-bold text-slate-900">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h2>
        <p className="mb-4 text-sm text-slate-500">
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
            className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {busy
              ? "Please wait…"
              : mode === "signup"
              ? "Create account"
              : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          {mode === "signup" ? "Already have an account? " : "New to SetMatch? "}
          <button
            onClick={() => {
              setMode(mode === "signup" ? "login" : "signup");
              setError("");
            }}
            className="font-semibold text-slate-900 underline"
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
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400";
