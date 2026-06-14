import { useEffect, useState } from "react";
import type { Game } from "../types";
import { getPendingReviews } from "../services/gamesService";
import ReviewModal from "./ReviewModal";

export default function ReviewPrompt() {
  const [queue, setQueue] = useState<Game[]>([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Check once on mount, slight delay so the page loads first.
    const t = setTimeout(() => {
      getPendingReviews()
        .then((games) => setQueue(games))
        .catch(() => {})
        .finally(() => setChecked(true));
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  if (!checked || queue.length === 0) return null;

  const game = queue[0];

  function dismiss() {
    setQueue((prev) => prev.slice(1));
  }

  return <ReviewModal game={game} onDone={dismiss} />;
}
