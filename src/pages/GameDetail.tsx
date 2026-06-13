import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { Game } from "../types";
import {
  deleteGame,
  getGame,
  isInGame,
  isOnWaitlist,
  joinGame,
  leaveGame,
  spotsLeft,
  subscribe,
  toggleInterested,
} from "../services/gamesService";
import { useProfile } from "../hooks/useProfile";
import { useAuth } from "../auth/AuthContext";
import { formatDate, formatTime, relativeDay } from "../lib/format";
import { SkillBadge, SpotsBadge, TypeBadge } from "../components/Badges";

export default function GameDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useProfile();
  const { user } = useAuth();
  const [game, setGame] = useState<Game | undefined | null>(undefined);
  const [shareMsg, setShareMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const refresh = () => getGame(id).then((g) => setGame(g ?? null));
    refresh();
    return subscribe(refresh);
  }, [id]);

  if (game === undefined) {
    return <p className="py-10 text-center text-sm text-slate-400">Loading…</p>;
  }
  if (game === null) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-slate-500">This game no longer exists.</p>
        <button
          onClick={() => navigate("/")}
          className="mt-3 text-sm font-semibold text-slate-900 underline"
        >
          Back to browse
        </button>
      </div>
    );
  }

  const left = spotsLeft(game);
  const joined = isInGame(game, me.id);
  const waiting = isOnWaitlist(game, me.id);
  const isHost = game.hostId === me.id;
  const interested = game.interestedIds.includes(me.id);

  // Run an action, but bounce guests to sign-in first (remembering this page).
  const guarded = (fn: () => Promise<unknown>) => async () => {
    if (!user) {
      navigate("/auth", { state: { from: location.pathname } });
      return;
    }
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  const handleJoin = guarded(() => joinGame(game.id));
  const handleLeave = guarded(() => leaveGame(game.id));
  const handleInterested = guarded(() => toggleInterested(game.id));

  const handleShare = async () => {
    const text = `${game.title} — ${formatDate(game.date)} at ${formatTime(
      game.time
    )}, ${game.location}. ${left} spots left! Join us on SetMatch.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: game.title, text });
      } else {
        await navigator.clipboard.writeText(text);
        setShareMsg("Copied invite to clipboard ✓");
        setTimeout(() => setShareMsg(""), 2500);
      }
    } catch {
      /* user cancelled share */
    }
  };

  const handleDelete = () => {
    if (confirm("Delete this game? This can't be undone.")) {
      deleteGame(game.id)
        .then(() => navigate("/my-games"))
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Could not delete game.")
        );
    }
  };

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        ← Back
      </button>

      <div className="mb-3 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-900">
          {game.title}
        </h1>
        <span className="shrink-0 rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500">
          {relativeDay(game.date)}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <TypeBadge type={game.type} />
        <SkillBadge skill={game.skill} />
        <SpotsBadge left={left} total={game.totalSlots} />
      </div>

      {/* Info card */}
      <div className="mb-4 space-y-2 rounded-2xl border border-slate-100 bg-white p-4 text-sm text-slate-700 shadow-sm">
        <InfoRow icon="📅" label="When">
          {formatDate(game.date)} · {formatTime(game.time)}
        </InfoRow>
        <InfoRow icon="📍" label="Where">
          {game.location}
          <span className="text-slate-400"> · {game.area}</span>
        </InfoRow>
        <InfoRow icon="👤" label="Host">
          {game.hostName}
        </InfoRow>
        {game.notes && (
          <InfoRow icon="📝" label="Notes">
            {game.notes}
          </InfoRow>
        )}
      </div>

      {/* Roster */}
      <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">
          Roster ({game.players.length}/{game.totalSlots})
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {game.players.map((p) => (
            <span
              key={p.id}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                p.id === me.id
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {p.id === game.hostId && "⭐ "}
              {p.name}
              {p.id === me.id && " (you)"}
            </span>
          ))}
          {Array.from({ length: left }).map((_, i) => (
            <span
              key={`open-${i}`}
              className="rounded-full border border-dashed border-slate-200 px-2.5 py-1 text-xs text-slate-400"
            >
              open
            </span>
          ))}
        </div>

        {game.waitlist.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Waitlist ({game.waitlist.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {game.waitlist.map((p, i) => (
                <span
                  key={p.id}
                  className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
                >
                  {i + 1}. {p.name}
                  {p.id === me.id && " (you)"}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {shareMsg && (
        <p className="mb-2 text-center text-sm font-medium text-emerald-600">
          {shareMsg}
        </p>
      )}
      {error && (
        <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-center text-sm text-rose-600">
          {error}
        </p>
      )}

      {/* Primary action */}
      <div className="space-y-2">
        {!joined && !waiting && left > 0 && (
          <button
            onClick={handleJoin}
            className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Join game — claim 1 of {left} spots
          </button>
        )}
        {!joined && !waiting && left === 0 && (
          <button
            onClick={handleJoin}
            className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white transition hover:bg-amber-600"
          >
            Game full — join waitlist
          </button>
        )}
        {(joined || waiting) && !isHost && (
          <button
            onClick={handleLeave}
            className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {waiting ? "Leave waitlist" : "Leave game"}
          </button>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleInterested}
            className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${
              interested
                ? "border-rose-200 bg-rose-50 text-rose-600"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {interested ? "★ Interested" : "☆ Interested"}
            {game.interestedIds.length > 0 && ` (${game.interestedIds.length})`}
          </button>
          <button
            onClick={handleShare}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Share invite
          </button>
        </div>

        {isHost && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <button
              onClick={() => navigate(`/game/${game.id}/edit`)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Edit game
            </button>
            <button
              onClick={handleDelete}
              className="w-full py-2 text-sm font-medium text-rose-500 hover:text-rose-600"
            >
              Delete game
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <span aria-hidden>{icon}</span>
      <div>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {label}
        </span>
        <div>{children}</div>
      </div>
    </div>
  );
}
