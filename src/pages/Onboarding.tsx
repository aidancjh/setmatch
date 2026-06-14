import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { SkillLevel } from "../types";
import { VolleyballIcon } from "../components/icons";

const SKILL_CARDS: {
  level: SkillLevel;
  emoji: string;
  tagline: string;
  bullets: string[];
}[] = [
  {
    level: "Beginner",
    emoji: "🌱",
    tagline: "New to the game",
    bullets: [
      "Still learning to bump, set, and serve",
      "Casual and friendly rallies",
      "Mistakes are completely fine here",
    ],
  },
  {
    level: "Intermediate",
    emoji: "⚡",
    tagline: "Comfortable player",
    bullets: [
      "Confident with basic skills and rotations",
      "Know the rules and play regularly",
      "Looking for fun, competitive games",
    ],
  },
  {
    level: "Advanced",
    emoji: "🏆",
    tagline: "Competitive experience",
    bullets: [
      "Consistent technique and accurate play",
      "League or tournament experience",
      "Performs well under pressure",
    ],
  },
  {
    level: "All Levels",
    emoji: "🤝",
    tagline: "Just here to play",
    bullets: [
      "Happy in any game at any pace",
      "Skill level doesn't matter to you",
      "The more the merrier!",
    ],
  },
];

export default function Onboarding() {
  const { updateProfile } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<SkillLevel | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleContinue() {
    if (!selected) return;
    setBusy(true);
    try {
      await updateProfile({ skill: selected });
      localStorage.setItem("coterie.welcomed", "1");
      navigate("/", { replace: true });
    } catch {
      navigate("/", { replace: true });
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-white px-5 py-10">
      {/* Header */}
      <div className="mb-7 flex flex-col items-center text-center">
        <VolleyballIcon className="h-10 w-10 text-brand" />
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">
          Welcome to Coterie!
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          What's your volleyball level? We'll use this to show you the right games.
        </p>
      </div>

      {/* Skill level cards */}
      <div className="flex-1 space-y-3">
        {SKILL_CARDS.map(({ level, emoji, tagline, bullets }) => {
          const isSelected = selected === level;
          return (
            <button
              key={level}
              onClick={() => setSelected(level)}
              className={`w-full rounded-2xl border-2 p-4 text-left transition active:scale-[0.98] ${
                isSelected
                  ? "border-brand bg-brand/5"
                  : "border-slate-100 bg-white hover:border-slate-200"
              }`}
            >
              <div className="mb-2 flex items-center gap-2.5">
                <span className="text-2xl">{emoji}</span>
                <div>
                  <p className={`font-bold ${isSelected ? "text-brand" : "text-slate-900"}`}>
                    {level}
                  </p>
                  <p className="text-xs text-slate-400">{tagline}</p>
                </div>
                {isSelected && (
                  <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
                    ✓
                  </span>
                )}
              </div>
              <ul className="space-y-0.5 pl-1">
                {bullets.map((b) => (
                  <li key={b} className="flex items-start gap-1.5 text-xs text-slate-500">
                    <span className="mt-px text-slate-300">•</span>
                    {b}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {/* Continue button */}
      <div className="mt-6">
        <button
          onClick={handleContinue}
          disabled={!selected || busy}
          className="w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40"
        >
          {busy ? "Setting up…" : selected ? `I'm ${selected} — let's go!` : "Pick your level to continue"}
        </button>
        <button
          onClick={() => { localStorage.setItem("coterie.welcomed", "1"); navigate("/", { replace: true }); }}
          className="mt-3 w-full text-center text-sm text-slate-400 hover:text-slate-600"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
