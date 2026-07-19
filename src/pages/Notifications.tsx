import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AppNotification } from "../types";
import {
  getNotifications,
  markNotificationRead,
  markNotificationsRead,
} from "../services/gamesService";
import { timeAgo } from "../lib/format";
import { Spinner } from "../components/Skeleton";
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

// Each notification type gets its own icon AND colour so the list is scannable
// at a glance — a join reads green, a cancellation red, a reminder purple, etc.
type TypeStyle = {
  Icon: React.ComponentType<{ className?: string }>;
  badge: string; // icon chip background + foreground
  label: string; // short category tag shown above the message
};

const TYPE_STYLE: Record<string, TypeStyle> = {
  join:         { Icon: UserPlusIcon,  badge: "bg-emerald-500/15 text-emerald-400", label: "Joined" },
  leave:        { Icon: UserMinusIcon, badge: "bg-slate-500/25 text-slate-300",     label: "Left" },
  promoted:     { Icon: SparklesIcon,  badge: "bg-amber-500/15 text-amber-400",     label: "Promoted" },
  edited:       { Icon: PencilIcon,    badge: "bg-sky-500/15 text-sky-400",         label: "Updated" },
  cancelled:    { Icon: XCircleIcon,   badge: "bg-rose-500/15 text-rose-400",       label: "Cancelled" },
  comment:      { Icon: ChatIcon,      badge: "bg-indigo-500/15 text-indigo-400",   label: "Comment" },
  message:      { Icon: ChatIcon,      badge: "bg-indigo-500/15 text-indigo-400",   label: "Message" },
  reminder:     { Icon: ClockIcon,     badge: "bg-violet-500/15 text-violet-400",   label: "Reminder" },
  announcement: { Icon: MegaphoneIcon, badge: "bg-brand/15 text-brand",             label: "Announcement" },
};

const DEFAULT_STYLE: TypeStyle = {
  Icon: BellIcon,
  badge: "bg-slate-500/25 text-slate-300",
  label: "Update",
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

  const unreadCount = items?.filter((n) => !n.read).length ?? 0;

  return (
    <div>
      {/* Same h1 + subtitle block every top-level page uses (Browse, Marketplace,
          Chats) so the header sits at the same height when swiping between
          tabs — this page was previously missing the subtitle line. */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Notifications
            </h1>
            {unreadCount > 0 && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400">
            Updates on games you've joined or hosted.
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAll}
            className="mt-0.5 shrink-0 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-800 active:scale-95"
          >
            Mark all read
          </button>
        )}
      </div>

      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-700 bg-slate-800 py-12 text-center">
          <IconChip size="lg">
            <BellIcon className="h-6 w-6" />
          </IconChip>
          <p className="mt-2 text-sm text-slate-400">
            Nothing yet. You'll be notified when someone joins, leaves, or
            comments on your games.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const style = TYPE_STYLE[n.type] ?? DEFAULT_STYLE;
            const { Icon } = style;
            return (
              <li key={n.id}>
                <button
                  onClick={() => open(n)}
                  disabled={!n.gameId}
                  className={`relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border px-3 py-3 text-left transition ${
                    n.read
                      ? "border-slate-800 bg-slate-900"
                      : "border-slate-700 bg-slate-800"
                  } ${n.gameId ? "hover:bg-slate-800 active:scale-[0.99]" : "cursor-default"}`}
                >
                  {/* Left accent bar marks unread items at a glance */}
                  {!n.read && (
                    <span className="absolute inset-y-0 left-0 w-1 rounded-r bg-brand" aria-hidden />
                  )}
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.badge}`}
                    aria-hidden
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-0.5 flex items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        {style.label}
                      </span>
                      <span className="text-[11px] text-slate-500">·</span>
                      <span className="text-[11px] text-slate-500">{timeAgo(n.createdAt)}</span>
                    </span>
                    <span
                      className={`block text-sm leading-snug ${
                        n.read ? "text-slate-300" : "font-medium text-white"
                      }`}
                    >
                      {n.message}
                    </span>
                  </span>
                  {!n.read && (
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" aria-label="Unread" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
