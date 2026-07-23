import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { SkillLevel } from "../types";
import {
  CheckIcon,
  IconChip,
  LeafIcon,
  TrophyIcon,
  UsersIcon,
  VolleyballIcon,
  ZapIcon,
} from "../components/icons";

const GENDER_OPTIONS = ["Man", "Woman", "Non-binary", "Prefer not to say"];

const SKILL_CARDS: {
  level: SkillLevel;
  Icon: React.ComponentType<{ className?: string }>;
  tagline: string;
  bullets: string[];
}[] = [
  {
    level: "All Levels",
    Icon: UsersIcon,
    tagline: "Just here to play",
    bullets: [
      "Happy in any game at any pace",
      "Skill level doesn't matter to you",
      "The more the merrier!",
    ],
  },
  {
    level: "Low Beginner",
    Icon: LeafIcon,
    tagline: "Brand new to the game",
    bullets: [
      "Still learning to bump, set, and serve",
      "Casual and friendly rallies",
      "Mistakes are completely fine here",
    ],
  },
  {
    level: "High Beginner",
    Icon: LeafIcon,
    tagline: "Getting the hang of it",
    bullets: [
      "Basic skills are starting to stick",
      "Can keep a rally going",
      "Learning positions and rotations",
    ],
  },
  {
    level: "Low Intermediate",
    Icon: ZapIcon,
    tagline: "Comfortable player",
    bullets: [
      "Confident with basic skills and rotations",
      "Know the rules and play regularly",
      "Looking for fun, competitive games",
    ],
  },
  {
    level: "High Intermediate",
    Icon: ZapIcon,
    tagline: "Strong, consistent play",
    bullets: [
      "Consistent technique and accurate play",
      "Comfortable in competitive games",
      "Rarely misses serves or easy balls",
    ],
  },
  {
    level: "Advanced",
    Icon: TrophyIcon,
    tagline: "Competitive experience",
    bullets: [
      "League or tournament experience",
      "Reads the game and plays a position",
      "Performs well under pressure",
    ],
  },
];

export default function Onboarding() {
  const { updateProfile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<SkillLevel | null>(null);
  const [birthdate, setBirthdate] = useState("");
  const [userGender, setUserGender] = useState("");
  const [showAge, setShowAge] = useState(true);
  const [showGender, setShowGender] = useState(true);
  const [busy, setBusy] = useState(false);

  async function handleFinish(opts?: { skip?: boolean }) {
    setBusy(true);
    try {
      await updateProfile({
        skill: selected ?? undefined,
        birthdate: opts?.skip ? undefined : (birthdate || null),
        userGender: opts?.skip ? undefined : userGender,
        showAge,
        showGender,
      });
    } catch { /* best-effort */ }
    localStorage.setItem("vybe.welcomed", "1");
    navigate("/", { replace: true });
  }

  if (step === 2) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col bg-white px-5 py-10">
        <div className="mb-7 flex flex-col items-center text-center">
          <VolleyballIcon className="h-10 w-10 text-brand" />
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-white">
            A bit about you
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Optional — you can always update this in your profile.
          </p>
        </div>

        <div className="flex-1 space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-200">Birthday</label>
            <input
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm outline-none transition focus:border-slate-400"
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-200">Gender</p>
            <div className="flex flex-wrap gap-2">
              {GENDER_OPTIONS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setUserGender(g === userGender ? "" : g)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    userGender === g ? "bg-brand text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-800 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Privacy</p>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-slate-200">Show my age on profile</span>
              <button type="button" onClick={() => setShowAge((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${showAge ? "bg-brand" : "bg-slate-700"}`}>
                <span className={`mt-0.5 ml-0.5 inline-block h-4 w-4 rounded-full bg-slate-900 shadow transition-transform ${showAge ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-slate-200">Show my gender on profile</span>
              <button type="button" onClick={() => setShowGender((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${showGender ? "bg-brand" : "bg-slate-700"}`}>
                <span className={`mt-0.5 ml-0.5 inline-block h-4 w-4 rounded-full bg-slate-900 shadow transition-transform ${showGender ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </label>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={() => handleFinish()}
            disabled={busy}
            className="w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40"
          >
            {busy ? "Setting up…" : "Let's go!"}
          </button>
          <button
            onClick={() => handleFinish({ skip: true })}
            className="mt-3 w-full text-center text-sm text-slate-400 hover:text-slate-300"
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-white px-5 py-10">
      {/* Header */}
      <div className="mb-7 flex flex-col items-center text-center">
        <VolleyballIcon className="h-10 w-10 text-brand" />
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-white">
          Welcome to Coterie!
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          What's your volleyball level? We'll use this to show you the right games.
        </p>
      </div>

      {/* Skill level cards */}
      <div className="flex-1 space-y-3">
        {SKILL_CARDS.map(({ level, Icon, tagline, bullets }) => {
          const isSelected = selected === level;
          return (
            <button
              key={level}
              onClick={() => setSelected(level)}
              className={`w-full rounded-2xl border-2 p-4 text-left transition active:scale-[0.98] ${
                isSelected
                  ? "border-brand bg-brand/5"
                  : "border-slate-800 bg-slate-900 hover:border-slate-700"
              }`}
            >
              <div className="mb-2 flex items-center gap-2.5">
                <IconChip size="md">
                  <Icon className="h-5 w-5" />
                </IconChip>
                <div>
                  <p className={`font-bold ${isSelected ? "text-brand" : "text-white"}`}>
                    {level}
                  </p>
                  <p className="text-xs text-slate-400">{tagline}</p>
                </div>
                {isSelected && (
                  <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white">
                    <CheckIcon className="h-3 w-3" />
                  </span>
                )}
              </div>
              <ul className="space-y-0.5 pl-1">
                {bullets.map((b) => (
                  <li key={b} className="flex items-start gap-1.5 text-xs text-slate-400">
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
          onClick={() => { if (selected) setStep(2); }}
          disabled={!selected}
          className="w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40"
        >
          {selected ? `I'm ${selected} — continue` : "Pick your level to continue"}
        </button>
        <button
          onClick={() => { localStorage.setItem("vybe.welcomed", "1"); navigate("/", { replace: true }); }}
          className="mt-3 w-full text-center text-sm text-slate-400 hover:text-slate-300"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
