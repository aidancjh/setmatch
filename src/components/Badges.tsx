import type { GameType, SkillLevel } from "../types";

const skillStyles: Record<SkillLevel, string> = {
  Beginner: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Intermediate: "bg-sky-50 text-sky-700 ring-sky-600/20",
  Advanced: "bg-rose-50 text-rose-700 ring-rose-600/20",
  "All Levels": "bg-slate-100 text-slate-600 ring-slate-500/20",
};

const typeEmoji: Record<GameType, string> = {
  Indoor: "🏐",
  Beach: "🏖️",
  Grass: "🌱",
};

export function SkillBadge({ skill }: { skill: SkillLevel }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${skillStyles[skill]}`}
    >
      {skill}
    </span>
  );
}

export function TypeBadge({ type }: { type: GameType }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/20">
      <span aria-hidden>{typeEmoji[type]}</span>
      {type}
    </span>
  );
}

/** Spots-left pill that turns urgent (amber/red) as a game fills up. */
export function SpotsBadge({ left, total }: { left: number; total: number }) {
  let cls = "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  let label = `${left} spot${left === 1 ? "" : "s"} left`;
  if (left === 0) {
    cls = "bg-slate-200 text-slate-600 ring-slate-500/20";
    label = "Full · join waitlist";
  } else if (left <= 2) {
    cls = "bg-rose-50 text-rose-700 ring-rose-600/20";
  } else if (left <= 4) {
    cls = "bg-amber-50 text-amber-700 ring-amber-600/20";
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}
    >
      {label}
      <span className="ml-1 font-normal opacity-70">
        ({total - left}/{total})
      </span>
    </span>
  );
}
