import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AppNotification } from "../types";
import {
  getNotifications,
  markNotificationRead,
  markNotificationsRead,
} from "../services/gamesService";
import { timeAgo } from "../lib/format";
import {
  BellIcon,
  ChatIcon,
  ClockIcon,
  IconChip,
  MegaphoneIcon,
  PencilIcon,
  SparklesIcon,
  UserMinusIcon,
  UserPlusIcon,
  XCircleIcon,
} from "../components/icons";

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  join: UserPlusIcon,
  leave: UserMinusIcon,
  promoted: SparklesIcon,
  edited: PencilIcon,
  cancelled: XCircleIcon,
  comment: ChatIcon,
  message: ChatIcon,
  reminder: ClockIcon,
  announcement: MegaphoneIcon,
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
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Notifications
        </h1>
        {hasUnread && (
          <button
            onClick={markAll}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95"
          >
            Mark all read
          </button>
        )}
      </div>

      {items === null ? (
        <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
          <IconChip size="lg">
            <BellIcon className="h-6 w-6" />
          </IconChip>
          <p className="mt-2 text-sm text-slate-500">
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
                    ? "border-slate-100 bg-white"
                    : "border-brand/30 bg-brand/5"
                } ${n.gameId ? "hover:bg-slate-50 active:scale-[0.99]" : "cursor-default"}`}
              >
                {(() => {
                  const TypeIcon = ICON[n.type] ?? BellIcon;
                  return (
                    <IconChip size="sm">
                      <TypeIcon className="h-4 w-4" />
                    </IconChip>
                  );
                })()}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-slate-700">{n.message}</span>
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
