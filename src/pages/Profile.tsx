import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { SkillLevel } from "../types";

const skills: SkillLevel[] = [
  "Beginner",
  "Intermediate",
  "Advanced",
  "All Levels",
];

export default function Profile() {
  const { user, updateProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? "");
  const [skill, setSkill] = useState<SkillLevel>(user?.skill ?? "Intermediate");
  const [homeArea, setHomeArea] = useState(user?.homeArea ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setError("");
    try {
      await updateProfile({
        name: name.trim() || "You",
        skill,
        homeArea: homeArea.trim(),
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

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">
        Profile
      </h1>
      <p className="mb-5 text-sm text-slate-500">
        This is how you appear on game rosters.
      </p>

      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">
          {(name.trim() || "Y").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{name || "You"}</p>
          <p className="truncate text-sm text-slate-500">
            {user?.email ?? skill}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Display name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          />
        </label>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Skill level
          </span>
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
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Home area
          </span>
          <input
            value={homeArea}
            onChange={(e) => setHomeArea(e.target.value)}
            placeholder="e.g. Santa Monica"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
          />
        </label>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
            {error}
          </p>
        )}

        <button
          onClick={handleSave}
          className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          {saved ? "Saved ✓" : "Save profile"}
        </button>

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
