import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGames } from "../hooks/useGames";
import { useProfile } from "../hooks/useProfile";
import { isInGame, spotsLeft } from "../services/gamesService";
import { isPast } from "../lib/format";
import type { Game } from "../types";
import GameCard from "../components/GameCard";
import { GameCardSkeleton } from "../components/Skeleton";

// ---------------------------------------------------------------------------
// Filter options (mirror the create-game form)
// ---------------------------------------------------------------------------

const regionOptions = ["North", "South", "East", "West"];
const typeOptions = ["Indoor", "Beach", "Grass"];
const skillOptions = ["Beginner", "Intermediate", "Advanced", "All Levels"];
const genderOptions = ["Open", "Mixed", "Men", "Women"];
const genderLabels: Record<string, string> = { Open: "Open", Mixed: "Mixed", Men: "Men's", Women: "Women's" };
const netOptions = ["Men's (2.43m)", "Women's (2.24m)", "Recreational (2.35m)", "Venue Standard"];
const netLabels: Record<string, string> = {
  "Men's (2.43m)": "Men's",
  "Women's (2.24m)": "Women's",
  "Recreational (2.35m)": "Rec",
  "Venue Standard": "Venue",
};
const positionOptions = ["Setter", "Outside Hitter", "Middle Blocker", "Opposite", "Libero", "Defensive Specialist"];
const positionLabels: Record<string, string> = {
  Setter: "Setter",
  "Outside Hitter": "OH",
  "Middle Blocker": "MB",
  Opposite: "Opp",
  Libero: "Libero",
  "Defensive Specialist": "DS",
};

type Price = "Any" | "Free" | "Paid";

interface Filters {
  region: string;
  type: string;
  skill: string;
  gender: string;
  netHeight: string;
  position: string;
  price: Price;
  minTime: number; // minutes since midnight, 0
  maxTime: number; // minutes since midnight, 1440
  minOpenSpots: number; // 0 = any
}

const DEFAULT_FILTERS: Filters = {
  region: "",
  type: "",
  skill: "",
  gender: "",
  netHeight: "",
  position: "",
  price: "Any",
  minTime: 0,
  maxTime: 1440,
  minOpenSpots: 0,
};

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function fmtClock(min: number): string {
  if (min >= 1440) return "Midnight";
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ap = h < 12 ? "AM" : "PM";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return `${hh}:${m.toString().padStart(2, "0")} ${ap}`;
}

function isFreeGame(g: Game): boolean {
  if (g.courtCost > 0) return false;
  const fee = g.courtFee.trim().toLowerCase();
  return fee === "" || /free|^\$?0(\.0+)?$/.test(fee);
}

function activeFilterCount(f: Filters): number {
  return (
    (f.region ? 1 : 0) +
    (f.type ? 1 : 0) +
    (f.skill ? 1 : 0) +
    (f.gender ? 1 : 0) +
    (f.netHeight ? 1 : 0) +
    (f.position ? 1 : 0) +
    (f.price !== "Any" ? 1 : 0) +
    (f.minTime > 0 || f.maxTime < 1440 ? 1 : 0) +
    (f.minOpenSpots > 0 ? 1 : 0)
  );
}

