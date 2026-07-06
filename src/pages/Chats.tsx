import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ChatSummary } from "../types";
import { getChats } from "../services/gamesService";
import { formatDate, isPast, timeAgo } from "../lib/format";
import { isChatUnread } from "../lib/chatSeen";
import { ChatIcon, IconChip } from "../components/icons";

export default function Chats() {
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      setChats(await getChats());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your chats.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Chats</h1>
        <p className="text-sm text-slate-500">
          Group chats for every game you've joined.
        </p>
      </div>

      {chats === null && !error ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50 py-12 text-center">
          <p className="text-sm text-rose-600">{error}</p>
          <button
            onClick={load}
            className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      ) : chats && chats.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <IconChip size="lg" className="mb-2">
            <ChatIcon className="h-6 w-6" />
          </IconChip>
          <p className="font-semibold text-slate-700">No chats yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Join or host a game and its chat shows up here.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Find a game
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {chats!.map((c) => {
            const past = isPast(c.date);
            const unread = isChatUnread(c.gameId, c.lastMessageAt);
            const preview = c.lastMessage
              ? `${c.lastSender ? c.lastSender.split(" ")[0] + ": " : ""}${c.lastMessage}`
              : "No messages yet — say hi";
            return (
              <Link
                key={c.gameId}
                to={`/chats/${c.gameId}`}
                className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition active:scale-[0.99]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-base font-bold text-brand">
                  {c.title.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">
                      {c.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {c.lastMessageAt ? timeAgo(c.lastMessageAt) : formatDate(c.date)}
                    </span>
                  </div>
                  <p
                    className={`truncate text-xs ${
                      !c.lastMessage
                        ? "text-slate-400 italic"
                        : unread
                        ? "font-semibold text-slate-700"
                        : "text-slate-500"
                    }`}
                  >
                    {preview}
                  </p>
                </div>
                {unread && (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand"
                    aria-label="Unread messages"
                  />
                )}
                {past && !unread && (
                  <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                    ended
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
