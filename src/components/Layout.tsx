import { NavLink, Outlet, useNavigate } from "react-router-dom";
import NotificationBell from "./NotificationBell";
import {
  CalendarIcon,
  PlusIcon,
  SearchIcon,
  UserIcon,
  VideoIcon,
  VolleyballIcon,
} from "./icons";

const tabs = [
  { to: "/", label: "Browse", Icon: SearchIcon, end: true },
  { to: "/highlights", label: "Highlights", Icon: VideoIcon, end: false },
  { to: "/my-games", label: "My Games", Icon: CalendarIcon, end: false },
  { to: "/profile", label: "Profile", Icon: UserIcon, end: false },
];

export default function Layout() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-white shadow-sm">
      {/* Top bar */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/90 px-4 py-3 backdrop-blur"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-left"
        >
          <VolleyballIcon className="h-6 w-6 text-brand" />
          <span className="text-lg font-extrabold tracking-tight text-slate-900">
            Coterie
          </span>
        </button>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            onClick={() => navigate("/create")}
            className="flex items-center gap-1 rounded-full bg-brand py-1.5 pl-2.5 pr-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            <PlusIcon className="h-4 w-4" />
            Post
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 px-4 pb-24 pt-4">
        <Outlet />
      </main>

      {/* Bottom tab bar */}
      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md items-stretch border-t border-slate-100 bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {tabs.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                isActive ? "text-brand" : "text-slate-400"
              }`
            }
          >
            <Icon className="h-6 w-6" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