export default function BrowseGames() {
  const { games, loading, slow, error, reload } = useGames();
  const me = useProfile();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const visible = useMemo(() => {
    const f = filters;
    return games
      .filter((g) => !isPast(g.date))
      .filter((g) => (f.type ? g.type === f.type : true))
      .filter((g) => (f.skill ? g.skill === f.skill : true))
      .filter((g) => (f.region ? g.region === f.region : true))
      .filter((g) => (f.gender ? g.gender === f.gender : true))
      .filter((g) => (f.netHeight ? g.netHeight === f.netHeight : true))
      .filter((g) =>
        f.position
          ? g.positionsNeeded.includes(f.position) ||
            g.positionsNeeded.length === 0 ||
            g.positionsNeeded.includes("Any")
          : true
      )
      .filter((g) =>
        f.price === "Any" ? true : f.price === "Free" ? isFreeGame(g) : !isFreeGame(g)
      )
      .filter((g) => {
        const t = toMinutes(g.time);
        return t >= f.minTime && t <= f.maxTime;
      })
      .filter((g) => (f.minOpenSpots > 0 ? spotsLeft(g) >= f.minOpenSpots : true))
      .filter((g) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          g.title.toLowerCase().includes(q) ||
          g.location.toLowerCase().includes(q) ||
          g.area.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }, [games, search, filters]);

  const activeCount = activeFilterCount(filters);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Find a game
        </h1>
        <p className="text-sm text-slate-500">
          Open volleyball games near you that still need players.
        </p>
      </div>

      {/* Search + Filters button */}
      <div className="mb-4 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <span className="text-slate-400" aria-hidden>🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by area, venue, or title…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
        <button
          onClick={() => setShowFilters(true)}
          className="relative flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-95 hover:bg-brand-dark"
        >
          <FilterIcon className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-brand">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Results */}
      {loading ? (
        <div className="space-y-3">
          {slow && (
            <p className="text-center text-xs text-slate-400">
              ⏳ Waking up the server — hang tight…
            </p>
          )}
          <GameCardSkeleton />
          <GameCardSkeleton />
          <GameCardSkeleton />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50 py-12 text-center">
          <p className="text-sm text-rose-600">{error}</p>
          <button
            onClick={reload}
            className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
          <p className="text-sm text-slate-500">No games match your filters.</p>
          {activeCount > 0 ? (
            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              Clear filters
            </button>
          ) : (
            <button
              onClick={() => navigate("/create")}
              className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              Post your own game
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {visible.length} game{visible.length === 1 ? "" : "s"}
          </p>
          {visible.map((g) => (
            <GameCard key={g.id} game={g} youAreIn={isInGame(g, me.id)} />
          ))}
        </div>
      )}

      {showFilters && (
        <FilterModal
          filters={filters}
          setFilters={setFilters}
          count={visible.length}
          onClose={() => setShowFilters(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter modal — centered, live-apply
// ---------------------------------------------------------------------------

function FilterModal({
  filters,
  setFilters,
  count,
  onClose,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  count: number;
  onClose: () => void;
}) {
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const f = filters;

  const timeLabel =
    f.minTime === 0 && f.maxTime === 1440
      ? "Any time"
      : `${fmtClock(f.minTime)} – ${fmtClock(f.maxTime)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl animate-pop-in">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-base font-bold text-slate-900">Filters</p>
          <button
            onClick={onClose}
            aria-label="Close filters"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 active:scale-90"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {/* Section 1 — Game details */}
          <div className="px-4 py-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <ChipGroup label="Court type" options={typeOptions} value={f.type} onChange={(v) => set({ type: v })} />
              <ChipGroup label="Standard" options={skillOptions} value={f.skill} onChange={(v) => set({ skill: v })} />
              <ChipGroup label="Region" options={regionOptions} value={f.region} onChange={(v) => set({ region: v })} />
              <ChipGroup label="Who it's for" options={genderOptions} labels={genderLabels} value={f.gender} onChange={(v) => set({ gender: v })} />
            </div>
          </div>

          {/* Section 2 — Court & positions */}
          <div className="space-y-4 px-4 py-4">
            <ChipGroup label="Net height" options={netOptions} labels={netLabels} value={f.netHeight} onChange={(v) => set({ netHeight: v })} />
            <ChipGroup label="Position needed" options={positionOptions} labels={positionLabels} value={f.position} onChange={(v) => set({ position: v })} />
          </div>

          {/* Section 3 — Price */}
          <div className="px-4 py-4">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Price</p>
            <div className="flex flex-wrap gap-1.5">
              {(["Any", "Free", "Paid"] as Price[]).map((p) => (
                <Chip key={p} active={f.price === p} onClick={() => set({ price: p })}>
                  {p}
                </Chip>
              ))}
            </div>
          </div>

          {/* Section 4 — Timing */}
          <div className="space-y-5 px-4 py-4">
            {/* Dual-handle time range */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Game time</p>
                <span className="text-xs font-semibold text-slate-700">{timeLabel}</span>
              </div>
              <DualRangeSlider
                value1={f.minTime}
                value2={f.maxTime}
                onChange1={(v) => set({ minTime: v })}
                onChange2={(v) => set({ maxTime: v })}
              />
              <div className="mt-2 flex justify-between text-[11px] text-slate-400">
                <span>12:00 AM</span>
                <span>Midnight</span>
              </div>
            </div>

            {/* Open spots */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Open spots</p>
                <span className="text-xs font-semibold text-slate-700">
                  {f.minOpenSpots === 0 ? "Any" : `${f.minOpenSpots}+ open`}
                </span>
              </div>
              <div
                className="single-range"
                style={{ "--range-pct": `${(f.minOpenSpots / 12) * 100}%` } as React.CSSProperties}
              >
                <input
                  type="range"
                  min={0}
                  max={12}
                  step={1}
                  value={f.minOpenSpots}
                  onChange={(e) => set({ minOpenSpots: Number(e.target.value) })}
                  aria-label="Minimum open spots"
                />
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-slate-400">
                <span>Any</span>
                <span>12+</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95"
          >
            Reset
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark active:scale-[0.98]"
          >
            Show {count} game{count === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function ChipGroup({
  label,
  options,
  value,
  onChange,
  labels,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        <Chip active={!value} onClick={() => onChange("")}>Any</Chip>
        {options.map((o) => (
          <Chip key={o} active={value === o} onClick={() => onChange(value === o ? "" : o)}>
            {labels?.[o] ?? o}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-150 active:scale-95 ${
        active ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

function DualRangeSlider({
  value1,
  value2,
  onChange1,
  onChange2,
}: {
  value1: number;
  value2: number;
  onChange1: (v: number) => void;
  onChange2: (v: number) => void;
}) {
  const pct1 = (value1 / 1440) * 100;
  const pct2 = (value2 / 1440) * 100;
  return (
    <div className="dual-range">
      <div className="dual-range-track" />
      <div className="dual-range-fill" style={{ left: `${pct1}%`, right: `${100 - pct2}%` }} />
      <input
        type="range"
        min={0}
        max={1440}
        step={30}
        value={value1}
        onChange={(e) => onChange1(Math.min(Number(e.target.value), Math.max(0, value2 - 30)))}
        style={{ zIndex: value1 > value2 - 60 ? 5 : 3 }}
        aria-label="Earliest start time"
      />
      <input
        type="range"
        min={0}
        max={1440}
        step={30}
        value={value2}
        onChange={(e) => onChange2(Math.max(Number(e.target.value), Math.min(1440, value1 + 30)))}
        style={{ zIndex: value1 > value2 - 60 ? 4 : 5 }}
        aria-label="Latest start time"
      />
    </div>
  );
}
