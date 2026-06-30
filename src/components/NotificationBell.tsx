import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AppNotification } from "../types";
import {
  getNotifications,
  markNotificationRead,
  markNotificationsRead,
} from "../services/gamesService";
import { useAuth } from "../auth/AuthContext";
import { timeAgo } from "../lib/format";
import { BellIcon } from "./icons";

const POLL_MS = 45000;

const ICON: Record<string, string> = {
  join: "🙋",
  leave: "👋",
  promoted: "🎉",
  edited: "✏️",
  cancelled: "❌",
  comment: "💬",
  message: "💬",
  reminder: "⏰",
  announcement: "📣",
};

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const activeRef = useRef(true);

  const load = useCallback(() => {
    getNotifications()
      .then((r) => {
        if (!activeRef.current) return;
        setItems(r.items);
        setUnread(r.unreadCount);
      })
      .catch(() => {
        /* ignore transient errors (offline / cold start) */
      });
  }, []);

  // Poll while signed in.
  useEffect(() => {
    if (!user) return;
    activeRef.current = true;
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      activeRef.current = false;
      clearInterval(t);
    };
  }, [user, load]);

  if (!user) return null;

  // Opening the panel no longer marks everything read — only the items the user
  // actually interacts with (or the explicit "Mark all read" button).
  const toggle = () => setOpen((o) => !o);

  const markAll = async () => {
    if (unread === 0) return;
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await markNotificationsRead();
    } catch {
      /* will reconcile on next poll */
    }
  };

  const openGame = (n: AppNotification) => {
    setOpen(false);
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      markNotificationRead(n.id).catch(() => {});
    }
    if (n.gameId) navigate(`/game/${n.gameId}`);
  };

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100"
        aria-label="Notifications"
      >
        <BellIcon className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-2 max-h-[70vh] w-72 overflow-y-auto rounded-2xl border border-slate-100 bg-white p-2 shadow-lg">
            <div className="flex items-center justify-between px-2 py-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Notifications
              </p>
              {unread > 0 && (
                <button
                  onClick={markAll}
                  className="text-xs font-semibold text-brand hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-slate-400">
                Nothing yet. You'll be notified when someone joins, leaves, or
                comments on your games.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {items.slice(0, 8).map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => openGame(n)}
                      disabled={!n.gameId}
                      className={`flex w-full gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
                        n.read ? "" : "bg-brand/5"
                      } ${n.gameId ? "hover:bg-slate-50" : "cursor-default"}`}
                    >
                      <span aria-hidden>{ICON[n.type] ?? "🔔"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-slate-700">{n.message}</span>
                        <span className="text-xs text-slate-400">
                          {timeAgo(n.createdAt)}
                        </span>
                      </span>
                      {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={() => {
                setOpen(false);
                navigate("/notifications");
              }}
              className="mt-1 w-full rounded-lg px-2 py-2 text-center text-xs font-semibold text-brand transition hover:bg-slate-50"
            >
              See all notifications
            </button>
          </div>
        </>
      )}
    </div>
  );
}
