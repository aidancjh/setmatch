import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

type Mode = "login" | "signup";

export default function Auth() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Where to go after auth (set by RequireAuth when it redirects here).
  const from = (location.state as { from?: string } | null)?.from || "/";

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "signup") {
        await signup(email.trim(), password, name.trim());
      } else {
        await login(email.trim(), password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const useDemo = () => {
    setMode("login");
    setEmail("maria@demo.test");
    setPassword("volleyball");
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 text-center">
        <div className="mb-2 text-4xl" aria-hidden>
          🏐
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === "login"
            ? "Sign in to join games and post your own."
            : "Join SetMatch to find players and fill your games."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" && (
          <Field label="Display name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How you'll appear on rosters"
              className={inputCls}
              autoComplete="name"
            />
          </Field>
        )}
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className={inputCls}
            autoComplete="email"
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
            className={inputCls}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </Field>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-60"
        >
          {busy
            ? "Please wait…"
            : mode === "login"
            ? "Sign in"
            : "Create account"}
        </button>
      </form>

      <div className="mt-4 text-center text-sm text-slate-500">
        {mode === "login" ? (
          <>
            New here?{" "}
            <button
              onClick={() => {
                setMode("signup");
                setError("");
              }}
              className="font-semibold text-slate-900 underline"
            >
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              onClick={() => {
                setMode("login");
                setError("");
              }}
              className="font-semibold text-slate-900 underline"
            >
              Sign in
            </button>
          </>
        )}
      </div>

      <div className="mt-8 rounded-xl bg-slate-50 p-4 text-center text-xs leading-relaxed text-slate-400">
        <p className="font-semibold text-slate-500">Just testing?</p>
        Use a demo account —{" "}
        <button onClick={useDemo} className="font-semibold text-slate-600 underline">
          fill in Maria's login
        </button>{" "}
        (password <code className="rounded bg-slate-200 px-1">volleyball</code>).
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-slate-400";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}
