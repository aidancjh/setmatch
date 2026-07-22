import type { GameType, SkillLevel } from "../types";

const skillStyles: Record<SkillLevel, string> = {
  "All Levels": "bg-slate-800 text-slate-300 ring-slate-500/20",
  "Low Beginner": "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  "High Beginner": "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  "Low Intermediate": "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  "High Intermediate": "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  Beginner: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  Intermediate: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  Advanced: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
};

export function SkillBadge({
  skill,
  size = "md",
}: {
  skill: SkillLevel;
  size?: "md" | "lg";
}) {
  const sizeCls =
    size === "lg"
      ? "px-4 py-1.5 text-sm font-semibold"
      : "px-2 py-0.5 text-xs font-medium";
  return (
    <span
      className={`inline-flex items-center rounded-full ring-1 ring-inset ${sizeCls} ${skillStyles[skill]}`}
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
      <span className="whitespace-nowrap tracking-[0.1em] text-slate-700">★★★★★</span>
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
    <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-blue-600/25 to-blue-500/10 p-4 ring-1 ring-blue-500/30">
      <div className="shrink-0 text-center">
        <div className="text-4xl font-extrabold leading-none text-white">
          {avg.toFixed(1)}
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-blue-300/80">
          out of 5
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <StarRating avg={avg} size="lg" />
        <p className="mt-1.5 text-xs font-medium text-slate-400">
          Player rating · {count} vote{count === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}

/** Empty-state rating block — same footprint as RatingHero, shown when a
 * player has no votes yet so every profile has a consistent ratings area. */
export function RatingEmpty() {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-slate-800 p-4 ring-1 ring-slate-700/60">
      <div className="shrink-0 text-center">
        <div className="text-4xl font-extrabold leading-none text-slate-300">—</div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          out of 5
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <StarRating avg={0} size="lg" />
        <p className="mt-1.5 text-xs font-medium text-slate-400">No player ratings yet</p>
      </div>
    </div>
  );
}

const typeStyles: Record<GameType, string> = {
  Indoor: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  Beach: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  Grass: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
};

export function TypeBadge({ type }: { type: GameType }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${typeStyles[type]}`}>
      {type}
    </span>
  );
}

/** Spots-left pill that turns urgent (amber/red) as a game fills up. */
export function SpotsBadge({ left, total }: { left: number; total: number }) {
  let cls = "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30";
  let label = `${left} spot${left === 1 ? "" : "s"} left`;
  if (left === 0) {
    cls = "bg-slate-700 text-slate-300 ring-slate-500/20";
    label = "Full · join waitlist";
  } else if (left <= 2) {
    cls = "bg-rose-500/15 text-rose-300 ring-rose-500/30";
  } else if (left <= 4) {
    cls = "bg-amber-500/15 text-amber-300 ring-amber-500/30";
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
