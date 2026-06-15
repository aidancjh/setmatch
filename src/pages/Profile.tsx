import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getUserHighlights } from "../services/gamesService";
import type { Highlight, SkillLevel } from "../types";
import { SkillBadge, RatingHero } from "../components/Badges";

const skills: SkillLevel[] = ["Beginner", "Intermediate", "Advanced", "All Levels"];
const GENDER_OPTIONS = ["Man", "Woman", "Non-binary", "Prefer not to say"];
const POSITION_OPTIONS = ["Setter", "Outside Hitter", "Middle Blocker", "Opposite", "Libero", "Defensive Specialist"];

function computeAge(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null;
  const [y, m, d] = birthdate.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age >= 0 ? age : null;
}

const SKILL_INFO: Record<SkillLevel, { emoji: string; desc: string }> = {
  Beginner:       { emoji: "🌱", desc: "New to the game. Casual, friendly rallies — mistakes totally fine." },
  Intermediate:   { emoji: "⚡", desc: "Comfortable with bumping, setting, serving. Know the rules and rotations." },
  Advanced:       { emoji: "🏆", desc: "Consistent technique. Competitive experience, performs under pressure." },
  "All Levels":   { emoji: "🤝", desc: "Happy in any game at any pace. Just here to play!" },
};

// ---------------------------------------------------------------------------
// Highlights grid
// ---------------------------------------------------------------------------

