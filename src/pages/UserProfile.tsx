import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { UserProfile as Profile } from "../types";
import { getUserProfile, blockUser, unblockUser } from "../services/gamesService";
import { useProfile } from "../hooks/useProfile";
import { isInGame } from "../services/gamesService";
import GameCard from "../components/GameCard";
import { SkillBadge, RatingHero, RatingEmpty } from "../components/Badges";
import { Spinner } from "../components/Skeleton";

const POSITION_ABBR: Record<string, string> = {
  "Setter": "SET",
  "Outside Hitter": "OH",
  "Middle Blocker": "MB",
  "Opposite": "OPP",
  "Libero": "LIB",
  "Defensive Specialist": "DS",
};

function memberSince(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function UserProfile() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const me = useProfile();
  const [profile, setProfile] = useState<Profile | undefined | null>(undefined);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let active = true;
    getUserProfile(id)
      .then((p) => {
        if (!active) return;
        setProfile(p);
        setBlocked(!!p.blocked);
      })
      .catch(() => active && setProfile(null));
    return () => {
      active = false;
    };
  }, [id]);

  const toggleBlock = async () => {
    if (!profile) return;
    const next = !blocked;
    setBlocked(next);
    try {
      if (next) await blockUser(profile.id);
      else await unblockUser(profile.id);
    } catch {
      setBlocked(!next); // revert on failure
    }
  };

  if (profile === undefined) {
    return <Spinner />;
  }
  if (profile === null) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-slate-400">Player not found.</p>
        <button
          onClick={() => navigate("/")}
          className="mt-3 text-sm font-semibold text-white underline"
        >
          Back to browse
        </button>
      </div>
    );
  }

  const isMe = profile.id === me.id;
  const rating = profile.playerRating;

  // Show the player's own chosen banner (same logic as the Profile page).
  const bannerStyle = profile.bannerImage
    ? { backgroundImage: `url(${profile.bannerImage})`, backgroundSize: "cover", backgroundPosition: "center" }
    : profile.bannerColor
      ? { backgroundColor: profile.bannerColor }
      : undefined;
  const bannerCls = `h-24${!bannerStyle ? " bg-gradient-to-br from-brand to-sky-400" : ""}`;

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="mb-3 text-sm font-medium text-slate-400 hover:text-white"
      >
        ← Back
      </button>

      {/* Header card */}
      <div className="mb-4 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-sm">
        <div className={bannerCls} style={bannerStyle} />
        <div className="px-4 pb-5">
          {/* Avatar — centered, overlapping banner (z-10 keeps it above the banner) */}
          <div className="relative z-10 -mt-12 flex justify-center">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand text-3xl font-bold text-white ring-4 ring-slate-900">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.name} className="h-full w-full object-cover" />
              ) : (
                profile.name.charAt(0).toUpperCase()
              )}
            </div>
          </div>

          {/* Name + info — centered */}
          <div className="mt-3 text-center">
            <p className="text-xl font-bold text-white">
              {profile.name}
              {isMe && <span className="ml-1 text-sm font-normal text-slate-400">(you)</span>}
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
              <SkillBadge skill={profile.skill} size="lg" />
            </div>
            {(profile.ageDisplay || profile.genderDisplay) && (
              <p className="mt-1 text-xs text-slate-400">
                {[profile.ageDisplay ? `${profile.ageDisplay} yrs` : null, profile.genderDisplay].filter(Boolean).join(" · ")}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              Member since {memberSince(profile.memberSince)}
            </p>
          </div>

          {profile.bio && (
            <p className="mt-4 border-t border-slate-50 pt-4 text-sm leading-relaxed text-slate-300">
              {profile.bio}
            </p>
          )}

          {/* Player rating — always shown for a consistent ratings area */}
          <div className="mt-4">
            {rating && rating.count > 0 ? (
              <RatingHero avg={rating.avg ?? 0} count={rating.count} />
            ) : (
              <RatingEmpty />
            )}
          </div>

          {profile.favoritePositions && profile.favoritePositions.length > 0 && (
            <div className="mt-4 border-t border-slate-50 pt-4 text-center">
              <p className="mb-1.5 text-xs font-medium text-slate-400">Positions</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {profile.favoritePositions.map((p) => (
                  <span key={p} className="rounded-lg bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">{p}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-gradient-to-br from-brand/20 to-sky-500/10 p-3 text-center ring-1 ring-brand/25">
          <p className="text-2xl font-bold text-brand">{profile.gamesHosted}</p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-400">Hosted</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-sky-100/60 p-3 text-center ring-1 ring-sky-200/60">
          <p className="text-2xl font-bold text-sky-600">{profile.gamesPlayed}</p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-400">Joined</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/60 p-3 text-center ring-1 ring-emerald-200/60">
          <p className="text-2xl font-bold text-emerald-600">
            {profile.favoritePositions?.[0]
              ? (POSITION_ABBR[profile.favoritePositions[0]] ?? profile.favoritePositions[0].slice(0, 3).toUpperCase())
              : "—"}
          </p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-400">Position</p>
        </div>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-white">
        Upcoming games {isMe ? "you're" : `${profile.name} is`} hosting
      </h2>
      {profile.hostedUpcoming.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-700 bg-slate-800 py-8 text-center text-sm text-slate-400">
          No upcoming games hosted.
        </p>
      ) : (
        <div className="space-y-3">
          {profile.hostedUpcoming.map((g) => (
            <GameCard key={g.id} game={g} youAreIn={isInGame(g, me.id)} />
          ))}
        </div>
      )}

      {!isMe && (
        <div className="mt-6 border-t border-slate-800 pt-4 text-center">
          <button
            onClick={toggleBlock}
            className={`text-xs font-medium transition ${
              blocked
                ? "text-slate-400 hover:text-slate-200"
                : "text-slate-400 hover:text-rose-500"
            }`}
          >
            {blocked ? `Unblock ${profile.name}` : `Block ${profile.name}`}
          </button>
          {blocked && (
            <p className="mt-1 text-[11px] text-slate-400">
              You won't see their highlights or comments.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
