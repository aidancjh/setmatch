import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGames } from "../hooks/useGames";
import { useProfile } from "../hooks/useProfile";
import { isInGame, isOnWaitlist, getPendingReviews } from "../services/gamesService";
import { isPast } from "../lib/format";
import GameCard from "../components/GameCard";
import ReviewModal from "../components/ReviewModal";
import { GameCardSkeleton } from "../components/Skeleton";
import type { Game } from "../types";

type Tab = "upcoming" | "hosting" | "past";

export default function MyGames() {
  const { games, loading, error, reload } = useGames();
  const me = useProfile();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [reviewGame, setReviewGame] = useState<Game | null>(null);

  useEffect(() => {
    getPendingReviews()
      .then((games) => setPendingIds(new Set(games.map((g) => g.id))))
      .catch(() => {});
  }, []);

  const mine = useMemo(
    () =>
      games.filter(
        (g) => isInGame(g, me.id) || isOnWaitlist(g, me.id) || g.hostId === me.id
      ),
    [games, me.id]
  );

  const filtered = useMemo(() => {
    const sorted = [...mine].sort((a, b) =>
      (a.date + a.time).localeCompare(b.date + b.time)
    );
    if (tab === "hosting") return sorted.filter((g) => g.hostId === me.id);
    if (tab === "past") return sorted.filter((g) => isPast(g.date)).reverse();
    return sorted.filter((g) => !isPast(g.date));
  }, [mine, tab, me.id]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "upcoming", label: "Upcoming" },
    { key: "hosting", label: "Hosting" },
    { key: "past", label: "Past" },
  ];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">
        My games
      </h1>
      <p className="mb-4 text-sm text-slate-500">
        Games you're hosting, joined, or waitlisted for.
      </p>

      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${
              tab === t.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          <GameCardSkeleton />
          <GameCardSkeleton />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50 py-12 text-center">
          <p className="text-sm text-rose-600">Couldn't load your games.</p>
          <button
            onClick={reload}
            className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
          <p className="text-sm text-slate-500">
            {tab === "hosting"
              ? "You're not hosting any games yet."
              : tab === "past"
              ? "No past games."
              : "You haven't joined any upcoming games."}
          </p>
          <button
            onClick={() => navigate(tab === "hosting" ? "/create" : "/")}
            className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            {tab === "hosting" ? "Post a game" : "Browse games"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((g) => {
            const canReview = tab === "past" && g.hostId !== me.id && pendingIds.has(g.id);
            return (
              <div key={g.id} className="relative">
                <GameCard game={g} youAreIn={isInGame(g, me.id)} />
                {canReview && (
                  <button
                    onClick={() => setReviewGame(g)}
                    className="absolute right-3 top-3 z-10 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-600 active:scale-95"
                  >
                    Review
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {reviewGame && (
        <ReviewModal
          game={reviewGame}
          onDone={() => {
            setPendingIds((prev) => {
              const next = new Set(prev);
              next.delete(reviewGame.id);
              return next;
            });
            setReviewGame(null);
          }}
        />
      )}
    </div>
  );
}
