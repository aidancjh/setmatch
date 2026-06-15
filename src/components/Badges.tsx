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

/**
 * Star rating with partial fill. Renders 5 stars where the amber overlay is
 * clipped horizontally to the average, so 4.3/5 shows as 4.3 stars worth of gold.
 */
export function StarRating({
  avg,
  size = "md",
}: {
  avg: number;
  size?: "sm" | "md" | "lg";
}) {
  const pct = Math.max(0, Math.min(100, (avg / 5) * 100));
  const sizeCls = size === "lg" ? "text-3xl" : size === "sm" ? "text-base" : "text-xl";
  return (
    <span className={`relative inline-block leading-none ${sizeCls}`} aria-hidden>
      <span className="whitespace-nowrap tracking-[0.1em] text-slate-200">★★★★★</span>
      <span
        className="absolute inset-0 overflow-hidden whitespace-nowrap tracking-[0.1em] text-amber-400"
        style={{ width: `${pct}%` }}
      >
        ★★★★★
      </span>
    </span>
  );
}

/**
 * Prominent "hero" rating block for profiles — big number + large stars on a
 * warm gradient. Only render when there is at least one vote.
 */
export function RatingHero({ avg, count }: { avg: number; count: number }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-100 p-4 ring-1 ring-amber-200/60">
      <div className="shrink-0 text-center">
        <div className="text-4xl font-extrabold leading-none text-slate-900">
          {avg.toFixed(1)}
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600/80">
          out of 5
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <StarRating avg={avg} size="lg" />
        <p className="mt-1.5 text-xs font-medium text-slate-500">
          Player rating · {count} vote{count === 1 ? "" : "s"}
        </p>
      </div>
    </div>
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
