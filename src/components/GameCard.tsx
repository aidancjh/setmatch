import { Link } from "react-router-dom";
import type { Game } from "../types";
import { spotsLeft } from "../services/gamesService";
import { formatDate, formatTime, relativeDay } from "../lib/format";
import { SkillBadge, SpotsBadge, TypeBadge } from "./Badges";

export default function GameCard({
  game,
  youAreIn,
}: {
  game: Game;
  youAreIn?: boolean;
}) {
  const left = spotsLeft(game);
  const fillPct = Math.round((game.players.length / game.totalSlots) * 100);

  return (
    <Link
      to={`/game/${game.id}`}
      className="block rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-slate-200 hover:shadow"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="font-semibold leading-tight text-slate-900">
          {game.title}
          {youAreIn && (
            <span className="ml-2 align-middle text-xs font-medium text-emerald-600">
              ● You're in
            </span>
          )}
        </h3>
        <span className="shrink-0 rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500">
          {relativeDay(game.date)}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <TypeBadge type={game.type} />
        <SkillBadge skill={game.skill} />
      </div>

      <dl className="space-y-1 text-sm text-slate-600">
        <div className="flex items-center gap-1.5">
          <span aria-hidden>📅</span>
          {formatDate(game.date)} · {formatTime(game.time)}
        </div>
        <div className="flex items-center gap-1.5">
          <span aria-hidden>📍</span>
          {game.location}
          <span className="text-slate-400">· {game.area}</span>
        </div>
      </dl>

      {/* Fill bar */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <SpotsBadge left={left} total={game.totalSlots} />
          <span className="text-xs text-slate-400">
            hosted by {game.hostName}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${
              left === 0
                ? "bg-slate-400"
                : left <= 2
                ? "bg-rose-400"
                : "bg-emerald-400"
            }`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>
    </Link>
  );
}
