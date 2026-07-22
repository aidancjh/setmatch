import { Link } from "react-router-dom";
import { useGames } from "../hooks/useGames";
import { useProfile } from "../hooks/useProfile";
import { isInGame } from "../services/gamesService";
import { isPast } from "../lib/format";
import GameCard from "../components/GameCard";
import { GameCardSkeleton } from "../components/Skeleton";
import { StarIcon } from "../components/icons";

/** Games the user starred with the "Interested" button — upcoming first. */
export default function Interested() {
  const { games, loading, error, reload } = useGames();
  const me = useProfile();

  const starred = games
    .filter((g) => g.interestedIds.includes(me.id))
    .sort((a, b) => {
      // upcoming before past, then soonest first
      const aPast = isPast(a.date) ? 1 : 0;
      const bPast = isPast(b.date) ? 1 : 0;
      if (aPast !== bPast) return aPast - bPast;
      return (a.date + a.time).localeCompare(b.date + b.time);
    });

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-white">Interested</h1>
        <p className="text-sm text-slate-400">
          Games you starred so you don't lose track of them.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <GameCardSkeleton />
          <GameCardSkeleton />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800 py-12 text-center">
          <p className="text-sm text-rose-600">{error}</p>
          <button
            onClick={reload}
            className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      ) : starred.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800 py-12 text-center">
          <StarIcon className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
          <p className="mt-2 text-sm text-slate-400">
            Nothing starred yet — tap "Interested" on a game to keep it here.
          </p>
          <Link
            to="/"
            className="mt-3 inline-block rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Browse games
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {starred.map((g) => (
            <GameCard key={g.id} game={g} youAreIn={isInGame(g, me.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