function HighlightGrid({
  highlights,
  onNavigate,
}: {
  highlights: Highlight[];
  onNavigate: () => void;
}) {
  const [playing, setPlaying] = useState<Highlight | null>(null);

  if (highlights.length === 0) {
    return (
      <div className="mt-6">
        <p className="mb-2 text-sm font-semibold text-slate-900">My Highlights</p>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center">
          <p className="text-2xl">🎬</p>
          <p className="mt-1 text-sm text-slate-400">No highlights yet</p>
          <button
            onClick={onNavigate}
            className="mt-3 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white"
          >
            Share your first clip
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">
          My Highlights <span className="font-normal text-slate-400">({highlights.length})</span>
        </p>
        <button
          onClick={onNavigate}
          className="text-xs font-semibold text-brand"
        >
          + Add
        </button>
      </div>

      <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-2xl">
        {highlights.map((h) => (
          <button
            key={h.id}
            onClick={() => setPlaying(h)}
            className="relative aspect-square bg-slate-900"
          >
            {h.thumbUrl || h.mediaType === "photo" ? (
              <img src={h.thumbUrl || h.videoUrl} alt={h.caption} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="text-2xl text-white/60">▶</span>
              </div>
            )}
            {h.mediaType !== "photo" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition hover:opacity-100">
                <span className="text-xl text-white drop-shadow">▶</span>
              </div>
            )}
            {h.likesCount > 0 && (
              <span className="absolute bottom-1 right-1 rounded bg-black/50 px-1 text-[10px] text-white">
                ♥ {h.likesCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Media modal */}
      {playing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setPlaying(null)}
        >
          <div
            className="relative mx-4 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            {playing.mediaType === "photo" ? (
              <img src={playing.videoUrl} alt={playing.caption} className="w-full rounded-2xl object-contain" />
            ) : (
              <video src={playing.videoUrl} controls autoPlay className="w-full rounded-2xl" />
            )}
            {playing.caption && (
              <p className="mt-2 text-center text-sm text-white/80">{playing.caption}</p>
            )}
            <button
              onClick={() => setPlaying(null)}
              className="absolute -top-10 right-0 text-white/60 hover:text-white"
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Profile() {
  const { user, updateProfile, logout } = useAuth();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  // Edit-mode state
  const [name, setName] = useState(user?.name ?? "");
  const [skill, setSkill] = useState<SkillLevel>(user?.skill ?? "Intermediate");
  const [homeArea, setHomeArea] = useState(user?.homeArea ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [birthdate, setBirthdate] = useState(user?.birthdate ?? "");
  const [userGender, setUserGender] = useState(user?.userGender ?? "");
  const [showAge, setShowAge] = useState(user?.showAge !== false);
  const [showGender, setShowGender] = useState(user?.showGender !== false);
  const [favoritePositions, setFavoritePositions] = useState<string[]>(user?.favoritePositions ?? []);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showSkillInfo, setShowSkillInfo] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  useEffect(() => {
    if (user?.id) {
      getUserHighlights(user.id).then(setHighlights).catch(() => {});
    }
  }, [user?.id]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !cloudName || !uploadPreset) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", uploadPreset);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: "POST", body: fd }
      );
      const data = await res.json();
      if (data.secure_url) setAvatarUrl(data.secure_url);
    } catch { /* silent */ } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setError("");
    try {
      await updateProfile({
        name: name.trim() || "You",
        skill,
        homeArea: homeArea.trim(),
        bio: bio.trim(),
        avatarUrl,
        birthdate: birthdate || null,
        userGender,
        showAge,
        showGender,
        favoritePositions,
      });
      setSaved(true);
      setTimeout(() => { setSaved(false); setEditing(false); }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile.");
    }
  };

  const handleCancelEdit = () => {
    setName(user?.name ?? "");
    setSkill(user?.skill ?? "Intermediate");
    setHomeArea(user?.homeArea ?? "");
    setBio(user?.bio ?? "");
    setAvatarUrl(user?.avatarUrl ?? "");
    setBirthdate(user?.birthdate ?? "");
    setUserGender(user?.userGender ?? "");
    setShowAge(user?.showAge !== false);
    setShowGender(user?.showGender !== false);
    setFavoritePositions(user?.favoritePositions ?? []);
    setError("");
    setEditing(false);
  };

  const initials = ((user?.name ?? "Y").trim() || "Y").charAt(0).toUpperCase();
  const displayAvatar = avatarUrl || user?.avatarUrl;

  // ── Edit mode ────────────────────────────────────────────────────────────

  if (editing) {
    return (
      <div>
        <div className="mb-4 flex items-center gap-2">
          <button onClick={handleCancelEdit} className="text-sm font-medium text-slate-400 hover:text-slate-700">
            ← Cancel
          </button>
          <h1 className="text-lg font-bold text-slate-900">Edit profile</h1>
        </div>

        {/* Avatar upload */}
        <div className="mb-5 flex flex-col items-center">
          <button
            onClick={() => fileRef.current?.click()}
            className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-brand text-3xl font-bold text-white"
          >
            {displayAvatar ? (
              <img src={displayAvatar} alt={name} className="h-full w-full object-cover" />
            ) : initials}
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
              <span className="text-xs font-semibold text-white">{uploading ? "…" : "📷"}</span>
            </div>
          </button>
          <p className="mt-1.5 text-xs text-slate-400">Tap to change photo</p>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Display name</span>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Bio</span>
            <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 300))}
              placeholder="Tell other players a bit about yourself…" rows={2}
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400" />
            <p className="mt-0.5 text-right text-xs text-slate-400">{bio.length}/300</p>
          </label>

          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="text-sm font-medium text-slate-700">Skill level</span>
              <button onClick={() => setShowSkillInfo((v) => !v)}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] font-bold text-slate-400 hover:border-brand hover:text-brand transition">
                ?
              </button>
            </div>
            {showSkillInfo && (
              <div className="mb-3 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                {(Object.entries(SKILL_INFO) as [SkillLevel, { emoji: string; desc: string }][]).map(([s, { emoji, desc }]) => (
                  <div key={s} className="flex gap-2 text-sm">
                    <span className="shrink-0">{emoji}</span>
                    <div><span className="font-semibold text-slate-800">{s}:</span>{" "}<span className="text-slate-500">{desc}</span></div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s) => (
                <button key={s} onClick={() => setSkill(s)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${skill === s ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Home area</span>
            <input value={homeArea} onChange={(e) => setHomeArea(e.target.value)}
              placeholder="e.g. Santa Monica"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Birthday</span>
            <input type="date" value={birthdate || ""} onChange={(e) => setBirthdate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400" />
          </label>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Gender</span>
            <div className="flex flex-wrap gap-1.5">
              {GENDER_OPTIONS.map((g) => (
                <button key={g} type="button" onClick={() => setUserGender(g === userGender ? "" : g)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${userGender === g ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Favorite positions</span>
            <div className="flex flex-wrap gap-1.5">
              {POSITION_OPTIONS.map((p) => {
                const active = favoritePositions.includes(p);
                return (
                  <button key={p} type="button"
                    onClick={() => setFavoritePositions((prev) => active ? prev.filter((x) => x !== p) : [...prev, p])}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${active ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Privacy</p>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-slate-700">Show my age on profile</span>
              <button type="button" onClick={() => setShowAge((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${showAge ? "bg-brand" : "bg-slate-200"}`}>
                <span className={`mt-0.5 ml-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${showAge ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-slate-700">Show my gender on profile</span>
              <button type="button" onClick={() => setShowGender((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${showGender ? "bg-brand" : "bg-slate-200"}`}>
                <span className={`mt-0.5 ml-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${showGender ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </label>
          </div>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

          <button onClick={handleSave}
            className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white transition hover:bg-brand-dark">
            {saved ? "Saved ✓" : "Save profile"}
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {user?.role === "admin" && (
            <button onClick={() => navigate("/admin")}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              🛠 Admin dashboard
            </button>
          )}
          <button onClick={() => { logout(); navigate("/"); }}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // ── View mode ────────────────────────────────────────────────────────────

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-slate-900">Profile</h1>

      {/* Profile card with gradient banner */}
      <div className="relative mb-4 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
        <div className="h-24 bg-gradient-to-br from-brand to-orange-400" />

        {/* Edit button — glassy on the banner */}
        <button
          onClick={() => setEditing(true)}
          className="absolute right-4 top-4 flex items-center gap-1.5 rounded-xl bg-white/25 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/40 active:scale-95"
          aria-label="Edit profile"
        >
          ✏️ Edit
        </button>

        <div className="px-4 pb-4">
          {/* Avatar overlapping the banner */}
          <div className="-mt-12 flex items-end">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand text-3xl font-bold text-white ring-4 ring-white">
              {displayAvatar ? (
                <img src={displayAvatar} alt={user?.name} className="h-full w-full object-cover" />
              ) : initials}
            </div>
          </div>

          {/* Name + skill + area */}
          <div className="mt-3">
            <p className="truncate text-xl font-bold text-slate-900">{user?.name || "You"}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <SkillBadge skill={user?.skill ?? "Intermediate"} />
              {user?.homeArea && (
                <span className="text-xs text-slate-400">📍 {user.homeArea}</span>
              )}
            </div>
            {(() => {
              const age = computeAge(user?.birthdate);
              const parts = [
                user?.showAge !== false && age !== null ? `${age} yrs` : null,
                user?.showGender !== false && user?.userGender ? user.userGender : null,
              ].filter(Boolean);
              return parts.length > 0 ? (
                <p className="mt-1 text-xs text-slate-500">{parts.join(" · ")}</p>
              ) : null;
            })()}
            <p className="mt-1 text-xs text-slate-400">{user?.email}</p>
          </div>

          {/* Bio */}
          {user?.bio && (
            <p className="mt-3 border-t border-slate-50 pt-3 text-sm leading-relaxed text-slate-600">
              {user.bio}
            </p>
          )}

          {!user?.bio && (
            <button onClick={() => setEditing(true)}
              className="mt-3 w-full border-t border-slate-50 pt-3 text-left text-xs text-slate-300 hover:text-brand">
              + Add a bio…
            </button>
          )}

          {/* Player rating — prominent */}
          {user?.playerRating && user.playerRating.count > 0 && (
            <div className="mt-4">
              <RatingHero avg={user.playerRating.avg ?? 0} count={user.playerRating.count} />
            </div>
          )}

          {/* Favorite positions */}
          {user?.favoritePositions && user.favoritePositions.length > 0 && (
            <div className="mt-3 border-t border-slate-50 pt-3">
              <p className="mb-1.5 text-xs font-medium text-slate-400">Positions</p>
              <div className="flex flex-wrap gap-1.5">
                {user.favoritePositions.map((p) => (
                  <span key={p} className="rounded-lg bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">{p}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="mb-4 space-y-2">
        {user?.role === "admin" && (
          <button onClick={() => navigate("/admin")}
            className="w-full rounded-xl border border-brand/30 bg-brand/5 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand/10 active:scale-[0.98]">
            🛠 Admin dashboard
          </button>
        )}
        <button onClick={() => { logout(); navigate("/"); }}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]">
          Sign out
        </button>
      </div>

      {/* Highlights feed */}
      <HighlightGrid
        highlights={highlights}
        onNavigate={() => navigate("/highlights?upload=1")}
      />
    </div>
  );
}
