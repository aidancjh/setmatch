import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import NotificationBell from "./NotificationBell";
import CelebrationHost from "./CelebrationHost";
import {
  CalendarIcon,
  ChatIcon,
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
        `relative z-10 flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-all duration-150 active:scale-90 active:opacity-70 ${
          isActive ? "text-white" : "text-slate-400"
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
  const { pathname } = useLocation();
  const [showPost, setShowPost] = useState(false);

  const activeSlot =
    pathname === "/" ? 0 :
    pathname.startsWith("/highlights") ? 1 :
    pathname.startsWith("/my-games") ? 3 :
    pathname.startsWith("/profile") ? 4 :
    -1;

  return (
    <div
      className="mx-auto flex h-screen max-w-md flex-col overflow-hidden bg-white shadow-sm"
      style={{ height: "100dvh" }}
    >
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
          <button
            onClick={() => navigate("/chats")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 active:scale-90"
            aria-label="Chats"
          >
            <ChatIcon className="h-5 w-5" />
          </button>
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

      {/* Page content — the only scrolling region, so the nav below always
          stays pinned to the bottom regardless of how short the page is. */}
      <main className="flex-1 overflow-y-auto px-4 pb-6 pt-4">
        {/* Keyed by route so the page gently fades/rises in on every navigation */}
        <div key={pathname} className="animate-page-enter">
          <Outlet />
        </div>
      </main>

      {/* Bottom tab bar with raised center "+" — in normal flow as the last
          flex child so it sits flush at the bottom on every page (fixed
          positioning mis-renders on short pages in iOS standalone PWAs). */}
      <nav
        aria-label="Main navigation"
        className="z-10 shrink-0 border-t border-slate-100 bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="relative flex items-end">
          {/* Sliding pill — same style as My Games tab switcher */}
          {activeSlot >= 0 && (
            <div
              className="pointer-events-none absolute inset-y-1 left-0 w-1/5 px-1.5"
              style={{
                transform: `translateX(${activeSlot * 100}%)`,
                transition: "transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            >
              <div className="h-full w-full rounded-2xl bg-brand shadow-sm" />
            </div>
          )}

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
        </div>
      </nav>

      {showPost && <PostSheet onClose={() => setShowPost(false)} />}

      {/* Celebration visuals (confetti / checkmark) — persist across navigation */}
      <CelebrationHost />
    </div>
  );
}
