import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Game } from "../types";
import { useGames } from "../hooks/useGames";
import { useProfile } from "../hooks/useProfile";
import { isInGame, isOnWaitlist, spotsLeft, getPendingReviews } from "../services/gamesService";
import { isPast } from "../lib/format";
import GameCard from "../components/GameCard";
import ReviewModal from "../components/ReviewModal";
import { GameCardSkeleton } from "../components/Skeleton";
import Modal from "../components/Modal";
import { SearchIcon, XIcon } from "../components/icons";

// ---------------------------------------------------------------------------
// Filter options (mirror the create-game form)
// ---------------------------------------------------------------------------

const typeOptions = ["Indoor", "Beach", "Grass"];
const skillOptions = ["All Levels", "Low Beginner", "High Beginner", "Low Intermediate", "High Intermediate", "Advanced"];
const netOptions = ["Men's (2.43m)", "Women's (2.24m)", "Mixed (2.35m)"];
const netLabels: Record<string, string> = {
  "Men's (2.43m)": "Men's (2.43m)",
  "Women's (2.24m)": "Women's (2.24m)",
  "Mixed (2.35m)": "Mixed (2.35m)",
};
// Same list and labels the host form uses.
const positionOptions = ["Setter", "Outside Hitter", "Middle Blocker", "Opposite", "Libero"];

interface Filters {
  type: string;
  skills: string[];
  netHeight: string;
  positions: string[];
  minTime: number; // minutes since midnight, 0
  maxTime: number; // minutes since midnight, 1440
  minOpenSpots: number; // 0 = any
}

