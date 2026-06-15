import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { UserProfile as Profile } from "../types";
import { getUserProfile } from "../services/gamesService";
import { useProfile } from "../hooks/useProfile";
import { isInGame } from "../services/gamesService";
import GameCard from "../components/GameCard";
import { SkillBadge, RatingHero } from "../components/Badges";

function memberSince(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function UserProfile() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const me = useProfile();
  const [profile, setProfile] = useState<Profile | undefined | null>(undefined);

  useEffect(() => {
    let active = true;
    getUserProfile(id)
      .then((p) => active && setProfile(p))
      .catch(() => active && setProfile(null));
    return () => {
      active = false;
    };
  }, [id]);

  if (profile === undefined) {
    return <p className="py-10 text-center text-sm text-slate-400">Loading…</p>;
  }
  if (profile === null) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-slate-500">Player not found.</p>
        <button
          onClick={() => navigate("/")}
          className="mt-3 text-sm font-semibold text-slate-900 underline"
        >
          Back to browse
        </button>
      </div>
    );
  }

  const isMe = profile.id === me.id;
  const rating = profile.playerRating;

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="mb-3 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        ← Back
      </button>

      {/* Header card with gradient banner */}
      <div className="mb-4 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
        <div className="h-24 bg-gradient-to-br from-brand to-orange-400" />
        <div className="px-4 pb-4">
          <div className="-mt-12 flex items-end gap-3">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand text-3xl font-bold text-white ring-4 ring-white">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.name} className="h-full w-full object-cover" />
              ) : (
                profile.name.charAt(0).toUpperCase()
              )}
            </div>
          </div>

          <div className="mt-3">
            <p className="truncate text-xl font-bold text-slate-900">
              {profile.name}
              {isMe && <span className="ml-1 text-sm font-normal text-slate-400">(you)</span>}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <SkillBadge skill={profile.skill} />
              {profile.homeArea && (
                <span className="text-xs text-slate-400">📍 {profile.homeArea}</span>
              )}
            </div>
            {(profile.ageDisplay || profile.genderDisplay) && (
              <p className="mt-1 text-xs text-slate-500">
                {[profile.ageDisplay ? `${profile.ageDisplay} yrs` : null, profile.genderDisplay].filter(Boolean).join(" · ")}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              Member since {memberSince(profile.memberSince)}
            </p>
          </div>

          {profile.bio && (
            <p className="mt-3 border-t border-slate-50 pt-3 text-sm leading-relaxed text-slate-600">
              {profile.bio}
            </p>
          )}

          {rating && rating.count > 0 && (
            <div className="mt-4">
              <RatingHero avg={rating.avg ?? 0} count={rating.count} />
            </div>
          )}

          {profile.favoritePositions && profile.favoritePositions.length > 0 && (
            <div className="mt-3 border-t border-slate-50 pt-3">
              <p className="mb-1.5 text-xs font-medium text-slate-400">Positions</p>
              <div className="flex flex-wrap gap-1.5">
                {profile.favoritePositions.map((p) => (
                  <span key={p} className="rounded-lg bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">{p}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-brand/10 to-orange-100/60 p-4 text-center ring-1 ring-brand/15">
          <p className="text-2xl font-bold text-brand">{profile.gamesHosted}</p>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Hosted
          </p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-sky-100/60 p-4 text-center ring-1 ring-sky-200/60">
          <p className="text-2xl font-bold text-sky-600">{profile.gamesPlayed}</p>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Joined
          </p>
        </div>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-slate-900">
        Upcoming games {isMe ? "you're" : `${profile.name} is`} hosting
      </h2>
      {profile.hostedUpcoming.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-400">
          No upcoming games hosted.
        </p>
      ) : (
        <div className="space-y-3">
          {profile.hostedUpcoming.map((g) => (
            <GameCard key={g.id} game={g} youAreIn={isInGame(g, me.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
