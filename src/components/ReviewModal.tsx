import { useState } from "react";
import type { Game } from "../types";
import { submitReview } from "../services/gamesService";
import { formatDate, formatTime } from "../lib/format";

function Stars({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1" role="group" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          className="text-3xl transition-transform active:scale-110"
        >
          <span className={(hover || value) >= n ? "text-amber-400" : "text-slate-200"}>
            ★
          </span>
        </button>
      ))}
    </div>
  );
}

const ratingLabel = ["", "Poor", "Fair", "Good", "Great", "Excellent!"];

export default function ReviewModal({
  game,
  onDone,
}: {
  game: Game;
  onDone: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (rating === 0) {
      setError("Please tap a star to rate the game.");
      return;
    }
    if (!comment.trim()) {
      setError("Please leave a comment before submitting.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await submitReview(game.id, rating, comment.trim());
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save review.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onDone(); }}
    >
      <div className="animate-pop-in w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">
            How was it?
          </p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">{game.title}</h2>
          <p className="text-sm text-slate-500">
            {formatDate(game.date)} · {formatTime(game.time)} · hosted by {game.hostName}
          </p>
        </div>

        {/* Star rating */}
        <div className="mb-2 flex flex-col items-center gap-2">
          <Stars value={rating} onChange={setRating} />
          <p className="h-5 text-sm font-semibold text-amber-500">
            {rating > 0 ? ratingLabel[rating] : "Tap to rate"}
          </p>
        </div>

        {/* Comment */}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 500))}
          placeholder="Leave a comment for the host… (required)"
          rows={3}
          className="mt-3 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
        />
        <p className="mt-0.5 text-right text-xs text-slate-400">{comment.length}/500</p>

        {error && (
          <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onDone}
            className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-500 transition-all duration-150 hover:bg-slate-50 active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={busy}
            className="flex-1 rounded-xl bg-brand py-3 text-sm font-semibold text-white transition-all duration-150 hover:bg-brand-dark active:scale-[0.97] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Submit review"}
          </button>
        </div>
      </div>
    </div>
  );
}
