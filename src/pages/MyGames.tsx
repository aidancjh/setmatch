import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGames } from "../hooks/useGames";
import { useProfile } from "../hooks/useProfile";
import { isInGame, isOnWaitlist } from "../services/gamesService";
import { isPast } from "../lib/format";
import GameCard from "../components/GameCard";

type Tab = "upcoming" | "hosting" | "past";

export default function MyGames() {
  const { games } = useGames();
  const me = useProfile();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("upcoming");

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

      {filtered.length === 0 ? (
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
          {filtered.map((g) => (
            <GameCard key={g.id} game={g} youAreIn={isInGame(g, me.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
