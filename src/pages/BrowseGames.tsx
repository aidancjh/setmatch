import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGames } from "../hooks/useGames";
import { useProfile } from "../hooks/useProfile";
import { isInGame, spotsLeft } from "../services/gamesService";
import { isPast } from "../lib/format";
import type { GameType, SkillLevel } from "../types";
import GameCard from "../components/GameCard";
import { GameCardSkeleton } from "../components/Skeleton";

const skillFilters: (SkillLevel | "Any")[] = [
  "Any",
  "Beginner",
  "Intermediate",
  "Advanced",
  "All Levels",
];
const typeFilters: (GameType | "Any")[] = ["Any", "Indoor", "Beach", "Grass"];

export default function BrowseGames() {
  const { games, loading, slow, error, reload } = useGames();
  const me = useProfile();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [skill, setSkill] = useState<SkillLevel | "Any">("Any");
  const [type, setType] = useState<GameType | "Any">("Any");
  const [onlyOpen, setOnlyOpen] = useState(false);

  const visible = useMemo(() => {
    return games
      .filter((g) => !isPast(g.date))
      .filter((g) => (skill === "Any" ? true : g.skill === skill))
      .filter((g) => (type === "Any" ? true : g.type === type))
      .filter((g) => (onlyOpen ? spotsLeft(g) > 0 : true))
      .filter((g) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          g.title.toLowerCase().includes(q) ||
          g.location.toLowerCase().includes(q) ||
          g.area.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }, [games, search, skill, type, onlyOpen]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Find a game
        </h1>
        <p className="text-sm text-slate-500">
          Open volleyball games near you that still need players.
        </p>
      </div>

      {/* Search */}
      <div className="mb-3">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <span className="text-slate-400" aria-hidden>
            🔍
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by area, venue, or title…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
        <FilterChips
          options={typeFilters}
          value={type}
          onChange={(v) => setType(v as GameType | "Any")}
        />
      </div>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <FilterChips
          options={skillFilters}
          value={skill}
          onChange={(v) => setSkill(v as SkillLevel | "Any")}
        />
      </div>
      <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={onlyOpen}
          onChange={(e) => setOnlyOpen(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Only games with open spots
      </label>

      {/* Results */}
      {loading ? (
        <div className="space-y-3">
          {slow && (
            <p className="text-center text-xs text-slate-400">
              ⏳ Waking up the server — hang tight…
            </p>
          )}
          <GameCardSkeleton />
          <GameCardSkeleton />
          <GameCardSkeleton />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50 py-12 text-center">
          <p className="text-sm text-rose-600">{error}</p>
          <button
            onClick={reload}
            className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
          <p className="text-sm text-slate-500">No games match your filters.</p>
          <button
            onClick={() => navigate("/create")}
            className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Post your own game
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {visible.length} game{visible.length === 1 ? "" : "s"}
          </p>
          {visible.map((g) => (
            <GameCard key={g.id} game={g} youAreIn={isInGame(g, me.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChips({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium transition ${
            value === o
              ? "bg-brand text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {o}
        </button>
      ))}
    </>
  );
}
