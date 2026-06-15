import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import NotificationBell from "./NotificationBell";
import {
  CalendarIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
  VideoIcon,
  VolleyballIcon,
} from "./icons";

const leftTabs = [
  { to: "/", label: "Browse", Icon: SearchIcon, end: true },
  { to: "/highlights", label: "Highlights", Icon: VideoIcon, end: false },
];
const rightTabs = [
  { to: "/my-games", label: "My Games", Icon: CalendarIcon, end: false },
  { to: "/profile", label: "Profile", Icon: UserIcon, end: false },
];

// ---------------------------------------------------------------------------
// Post-type bottom sheet
// ---------------------------------------------------------------------------

function PostSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();

  const options = [
    {
      icon: "📅",
      label: "Post a game",
      sub: "Schedule a volleyball game and invite players",
      action: () => { navigate("/create"); onClose(); },
    },
    {
      icon: "🎬",
      label: "Share a highlight",
      sub: "Upload a sports clip for everyone to see",
      action: () => { navigate("/highlights?upload=1"); onClose(); },
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="animate-sheet-up relative mx-auto w-full max-w-md rounded-t-3xl bg-white pb-10 pt-3 shadow-xl">
        {/* Handle */}
        <div className="mb-4 flex justify-center">
          <div className="h-1 w-10 rounded-full bg-slate-200" />
        </div>

        <p className="mb-4 px-5 text-base font-bold text-slate-900">
          What do you want to post?
        </p>

        <div className="space-y-2 px-4">
          {options.map((o) => (
            <button
              key={o.label}
              onClick={o.action}
              className="flex w-full items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-left transition hover:border-brand/30 hover:bg-brand/5 active:scale-[0.98]"
            >
              <span className="text-2xl">{o.icon}</span>
              <div>
                <p className="font-semibold text-slate-900">{o.label}</p>
                <p className="text-sm text-slate-500">{o.sub}</p>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mx-4 mt-3 w-[calc(100%-2rem)] rounded-xl py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab link helper
// ---------------------------------------------------------------------------

function Tab({
  to,
  label,
  Icon,
  end,
}: {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  end: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-all duration-150 active:scale-90 active:opacity-70 ${
          isActive ? "text-brand" : "text-slate-400"
        }`
      }
    >
      <Icon className="h-6 w-6" aria-hidden />
      {label}
    </NavLink>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function Layout() {
  const navigate = useNavigate();
  const [showPost, setShowPost] = useState(false);

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col bg-white shadow-sm">
      {/* Top bar — logo left, notifications right */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/90 px-4 py-3 backdrop-blur"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-left transition-all duration-150 active:scale-95 active:opacity-70"
          aria-label="Go to home"
        >
          <VolleyballIcon className="h-6 w-6 text-brand" />
          <span className="text-lg font-extrabold tracking-tight text-slate-900">
            Coterie
          </span>
        </button>

        <div className="flex items-center gap-0.5">
          <NotificationBell />
          <button
            onClick={() => navigate("/settings")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            aria-label="Settings"
          >
            <SettingsIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 px-4 pb-28 pt-4">
        <Outlet />
      </main>

      {/* Bottom tab bar with raised center "+" */}
      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md items-end border-t border-slate-100 bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Left tabs */}
        {leftTabs.map((t) => (
          <Tab key={t.to} {...t} />
        ))}

        {/* Center + button */}
        <div className="flex flex-1 flex-col items-center pb-2.5">
          <button
            onClick={() => setShowPost(true)}
            aria-label="Create a post"
            className="flex h-14 w-14 -translate-y-3 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-brand/30 transition active:scale-95 hover:bg-brand-dark"
          >
            <PlusIcon className="h-7 w-7" />
          </button>
        </div>

        {/* Right tabs */}
        {rightTabs.map((t) => (
          <Tab key={t.to} {...t} />
        ))}
      </nav>

      {showPost && <PostSheet onClose={() => setShowPost(false)} />}
    </div>
  );
}
