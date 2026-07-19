import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import type { Comment } from "../types";
import { addComment, deleteComment, getComments } from "../services/gamesService";
import { useAuth } from "../auth/AuthContext";
import { timeAgo } from "../lib/format";
import ReportButton from "./ReportButton";
import ErrorModal from "./ErrorModal";
import { StarIcon, XIcon } from "./icons";

/**
 * Per-game discussion thread. Anyone can read; signed-in users can post.
 * A comment can be deleted by its author or by the game's host.
 */
export default function GameComments({
  gameId,
  hostId,
}: {
  gameId: string;
  hostId: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getComments(gameId)
      .then((c) => active && setComments(c))
      .catch(() => active && setComments([]));
    return () => {
      active = false;
    };
  }, [gameId]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate("/auth", { state: { from: location.pathname } });
      return;
    }
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setError("");
    try {
      const updated = await addComment(gameId, body);
      setComments(updated);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post your message.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setComments(await deleteComment(gameId, id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete that.");
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-white">
        Discussion
        {comments && comments.length > 0 && (
          <span className="ml-1 font-normal text-slate-400">
            ({comments.length})
          </span>
        )}
      </h2>

      {/* Thread */}
      {comments === null ? (
        <p className="py-3 text-center text-xs text-slate-400">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="py-3 text-center text-xs text-slate-400">
          No messages yet — start the conversation.
        </p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => {
            const canDelete = user && (user.id === c.userId || user.id === hostId);
            return (
              <li key={c.id} className="flex gap-2.5">
                <Link
                  to={`/user/${c.userId}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-400"
                >
                  {c.userName.charAt(0).toUpperCase()}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <Link
                      to={`/user/${c.userId}`}
                      className="text-sm font-semibold text-slate-100 underline-offset-2 hover:underline"
                    >
                      {c.userName}
                      {c.userId === hostId && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-xs font-medium text-amber-400">
                          <StarIcon filled className="h-3 w-3" aria-hidden />
                          host
                        </span>
                      )}
                    </Link>
                    <span className="text-xs text-slate-400">
                      {timeAgo(c.createdAt)}
                    </span>
                    {canDelete ? (
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="ml-auto text-xs text-slate-300 hover:text-rose-500"
                        aria-label="Delete message"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    ) : user && user.id !== c.userId ? (
                      <ReportButton
                        targetType="game_comment"
                        targetId={c.id}
                        className="ml-auto text-xs font-medium text-slate-300 hover:text-rose-500"
                      />
                    ) : null}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-200">
                    {c.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error && <ErrorModal message={error} onClose={() => setError("")} />}

      {/* Composer */}
      <form onSubmit={handlePost} className="mt-3 flex items-end gap-2 border-t border-slate-800 pt-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handlePost(e);
            }
          }}
          rows={1}
          placeholder={user ? "Write a message…" : "Sign in to join the chat"}
          className="max-h-28 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-slate-400"
        />
        <button
          type="submit"
          disabled={busy || (!!user && !draft.trim())}
          className="shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          {user ? (busy ? "…" : "Send") : "Sign in"}
        </button>
      </form>
    </div>
  );
}
