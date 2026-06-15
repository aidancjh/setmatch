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
  setMemberPaid,
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
  const [joinError, setJoinError] = useState("");
  const [leaveModal, setLeaveModal] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState("");

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
  const past = isPast(game.date);

  const guarded = (fn: () => Promise<unknown>) => async () => {
    if (!user) { navigate("/auth", { state: { from: location.pathname } }); return; }
    setError("");
    try { await fn(); } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  const handleJoin = () => {
    if (!user) { navigate("/auth", { state: { from: location.pathname } }); return; }
    setJoinError("");
    setJoinModal("preview");
  };

  const handleConfirmJoin = async () => {
    setJoinError("");
    setJoining(true);
    const willBePlayer = left > 0;
    try {
      await joinGame(game.id);
      setJoinModal(willBePlayer ? "confirmed" : "waitlist");
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = () => setLeaveModal(true);

  const handleConfirmLeave = async () => {
    setLeaveError("");
    setLeaving(true);
    try {
      await leaveGame(game.id);
      setLeaveModal(false);
    } catch (err) {
      setLeaveError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLeaving(false);
    }
  };
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

  return (
    <div>
      {/* Join modal — preview ("are you sure?") and post-join confirmation */}
      {joinModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => { if (!joining) setJoinModal(null); }}
        >
          <div
            className="animate-pop-in w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {joinModal === "preview" ? (
              <>
                {/* Heading */}
                <div className="px-8 pb-2 pt-7 text-center">
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
                  {joinError && (
                    <p className="rounded-xl bg-rose-50 px-3 py-2 text-center text-xs text-rose-600">
                      {joinError}
                    </p>
                  )}
                  <button
                    onClick={handleConfirmJoin}
                    disabled={joining}
                    className="w-full rounded-2xl bg-brand py-3.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-brand-dark active:scale-[0.97] disabled:opacity-60"
                  >
                    {joining ? "Joining…" : joinError ? "Try again" : left > 0 ? "Yes, join game" : "Yes, join waitlist"}
                  </button>
                  <button
                    onClick={() => setJoinModal(null)}
                    disabled={joining}
                    className="w-full rounded-2xl border border-slate-200 py-3 text-sm font-medium text-slate-600 transition-all duration-150 hover:bg-slate-50 active:scale-[0.97] disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Checkmark */}
                <div className="flex justify-center pt-7 pb-3">
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
                <div className="px-8 pb-2 pt-5">
                  <button
                    onClick={() => setJoinModal(null)}
                    className="block w-full rounded-2xl bg-brand py-3.5 text-center text-sm font-semibold text-white transition hover:bg-brand-dark"
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

      {/* Leave confirmation modal */}
      {leaveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => { if (!leaving) setLeaveModal(false); }}
        >
          <div
            className="animate-pop-in w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-8 pb-2 pt-7 text-center">
              <h2 className="text-2xl font-bold leading-tight text-slate-900">
                {waiting ? "Leave waitlist?" : "Leave this game?"}
              </h2>
              <p className="mt-1.5 text-sm text-slate-500">
                {waiting
                  ? "You'll lose your waitlist position."
                  : "Your spot will open up for someone else."}
              </p>
            </div>
            <div className="mx-8 my-4 h-px bg-slate-100" />
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
            </div>
            <div className="space-y-2 px-8 pb-2 pt-5">
              {leaveError && (
                <p className="rounded-xl bg-rose-50 px-3 py-2 text-center text-xs text-rose-600">
                  {leaveError}
                </p>
              )}
              <button
                onClick={handleConfirmLeave}
                disabled={leaving}
                className="w-full rounded-2xl bg-rose-500 py-3.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-rose-600 active:scale-[0.97] disabled:opacity-60"
              >
                {leaving ? "Leaving…" : leaveError ? "Try again" : waiting ? "Yes, leave waitlist" : "Yes, leave game"}
              </button>
              <button
                onClick={() => setLeaveModal(false)}
                disabled={leaving}
                className="w-full rounded-2xl border border-slate-200 py-3 text-sm font-medium text-slate-600 transition-all duration-150 hover:bg-slate-50 active:scale-[0.97] disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
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

      {/* Cost split — shown when the host set a total court cost */}
      {game.courtCost > 0 && game.players.length > 0 && (
        <CostSplit
          game={game}
          meId={me.id}
          isHost={isHost}
          onError={(msg) => setError(msg)}
        />
      )}

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
        {past ? (
          <p className="rounded-xl bg-slate-100 py-3 text-center text-sm font-medium text-slate-500">
            This game has already taken place.
          </p>
        ) : (
          <>
            {!joined && !waiting && left > 0 && (
              <button
                onClick={handleJoin}
                className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white transition-all duration-150 hover:bg-brand-dark active:scale-[0.97] active:opacity-90"
              >
                Join game — claim 1 of {left} spots
              </button>
            )}
            {!joined && !waiting && left === 0 && (
              <button
                onClick={handleJoin}
                className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white transition-all duration-150 hover:bg-amber-600 active:scale-[0.97] active:opacity-90"
              >
                Game full — join waitlist
              </button>
            )}
            {(joined || waiting) && !isHost && (
              <button
                onClick={handleLeave}
                className="w-full rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-rose-600 active:scale-[0.97] active:opacity-90"
              >
                {waiting ? "Leave waitlist" : "Leave game"}
              </button>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleInterested}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all duration-150 active:scale-[0.97] ${
                  interested
                    ? "bg-brand text-white shadow-sm hover:bg-brand-dark"
                    : "border border-brand/40 bg-brand/5 text-brand hover:bg-brand/10"
                }`}
              >
                {interested ? "★ Interested" : "☆ Interested"}
                {game.interestedIds.length > 0 && ` (${game.interestedIds.length})`}
              </button>
              <button
                onClick={handleShare}
                className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-brand-dark active:scale-[0.97]"
              >
                Share invite
              </button>
            </div>
          </>
        )}

        {(joined || isHost) && (
          <button
            onClick={() => navigate(`/chats/${game.id}`)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand/40 bg-brand/5 py-2.5 text-sm font-semibold text-brand transition-all duration-150 hover:bg-brand/10 active:scale-[0.97]"
          >
            💬 Open group chat
          </button>
        )}

        {isHost && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <button
              onClick={() => navigate(`/game/${game.id}/edit`)}
              className="w-full rounded-xl border border-brand/40 bg-brand/5 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand/10 active:scale-[0.98]"
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
                <div className="flex shrink-0 gap-1.5">
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
                      className={`text-2xl leading-none transition active:scale-90 ${
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

function CostSplit({
  game,
  meId,
  isHost,
  onError,
}: {
  game: Game;
  meId: string;
  isHost: boolean;
  onError: (msg: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const share = game.courtCost / game.players.length;
  const paidCount = game.players.filter((p) => p.paid).length;
  const collected = share * paidCount;

  const fmt = (n: number) =>
    `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const toggle = async (p: { id: string; paid?: boolean }) => {
    setBusyId(p.id);
    onError("");
    try {
      await setMemberPaid(game.id, p.id, !p.paid);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't update payment.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Cost split</h2>
        <span className="text-xs text-slate-400">
          {fmt(collected)} of {fmt(game.courtCost)} collected
        </span>
      </div>

      <div className="mb-3 flex items-center justify-between rounded-xl bg-brand/5 px-3 py-2.5">
        <span className="text-sm text-slate-600">
          {fmt(game.courtCost)} ÷ {game.players.length} player
          {game.players.length === 1 ? "" : "s"}
        </span>
        <span className="text-lg font-bold text-brand">{fmt(share)} each</span>
      </div>

      <ul className="space-y-1.5">
        {game.players.map((p) => {
          const canToggle = isHost || p.id === meId;
          return (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-lg px-1 py-1"
            >
              <span className="truncate text-sm text-slate-700">
                {p.id === game.hostId && "⭐ "}
                {p.name}
                {p.id === meId && " (you)"}
              </span>
              {canToggle ? (
                <button
                  onClick={() => toggle(p)}
                  disabled={busyId === p.id}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition active:scale-95 disabled:opacity-50 ${
                    p.paid
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {p.paid ? "✓ Paid" : "Mark paid"}
                </button>
              ) : (
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                    p.paid ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {p.paid ? "✓ Paid" : "Unpaid"}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {isHost && (
        <p className="mt-3 text-xs text-slate-400">
          Tap a player to mark them paid. Players can also mark themselves.
        </p>
      )}
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
