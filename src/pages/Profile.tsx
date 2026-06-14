import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { SkillLevel } from "../types";

const skills: SkillLevel[] = ["Beginner", "Intermediate", "Advanced", "All Levels"];

const SKILL_INFO: Record<SkillLevel, { emoji: string; desc: string }> = {
  Beginner: {
    emoji: "🌱",
    desc: "New to volleyball or still picking up the basics. Casual rallies, friendly pace — mistakes are totally fine.",
  },
  Intermediate: {
    emoji: "⚡",
    desc: "Comfortable with bumping, setting, and serving. You know the rules and rotations and play regularly for fun.",
  },
  Advanced: {
    emoji: "🏆",
    desc: "Consistent technique and accurate play. You have competitive experience (leagues / tournaments) and perform under pressure.",
  },
  "All Levels": {
    emoji: "🤝",
    desc: "You're happy in any game at any pace. Skill doesn't matter — you just want to play.",
  },
};

export default function Profile() {
  const { user, updateProfile, logout } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.name ?? "");
  const [skill, setSkill] = useState<SkillLevel>(user?.skill ?? "Intermediate");
  const [homeArea, setHomeArea] = useState(user?.homeArea ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showSkillInfo, setShowSkillInfo] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

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
    } catch {
      // silently ignore upload errors
    } finally {
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
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile.");
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const initials = (name.trim() || "Y").charAt(0).toUpperCase();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">Profile</h1>
      <p className="mb-5 text-sm text-slate-500">This is how you appear on game rosters.</p>

      {/* Avatar + name card */}
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="relative shrink-0">
          <button
            onClick={() => fileRef.current?.click()}
            className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-brand text-2xl font-bold text-white focus:outline-none"
            aria-label="Change profile photo"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
            ) : (
              initials
            )}
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30 opacity-0 transition hover:opacity-100">
              <span className="text-xs font-semibold text-white">
                {uploading ? "…" : "Edit"}
              </span>
            </div>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{name || "You"}</p>
          <p className="truncate text-sm text-slate-500">{user?.email ?? skill}</p>
          {uploading && <p className="text-xs text-brand">Uploading…</p>}
        </div>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Display name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 300))}
            placeholder="Tell other players a bit about yourself…"
            rows={2}
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          />
          <p className="mt-0.5 text-right text-xs text-slate-400">{bio.length}/300</p>
        </label>

        <div>
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-sm font-medium text-slate-700">Skill level</span>
            <button
              onClick={() => setShowSkillInfo((v) => !v)}
              aria-label="What do the skill levels mean?"
              className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] font-bold text-slate-400 hover:border-brand hover:text-brand transition"
            >
              ?
            </button>
          </div>

          {showSkillInfo && (
            <div className="mb-3 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
              {(Object.entries(SKILL_INFO) as [SkillLevel, { emoji: string; desc: string }][]).map(
                ([s, { emoji, desc }]) => (
                  <div key={s} className="flex gap-2 text-sm">
                    <span className="shrink-0">{emoji}</span>
                    <div>
                      <span className="font-semibold text-slate-800">{s}:</span>{" "}
                      <span className="text-slate-500">{desc}</span>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <button
                key={s}
                onClick={() => setSkill(s)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  skill === s
                    ? "bg-brand text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Home area</span>
          <input
            value={homeArea}
            onChange={(e) => setHomeArea(e.target.value)}
            placeholder="e.g. Santa Monica"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          />
        </label>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
        )}

        <button
          onClick={handleSave}
          className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          {saved ? "Saved ✓" : "Save profile"}
        </button>

        {user?.role === "admin" && (
          <button
            onClick={() => navigate("/admin")}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            🛠 Admin dashboard
          </button>
        )}

        <button
          onClick={handleLogout}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