const DEFAULT_FILTERS: Filters = {
  type: "",
  skills: [],
  netHeight: "",
  positions: [],
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

function activeFilterCount(f: Filters): number {
  return (
    (f.type ? 1 : 0) +
    (f.skills.length > 0 ? 1 : 0) +
    (f.netHeight ? 1 : 0) +
    (f.positions.length > 0 ? 1 : 0) +
    (f.minTime > 0 || f.maxTime < 1440 ? 1 : 0) +
    (f.minOpenSpots > 0 ? 1 : 0)
  );
}

// --- URL <-> filter state (so a filtered view survives refresh + is shareable) ---

function filtersToParams(f: Filters, search: string): URLSearchParams {
  const p = new URLSearchParams();
  if (search.trim()) p.set("q", search.trim());
  if (f.type) p.set("type", f.type);
  if (f.netHeight) p.set("net", f.netHeight);
  if (f.skills.length) p.set("skills", f.skills.join(","));
  if (f.positions.length) p.set("pos", f.positions.join(","));
  if (f.minTime > 0 || f.maxTime < 1440) p.set("time", `${f.minTime}-${f.maxTime}`);
  if (f.minOpenSpots > 0) p.set("open", String(f.minOpenSpots));
  return p;
}

function paramsToState(p: URLSearchParams): { filters: Filters; search: string } {
  const list = (k: string) => {
    const v = p.get(k);
    return v ? v.split(",").filter(Boolean) : [];
  };
  let minTime = 0;
  let maxTime = 1440;
  const time = p.get("time");
  if (time && /^\d+-\d+$/.test(time)) {
    const [a, b] = time.split("-").map(Number);
    minTime = Math.min(Math.max(a, 0), 1440);
    maxTime = Math.min(Math.max(b, 0), 1440);
  }
  return {
    search: p.get("q") || "",
    filters: {
      type: p.get("type") || "",
      skills: list("skills"),
      netHeight: p.get("net") || "",
      positions: list("pos"),
      minTime,
      maxTime,
      minOpenSpots: Math.max(0, Number(p.get("open")) || 0),
    },
  };
}

type View = "browse" | "upcoming" | "hosting" | "past";
const VIEWS: { key: View; label: string }[] = [
  { key: "browse", label: "Browse" },
  { key: "upcoming", label: "Upcoming" },
  { key: "hosting", label: "Hosting" },
  { key: "past", label: "Past" },
];
const VIEW_SUBTITLE: Record<View, string> = {
  browse: "Open volleyball games near you that still need players.",
  upcoming: "Games you've joined, are hosting, or are waitlisted for.",
  hosting: "Games you're hosting.",
  past: "Games you've already played — leave a review.",
};
function parseView(p: URLSearchParams): View {
  const v = p.get("view");
  return v === "upcoming" || v === "hosting" || v === "past" ? v : "browse";
}

export default function BrowseGames() {
  const { games, loading, slow, error, reload } = useGames();
  const me = useProfile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Seed state from the URL once on mount, then mirror changes back into it.
  const initial = useMemo(() => paramsToState(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [search, setSearch] = useState(initial.search);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [view, setView] = useState<View>(() => parseView(searchParams));

  useEffect(() => {
    const p = filtersToParams(filters, search);
    if (view !== "browse") p.set("view", view);
    setSearchParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, search, view]);
  const [showFilters, setShowFilters] = useState(false);

  // Pending reviews power the "Review" button in the Past view.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [reviewGame, setReviewGame] = useState<Game | null>(null);
  useEffect(() => {
    getPendingReviews()
      .then((gs) => setPendingIds(new Set(gs.map((g) => g.id))))
      .catch(() => {});
  }, []);

  const visible = useMemo(() => {
    const f = filters;
    return games
      .filter((g) => !isPast(g.date))
      .filter((g) => (f.type ? g.type === f.type : true))
      .filter((g) => (f.skills.length > 0 ? f.skills.includes(g.skill) : true))
      .filter((g) =>
        f.netHeight
          ? g.netHeight === f.netHeight ||
            (f.netHeight === "Mixed (2.35m)" && g.netHeight === "Recreational (2.35m)")
          : true
      )
      .filter((g) =>
        f.positions.length > 0
          ? f.positions.some(
              (pos) =>
                g.positionsNeeded.includes(pos) ||
                g.positionsNeeded.length === 0 ||
                g.positionsNeeded.includes("Any")
            )
          : true
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

  // "My games" views (upcoming / hosting / past) — the merged My Games content.
  const mine = useMemo(
    () =>
      games.filter(
        (g) => isInGame(g, me.id) || isOnWaitlist(g, me.id) || g.hostId === me.id
      ),
    [games, me.id]
  );
  const myList = useMemo(() => {
    const sorted = [...mine].sort((a, b) =>
      (a.date + a.time).localeCompare(b.date + b.time)
    );
    if (view === "hosting") return sorted.filter((g) => g.hostId === me.id);
    if (view === "past") return sorted.filter((g) => isPast(g.date)).reverse();
    if (view === "upcoming") return sorted.filter((g) => !isPast(g.date));
    return [];
  }, [mine, view, me.id]);

  const activeCount = activeFilterCount(filters);
  const viewIndex = VIEWS.findIndex((v) => v.key === view);

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-4 lg:mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white lg:text-4xl">
            Find a game
          </h1>
          <p className="text-sm text-slate-400 lg:mt-1 lg:text-base">{VIEW_SUBTITLE[view]}</p>
        </div>
        <button
          onClick={() => navigate("/create")}
          className="hidden shrink-0 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark lg:block"
        >
          + Host a game
        </button>
      </div>

      {/* View switcher — Browse + your games (upcoming / hosting / past) */}
      <div className="relative mb-4 flex rounded-xl bg-slate-800 p-1">
        <div
          className="pointer-events-none absolute inset-y-1 rounded-lg bg-brand shadow-sm"
          style={{
            left: 4,
            width: "calc((100% - 8px) / 4)",
            transform: `translateX(${viewIndex * 100}%)`,
            transition: "transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`relative z-10 flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors duration-150 ${
              view === v.key ? "text-[#ffffff]" : "text-slate-400"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "browse" && (
        <>
          {/* Search + Filters button */}
          <div className="mb-4 flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2">
              <SearchIcon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
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
                <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-[11px] font-bold text-brand">
                  {activeCount}
                </span>
              )}
            </button>
          </div>

          {/* Results */}
          {loading ? (
            <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
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
            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800 py-12 text-center">
              <p className="text-sm text-slate-400">No games match your filters.</p>
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
            <>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">
                {visible.length} game{visible.length === 1 ? "" : "s"}
              </p>
              <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
                {visible.map((g) => (
                  <GameCard key={g.id} game={g} youAreIn={isInGame(g, me.id)} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {view !== "browse" &&
        (loading ? (
          <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
            <GameCardSkeleton />
            <GameCardSkeleton />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50 py-12 text-center">
            <p className="text-sm text-rose-600">Couldn't load your games.</p>
            <button
              onClick={reload}
              className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              Retry
            </button>
          </div>
        ) : myList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800 py-12 text-center">
            <p className="text-sm text-slate-400">
              {view === "hosting"
                ? "You're not hosting any games yet."
                : view === "past"
                ? "No past games."
                : "You haven't joined any upcoming games."}
            </p>
            {view === "hosting" ? (
              <button
                onClick={() => navigate("/create")}
                className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
              >
                Post a game
              </button>
            ) : (
              <button
                onClick={() => setView("browse")}
                className="mt-3 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
              >
                Browse games
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
            {myList.map((g) => {
              const canReview =
                view === "past" && g.hostId !== me.id && pendingIds.has(g.id);
              return (
                <div key={g.id} className="relative">
                  <GameCard game={g} youAreIn={isInGame(g, me.id)} />
                  {canReview && (
                    <button
                      onClick={() => setReviewGame(g)}
                      className="absolute right-3 top-3 z-10 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-dark active:scale-95"
                    >
                      Review
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}

      {showFilters && (
        <FilterModal
          filters={filters}
          setFilters={setFilters}
          count={visible.length}
          onClose={() => setShowFilters(false)}
        />
      )}
      {reviewGame && (
        <ReviewModal
          game={reviewGame}
          onDone={() => {
            setPendingIds((prev) => {
              const next = new Set(prev);
              next.delete(reviewGame.id);
              return next;
            });
            setReviewGame(null);
          }}
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
    <Modal
      onClose={onClose}
      backdropClassName="bg-black/50"
      panelClassName="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-slate-900 shadow-xl animate-pop-in"
      labelledBy="filters-modal-title"
    >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <p id="filters-modal-title" className="text-base font-bold text-white">Filters</p>
          <button
            onClick={onClose}
            aria-label="Close filters"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-800 active:scale-90"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 divide-y divide-slate-800 overflow-y-auto">
          {/* Section 1 — Game details */}
          <div className="px-4 py-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <ChipGroup label="Court type" options={typeOptions} value={f.type} onChange={(v) => set({ type: v })} />
              <MultiChipGroup label="Standard" options={skillOptions} values={f.skills} onChange={(v) => set({ skills: v })} />
            </div>
          </div>

          {/* Section 2 — Court & positions */}
          <div className="space-y-4 px-4 py-4">
            <ChipGroup label="Net height" options={netOptions} labels={netLabels} value={f.netHeight} onChange={(v) => set({ netHeight: v })} />
            <MultiChipGroup label="Position needed" options={positionOptions} values={f.positions} onChange={(v) => set({ positions: v })} />
          </div>

          {/* Section 3 — Timing */}
          <div className="space-y-5 px-4 py-4">
            {/* Dual-handle time range */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Game time</p>
                <span className="text-xs font-semibold text-slate-200">{timeLabel}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-slate-400">From</span>
                  <input
                    type="time"
                    value={f.minTime > 0 ? minsToHHMM(f.minTime) : ""}
                    onChange={(e) => set({ minTime: e.target.value ? hhmmToMins(e.target.value) : 0 })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-slate-400">To</span>
                  <input
                    type="time"
                    value={f.maxTime < 1440 ? minsToHHMM(f.maxTime) : ""}
                    onChange={(e) => set({ maxTime: e.target.value ? hhmmToMins(e.target.value) : 1440 })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                </label>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">Leave blank for any time.</p>
            </div>

            {/* Open spots */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Open spots</p>
                <span className="text-xs font-semibold text-slate-200">
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
        <div className="flex gap-2 border-t border-slate-800 px-4 py-3">
          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 active:scale-95"
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
    </Modal>
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

function MultiChipGroup({
  label,
  options,
  values,
  onChange,
  labels,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (v: string[]) => void;
  labels?: Record<string, string>;
}) {
  const toggle = (o: string) =>
    onChange(values.includes(o) ? values.filter((v) => v !== o) : [...values, o]);
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        <Chip active={values.length === 0} onClick={() => onChange([])}>Any</Chip>
        {options.map((o) => (
          <Chip key={o} active={values.includes(o)} onClick={() => toggle(o)}>
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
        active ? "bg-brand text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}


const minsToHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const hhmmToMins = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
};

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

