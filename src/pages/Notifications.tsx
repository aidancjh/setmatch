import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AppNotification } from "../types";
import {
  getNotifications,
  markNotificationRead,
  markNotificationsRead,
} from "../services/gamesService";
import { timeAgo } from "../lib/format";

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

export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[] | null>(null);

  useEffect(() => {
    getNotifications()
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, []);

  const open = (n: AppNotification) => {
    if (!n.read) {
      setItems((prev) =>
        prev ? prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)) : prev
      );
      markNotificationRead(n.id).catch(() => {});
    }
    if (n.gameId) navigate(`/game/${n.gameId}`);
  };

  const markAll = async () => {
    setItems((prev) => (prev ? prev.map((n) => ({ ...n, read: true })) : prev));
    try {
      await markNotificationsRead();
    } catch {
      /* will reconcile on next load */
    }
  };

  const hasUnread = !!items?.some((n) => !n.read);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Notifications
        </h1>
        {hasUnread && (
          <button
            onClick={markAll}
            className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 active:scale-95"
          >
            Mark all read
          </button>
        )}
      </div>

      {items === null ? (
        <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800 py-12 text-center">
          <p className="text-3xl">🔔</p>
          <p className="mt-2 text-sm text-slate-400">
            Nothing yet. You'll be notified when someone joins, leaves, or
            comments on your games.
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => open(n)}
                disabled={!n.gameId}
                className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                  n.read
                    ? "border-slate-800 bg-slate-900"
                    : "border-brand/30 bg-brand/5"
                } ${n.gameId ? "hover:bg-slate-800 active:scale-[0.99]" : "cursor-default"}`}
              >
                <span className="text-lg" aria-hidden>
                  {ICON[n.type] ?? "🔔"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-slate-200">{n.message}</span>
                  <span className="text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
                </span>
                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
