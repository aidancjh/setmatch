import { useRef, useState } from "react";
import type { Game } from "../types";
import { submitReview } from "../services/gamesService";
import { formatDate, formatTime } from "../lib/format";
import ErrorModal from "./ErrorModal";

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
          <span className={(hover || value) >= n ? "text-amber-400" : "text-slate-600"}>
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
  const [invalidField, setInvalidField] = useState<"rating" | "comment" | null>(null);
  const starsRef = useRef<HTMLDivElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  function focusInvalid(field: "rating" | "comment") {
    setInvalidField(field);
    const ref = field === "rating" ? starsRef : commentRef;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    ref.current?.focus({ preventScroll: true });
  }

  function handleRatingChange(v: number) {
    setRating(v);
    if (invalidField === "rating") setInvalidField(null);
  }

  async function handleSubmit() {
    if (rating === 0) {
      setError("Please tap a star to rate the game.");
      focusInvalid("rating");
      return;
    }
    if (!comment.trim()) {
      setError("Please leave a comment before submitting.");
      focusInvalid("comment");
      return;
    }
    setBusy(true);
    setError("");
    setInvalidField(null);
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
      <div className="animate-pop-in w-full max-w-md rounded-2xl bg-slate-900 p-6 shadow-xl">
        {/* Header */}
        <div className="mb-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">
            How was it?
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">{game.title}</h2>
          <p className="text-sm text-slate-400">
            {formatDate(game.date)} · {formatTime(game.time)} · hosted by {game.hostName}
          </p>
        </div>

        {/* Star rating */}
        <div
          ref={starsRef}
          tabIndex={-1}
          className={`mb-2 flex flex-col items-center gap-2 rounded-xl p-1 outline-none ${
            invalidField === "rating" ? "ring-2 ring-rose-500" : ""
          }`}
        >
          <Stars value={rating} onChange={handleRatingChange} />
          <p className="h-5 text-sm font-semibold text-amber-500">
            {rating > 0 ? ratingLabel[rating] : "Tap to rate"}
          </p>
        </div>

        {/* Comment */}
        <textarea
          ref={commentRef}
          value={comment}
          onChange={(e) => {
            setComment(e.target.value.slice(0, 500));
            if (invalidField === "comment") setInvalidField(null);
          }}
          placeholder="Leave a comment for the host… (required)"
          rows={3}
          className={`mt-3 w-full resize-none rounded-xl border bg-slate-900 px-3 py-2.5 text-sm outline-none focus:border-slate-400 ${
            invalidField === "comment" ? "border-rose-500" : "border-slate-700"
          }`}
        />
        <p className="mt-0.5 text-right text-xs text-slate-400">{comment.length}/500</p>

        {error && <ErrorModal message={error} onClose={() => setError("")} />}

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onDone}
            className="flex-1 rounded-xl border border-slate-700 py-3 text-sm font-semibold text-slate-400 transition-all duration-150 hover:bg-slate-800 active:scale-[0.97]"
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
