import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
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
import { formatDate, formatTime, formatTimeRange, isPast, relativeDay } from "../lib/format";
import { SkillBadge, SpotsBadge, TypeBadge } from "../components/Badges";
import GameComments from "../components/GameComments";
import { api } from "../lib/api";

export default function GameDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useProfile();
  const { user } = useAuth();
  const [game, setGame] = useState<Game | undefined | null>(undefined);
  const [shareMsg, setShareMsg] = useState("");
  const [error, setError] = useState("");
  const [ratables, setRatables] = useState<{ id: string; name: string; myRating: number | null }[] | null>(null);
  const [ratingMsg, setRatingMsg] = useState("");
  const [joinModal, setJoinModal] = useState<"preview" | "confirmed" | "waitlist" | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const refresh = () => getGame(id).then((g) => setGame(g ?? null));
    refresh();
    return subscribe(refresh);
  }, [id]);

  useEffect(() => {
    if (!game || !me.id || !isPast(game.date)) return;
    const wasPlayer = isInGame(game, me.id);
    if (!wasPlayer) return;
    api.get<typeof ratables>(`/games/${id}/ratables`)
      .then((data) => setRatables(data))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id, me.id]);

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

  const guarded = (fn: () => Promise<unknown>) => async () => {
    if (!user) { navigate("/auth", { state: { from: location.pathname } }); return; }
    setError("");
    try { await fn(); } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  const handleJoin = () => {
    if (!user) { navigate("/auth", { state: { from: location.pathname } }); return; }
    setJoinModal("preview");
  };

  const handleConfirmJoin = async () => {
    setError("");
    setJoining(true);
    const willBePlayer = left > 0;
    try {
      await joinGame(game.id);
      setJoinModal(willBePlayer ? "confirmed" : "waitlist");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setJoinModal(null);
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = guarded(() => leaveGame(game.id));
  const handleInterested = guarded(() => toggleInterested(game.id));

  const handleShare = async () => {
    const text = `${game.title} — ${formatDate(game.date)} at ${formatTime(
      game.time
    )}, ${game.location}. ${left} spots left! Join us on Coterie.`;
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

  function buildGCalUrl(g: Game): string {
    const [y, mo, d] = g.date.split("-").map(Number);
    const [sh, sm] = g.time.split(":").map(Number);
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (h: number, m: number) => `${y}${pad(mo)}${pad(d)}T${pad(h)}${pad(m)}00`;
    const start = fmt(sh, sm);
    const end = g.endTime
      ? (() => { const [eh, em] = g.endTime.split(":").map(Number); return fmt(eh, em); })()
      : fmt(sh + 2, sm);
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: g.title,
      dates: `${start}/${end}`,
      details: `Hosted by ${g.hostName}.${g.notes ? " " + g.notes : ""} ${window.location.origin}/game/${g.id}`,
      location: `${g.location}, ${g.area}`,
    });
    return `https://calendar.google.com/calendar/render?${params}`;
  }

  return (
    <div>
      {/* Join modal — preview ("are you sure?") and post-join confirmation */}
      {joinModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => { if (!joining) setJoinModal(null); }}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top notch */}
            <div className="flex justify-center pt-5 pb-2">
              <div className="h-9 w-9 rounded-full bg-slate-900" />
            </div>

            {joinModal === "preview" ? (
              <>
                {/* Heading */}
                <div className="px-8 pb-2 pt-3 text-center">
                  <h2 className="text-2xl font-bold leading-tight text-slate-900">Join this game?</h2>
                  <p className="mt-1.5 text-sm text-slate-500">
                    Review the details before claiming your spot.
                  </p>
                </div>
                {/* Divider */}
                <div className="mx-8 my-4 h-px bg-slate-100" />
                {/* Details */}
                <div className="space-y-3 px-8">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Game</span>
                    <span className="max-w-[65%] text-right text-sm font-semibold text-slate-800">{game.title}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Date</span>
                    <span className="text-right text-sm font-semibold text-slate-800">{formatDate(game.date)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Time</span>
                    <span className="text-right text-sm font-semibold text-slate-800">{formatTimeRange(game.time, game.endTime)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Location</span>
                    <span className="max-w-[60%] text-right text-sm font-semibold leading-snug text-slate-800">{game.location}</span>
                  </div>
                  {game.courtFee && (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Court fee</span>
                      <span className="text-sm font-semibold text-slate-800">{game.courtFee}</span>
                    </div>
                  )}
                </div>
                {game.notes && (
                  <div className="mx-8 mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
                    {game.notes}
                  </div>
                )}
                {/* Actions */}
                <div className="space-y-2 px-8 pb-2 pt-5">
                  <button
                    onClick={handleConfirmJoin}
                    disabled={joining}
                    className="w-full rounded-2xl bg-brand py-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
                  >
                    {joining ? "Joining…" : left > 0 ? "Yes, join game" : "Yes, join waitlist"}
                  </button>
                  <button
                    onClick={() => setJoinModal(null)}
                    disabled={joining}
                    className="w-full rounded-2xl border border-slate-200 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Checkmark */}
                <div className="flex justify-center py-3">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-full text-3xl text-white ${joinModal === "confirmed" ? "bg-brand" : "bg-amber-500"}`}>
                    ✓
                  </div>
                </div>
                {/* Heading */}
                <div className="px-8 pb-2 text-center">
                  <h2 className="text-3xl font-bold leading-tight text-slate-900">
                    {joinModal === "confirmed" ? "You're In!" : "You're on the List!"}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {joinModal === "confirmed"
                      ? <>Your spot for <strong className="text-slate-700">{game.title}</strong> is confirmed.</>
                      : <>You're on the waitlist for <strong className="text-slate-700">{game.title}</strong>. We'll notify you if a spot opens.</>}
                  </p>
                </div>
                {/* Divider */}
                <div className="mx-8 my-4 h-px bg-slate-100" />
                {/* Details */}
                <div className="space-y-3 px-8">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Date</span>
                    <span className="text-right text-sm font-semibold text-slate-800">{formatDate(game.date)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Time</span>
                    <span className="text-right text-sm font-semibold text-slate-800">{formatTimeRange(game.time, game.endTime)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Location</span>
                    <span className="max-w-[60%] text-right text-sm font-semibold leading-snug text-slate-800">{game.location}</span>
                  </div>
                  {game.courtFee && (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Court fee</span>
                      <span className="text-sm font-semibold text-slate-800">{game.courtFee}</span>
                    </div>
                  )}
                </div>
                {game.notes && (
                  <div className="mx-8 mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
                    {game.notes}
                  </div>
                )}
                {/* Actions */}
                <div className="space-y-2 px-8 pb-2 pt-5">
                  {joinModal === "confirmed" && (
                    <a
                      href={buildGCalUrl(game)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full rounded-2xl bg-brand py-3.5 text-center text-sm font-semibold text-white transition hover:bg-brand-dark"
                    >
                      Add to Google Calendar
                    </a>
                  )}
                  <button
                    onClick={() => setJoinModal(null)}
                    className="block w-full rounded-2xl border border-slate-200 py-3 text-center text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Done
                  </button>
                </div>
              </>
            )}

            <p className="py-5 text-center text-[11px] font-semibold uppercase tracking-widest text-slate-300">
              Coterie
            </p>
          </div>
        </div>
      )}

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
          {formatDate(game.date)} · {formatTimeRange(game.time, game.endTime)}
        </InfoRow>
        <InfoRow icon="📍" label="Where">
          {game.location}
          <span className="text-slate-400"> · {game.area}</span>
        </InfoRow>
        <InfoRow icon="👤" label="Host">
          <Link
            to={`/user/${game.hostId}`}
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            {game.hostName}
          </Link>
        </InfoRow>
        {game.gender !== "Open" && (
          <InfoRow icon="👥" label="Gender">
            {game.gender === "Men" ? "Men's" : game.gender === "Women" ? "Women's" : game.gender}
          </InfoRow>
        )}
        {game.netHeight && game.netHeight !== "Venue Standard" && (
          <InfoRow icon="🏐" label="Net height">
            {game.netHeight}
          </InfoRow>
        )}
        {game.rotationType && game.rotationType !== "Standard" && (
          <InfoRow icon="🔄" label="Rotation">
            {game.rotationType}
          </InfoRow>
        )}
        {game.positionsNeeded && game.positionsNeeded.length > 0 && (
          <InfoRow icon="🎯" label="Positions needed">
            {game.positionsNeeded.join(", ")}
          </InfoRow>
        )}
        {game.courtFee && (
          <InfoRow icon="💰" label="Court fee">
            {game.courtFee}
          </InfoRow>
        )}
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
            <Link
              key={p.id}
              to={`/user/${p.id}`}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition hover:opacity-80 ${
                p.id === me.id
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {p.id === game.hostId && "⭐ "}
              {p.name}
              {p.id === me.id && " (you)"}
            </Link>
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
            className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
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

      {/* Rate teammates (only shown after game ends, only for confirmed players) */}
      {ratables && ratables.length > 0 && (
        <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Rate your teammates</h2>
          <p className="mb-3 text-xs text-slate-400">Ratings are anonymous and averaged on each player's profile.</p>
          {ratingMsg && <p className="mb-2 text-xs font-medium text-emerald-600">{ratingMsg}</p>}
          <div className="space-y-3">
            {ratables.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3">
                <Link to={`/user/${r.id}`} className="text-sm font-medium text-slate-700 hover:underline truncate">
                  {r.name}
                </Link>
                <div className="flex shrink-0 gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => {
                        api.post(`/games/${id}/rate/${r.id}`, { rating: star })
                          .then(() => {
                            setRatables((prev) =>
                              prev ? prev.map((p) => p.id === r.id ? { ...p, myRating: star } : p) : prev
                            );
                            setRatingMsg("Rating saved!");
                            setTimeout(() => setRatingMsg(""), 2000);
                          })
                          .catch(() => {});
                      }}
                      className={`text-lg leading-none transition ${
                        r.myRating !== null && star <= r.myRating ? "text-amber-400" : "text-slate-200 hover:text-amber-300"
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Discussion thread */}
      <GameComments gameId={game.id} hostId={game.hostId} />
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
