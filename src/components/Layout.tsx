import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Layout() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const tabs = [
    { to: "/", label: "Browse", icon: "🔍", end: true },
    { to: "/my-games", label: "My Games", icon: "📋", end: false },
    user
      ? { to: "/profile", label: "Profile", icon: "👤", end: false }
      : { to: "/auth", label: "Sign in", icon: "👤", end: false },
  ];

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-white shadow-sm">
      {/* Top bar */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/90 px-4 py-3 backdrop-blur">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-left"
        >
          <span className="text-xl" aria-hidden>
            🏐
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900">
            SetMatch
          </span>
        </button>
        <button
          onClick={() => navigate("/create")}
          className="rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          + Post game
        </button>
      </header>

      {/* Page content */}
      <main className="flex-1 px-4 pb-24 pt-4">
        <Outlet />
      </main>

      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md items-stretch border-t border-slate-100 bg-white/95 backdrop-blur">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition ${
                isActive ? "text-slate-900" : "text-slate-400"
              }`
            }
          >
            <span className="text-lg" aria-hidden>
              {t.icon}
            </span>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
