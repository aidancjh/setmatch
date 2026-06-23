import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Game, Message } from "../types";
import { getGame, getMessages, sendMessage } from "../services/gamesService";
import { useAuth } from "../auth/AuthContext";
import { formatDate, timeAgo } from "../lib/format";

const POLL_MS = 4000;

export default function ChatRoom() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [game, setGame] = useState<Game | undefined | null>(undefined);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load the game header once.
  useEffect(() => {
    getGame(id).then((g) => setGame(g ?? null));
  }, [id]);

  // Load + poll messages.
  useEffect(() => {
    let active = true;
    async function pull() {
      try {
        const m = await getMessages(id);
        if (active) {
          setMessages(m);
          setAccessDenied(false);
        }
      } catch (e) {
        if (!active) return;
        // 403 → user isn't (or is no longer) in this game.
        if (e instanceof Error && /players in this game/i.test(e.message)) {
          setAccessDenied(true);
          setMessages([]);
        } else {
          setMessages((prev) => prev ?? []);
        }
      }
    }
    pull();
    const t = setInterval(pull, POLL_MS);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [id]);

  // Keep the view pinned to the latest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const msg = await sendMessage(id, body);
      setMessages((prev) => [...(prev ?? []), msg]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send your message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => navigate("/chats")}
          className="-ml-1 rounded-lg p-1 text-slate-500 transition active:scale-90"
          aria-label="Back to chats"
        >
          ←
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight text-slate-900">
            {game ? game.title : "Chat"}
          </h1>
          {game && (
            <button
              onClick={() => navigate(`/game/${game.id}`)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              {formatDate(game.date)} · {game.players.length} in this chat · view game →
            </button>
          )}
        </div>
      </div>

      {accessDenied ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <p className="mb-2 text-3xl">🔒</p>
          <p className="font-semibold text-slate-700">You're not in this game</p>
          <p className="mt-1 text-sm text-slate-500">
            Join the game to see and post in its chat.
          </p>
          {game && (
            <button
              onClick={() => navigate(`/game/${game.id}`)}
              className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              View game
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/60 p-3"
          >
            {messages === null ? (
              <p className="py-10 text-center text-xs text-slate-400">Loading…</p>
            ) : messages.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-400">
                No messages yet — start the conversation.
              </p>
            ) : (
              messages.map((m, i) => {
                const mine = m.userId === user?.id;
                const prev = messages[i - 1];
                const showName = !mine && (!prev || prev.userId !== m.userId);
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                  >
                    {showName && (
                      <span className="mb-0.5 ml-1 text-[11px] font-semibold text-slate-500">
                        {m.userName}
                      </span>
                    )}
                    <div
                      className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                        mine
                          ? "rounded-br-sm bg-brand text-white"
                          : "rounded-bl-sm bg-white text-slate-800 shadow-sm"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    </div>
                    <span className="mt-0.5 px-1 text-[10px] text-slate-400">
                      {timeAgo(m.createdAt)}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

          {/* Composer */}
          <form
            onSubmit={handleSend}
            className="mt-3 flex items-end gap-2 border-t border-slate-100 pt-3"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e);
                }
              }}
              rows={1}
              placeholder="Message your group…"
              className="max-h-28 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark active:scale-95 disabled:opacity-50"
            >
              {sending ? "…" : "Send"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
