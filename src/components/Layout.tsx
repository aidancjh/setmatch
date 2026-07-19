import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import CelebrationHost from "./CelebrationHost";
import { useAuth } from "../auth/AuthContext";
import { useAppConfig } from "../hooks/useAppConfig";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { refreshAll } from "../services/gamesService";
import {
  ArrowUpIcon,
  BagIcon,
  BellIcon,
  CalendarIcon,
  ChatIcon,
  ClapperIcon,
  IconChip,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
  VolleyballIcon,
} from "./icons";

// Which bottom-tab slot a route belongs to, or -1 if it's not one of the
// four tab roots (e.g. a game detail page pushed on top of Browse/My Games).
function tabSlotFor(pathname: string): number {
  if (pathname === "/") return 0;
  if (pathname.startsWith("/marketplace")) return 1;
  if (pathname.startsWith("/notifications")) return 3;
  if (pathname.startsWith("/profile")) return 4;
  return -1;
}

const leftTabs = [
  { to: "/", label: "Browse", Icon: SearchIcon, end: true },
  { to: "/marketplace", label: "Market", Icon: BagIcon, end: false },
];
const rightTabs = [
  { to: "/notifications", label: "Alerts", Icon: BellIcon, end: false },
  { to: "/profile", label: "Profile", Icon: UserIcon, end: false },
];

// ---------------------------------------------------------------------------
// Post-type bottom sheet
// ---------------------------------------------------------------------------

function PostSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();

  const options = [
    {
      Icon: CalendarIcon,
      label: "Post a game",
      sub: "Schedule a volleyball game and invite players",
      action: () => { navigate("/create"); onClose(); },
    },
    {
      Icon: ClapperIcon,
      label: "Share a highlight",
      sub: "Post a sports clip to your profile",
      action: () => { navigate("/profile?upload=1"); onClose(); },
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
      <div className="animate-sheet-up relative mx-auto w-full max-w-md rounded-t-3xl bg-slate-900 pb-10 pt-3 shadow-xl">
        {/* Handle */}
        <div className="mb-4 flex justify-center">
          <div className="h-1 w-10 rounded-full bg-slate-700" />
        </div>

        <p className="mb-4 px-5 text-base font-bold text-white">
          What do you want to post?
        </p>

        <div className="space-y-2 px-4">
          {options.map((o) => (
            <button
              key={o.label}
              onClick={o.action}
              className="flex w-full items-center gap-4 rounded-2xl border border-slate-800 bg-slate-800 px-4 py-4 text-left transition hover:border-brand/30 hover:bg-brand/5 active:scale-[0.98]"
            >
              <IconChip size="md">
                <o.Icon className="h-5 w-5" />
              </IconChip>
              <div>
                <p className="font-semibold text-white">{o.label}</p>
                <p className="text-sm text-slate-400">{o.sub}</p>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mx-4 mt-3 w-[calc(100%-2rem)] rounded-xl py-3 text-sm font-semibold text-slate-400 transition hover:bg-slate-800"
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
  const { user } = useAuth();
  const config = useAppConfig();
  const [showPost, setShowPost] = useState(false);
  // Sub-pages pushed from a tab (game detail, edit, chat, settings...) aren't
  // tab roots themselves — keep whichever tab we came from lit instead of
  // going dark, so the "you are here" pill doesn't disappear on drill-in.
  const [activeSlot, setActiveSlot] = useState(() => tabSlotFor(pathname));
  const mainRef = useRef<HTMLElement>(null);
  const { pull, refreshing } = usePullToRefresh(mainRef, refreshAll);

  // "Back to top" button — only shown once the scroll region is meaningfully
  // scrolled, so pages too short to scroll never surface it. Because <main> is
  // the app's single scroll container, this covers every list (Browse, Market,
  // Highlights, …) with one implementation.
  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => setShowScrollTop(el.scrollTop > 400);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  // Reset visibility on navigation — each page starts at the top.
  useEffect(() => {
    setShowScrollTop(false);
  }, [pathname]);

  const isAdmin = user?.role === "admin";

  // The post sheet is part of the persistent app shell (it wraps the Outlet),
  // so it survives tab switches — close it whenever the route changes.
  useEffect(() => {
    setShowPost(false);
  }, [pathname]);

  useEffect(() => {
    const slot = tabSlotFor(pathname);
    if (slot !== -1) setActiveSlot(slot);
  }, [pathname]);

  // Maintenance mode: non-admins see a friendly screen; admins keep working
  // (with a banner) so they can turn it back off.
  if (config.maintenanceMode && !isAdmin) {
    return (
      <div
        className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 px-8 text-center"
        style={{ height: "100svh" }}
      >
        <VolleyballIcon className="h-12 w-12 text-brand" />
        <h1 className="text-xl font-extrabold tracking-tight text-white">
          We'll be right back
        </h1>
        <p className="text-sm text-slate-400">
          Vybe is down for a quick bit of maintenance. Please check back shortly —
          thanks for your patience!
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative mx-auto flex h-screen max-w-md flex-col overflow-hidden bg-black shadow-sm"
      style={{ height: "100svh" }}
    >
      {/* Top bar — logo left, quick actions right */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-black/90 px-4 py-3 backdrop-blur"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-left transition-all duration-150 active:scale-95 active:opacity-70"
          aria-label="Go to home"
        >
          <VolleyballIcon className="h-6 w-6 text-brand" />
          <span className="text-lg font-extrabold tracking-tight text-white">
            Vybe
          </span>
        </button>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => navigate("/chats")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-800 active:scale-90"
            aria-label="Chats"
          >
            <ChatIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-800"
            aria-label="Settings"
          >
            <SettingsIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      {config.maintenanceMode && isAdmin && (
        <div className="bg-sky-600 px-4 py-1.5 text-center text-xs font-semibold text-white">
          Maintenance mode is ON — only admins can use the app
        </div>
      )}

      {/* Page content — the only scrolling region, so the nav below always
          stays pinned to the bottom regardless of how short the page is. */}
      <main ref={mainRef} className="relative flex-1 overflow-y-auto px-4 pb-6 pt-4">
        {/* Pull-to-refresh indicator (touch). Fades/rotates in as you pull. */}
        {(pull > 0 || refreshing) && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
            style={{
              transform: `translateY(${Math.max(pull - 28, 0)}px)`,
              opacity: refreshing ? 1 : Math.min(pull / 70, 1),
            }}
          >
            <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 shadow">
              <div
                className={`h-4 w-4 rounded-full border-2 border-slate-600 border-t-brand ${
                  refreshing ? "animate-spin" : ""
                }`}
                style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }}
              />
            </div>
          </div>
        )}
        {/* Keyed by route so the page gently fades/rises in on every navigation */}
        <div
          key={pathname}
          className="animate-page-enter"
          style={pull ? { transform: `translateY(${pull}px)` } : undefined}
        >
          <Outlet />
        </div>
      </main>

      {/* Back-to-top — floats above the nav, only once the page is scrolled. */}
      <button
        onClick={() =>
          mainRef.current?.scrollTo({ top: 0, behavior: "smooth" })
        }
        aria-label="Scroll to top"
        className={`absolute bottom-24 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 bg-slate-900/90 text-white shadow-lg backdrop-blur transition-all duration-200 hover:bg-slate-800 active:scale-90 ${
          showScrollTop
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-2 opacity-0"
        }`}
      >
        <ArrowUpIcon className="h-5 w-5" />
      </button>

      {/* Bottom tab bar with raised center "+" — in normal flow as the last
          flex child so it sits flush at the bottom on every page (fixed
          positioning mis-renders on short pages in iOS standalone PWAs). */}
      <nav
        aria-label="Main navigation"
        className="z-10 shrink-0 border-t border-slate-800 bg-black/95 backdrop-blur"
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
