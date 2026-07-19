import { useCallback, useEffect, useState, type ReactNode } from "react";
import { adminApi } from "../services/adminService";

interface WaitlistSourceStat {
  source: string;
  count: number;
  percent: number | null; // null for the 'test' bucket (excluded from %)
}

interface WaitlistDayStat {
  date: string; // "YYYY-MM-DD"
  count: number;
}

interface WaitlistFunnel {
  visits: number;
  started: number;
  submittedDb: number;
  submittedPosthog: number;
  startedRate: number;
  submittedRate: number;
  bySource: WaitlistSourceStat[];
  visitsBySource: WaitlistSourceStat[];
  signupsByDay: WaitlistDayStat[];
  visitsByDay: WaitlistDayStat[];
  posthogError: string | null;
}

// Friendly labels for the channels we tag with utm_source.
const SOURCE_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  reddit: "Reddit",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  direct: "Direct / untagged",
  other: "Other",
  test: "Test (excluded)",
};

// "Nice" integer axis ticks from 0 up to at least max (~`targetSteps` steps of
// 1/2/5×10ⁿ). Guarantees whole-number increments so count axes never show
// fractions. Pass a larger targetSteps for a denser, finer-grained axis.
function niceTicks(max: number, targetSteps = 4): number[] {
  const m = Math.max(1, max);
  const rawStep = m / targetSteps;
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = Math.max(1, Math.round([1, 2, 5, 10].map((x) => x * pow).find((s) => s >= rawStep) ?? 10 * pow));
  const ticks: number[] = [];
  for (let v = 0; v <= m; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < m) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

// Picks up to `maxLabels` point indices out of `n`, spread as evenly as
// integer rounding allows (always including the first and last point). Using
// index % step to pick labels forces the last point in regardless of where it
// falls, so whenever (n - 1) isn't a multiple of the step the final gap ends
// up bigger or smaller than the rest — e.g. daily data landing on 5-day gaps
// except one 9-day jump at the end. Evenly interpolating the indices avoids
// that for any n, so this holds for whatever date range future data has.
function evenLabelIndices(n: number, maxLabels = 6): number[] {
  if (n <= 0) return [];
  if (n <= maxLabels) return Array.from({ length: n }, (_, i) => i);
  const idx = new Set<number>();
  for (let i = 0; i < maxLabels; i++) {
    idx.add(Math.round((i * (n - 1)) / (maxLabels - 1)));
  }
  return Array.from(idx).sort((a, b) => a - b);
}

// One stage of a drop-off funnel: a label, its count/share of the top stage,
// and a bar sized to that share so the shrinkage is visible at a glance.
function FunnelStage({
  label,
  count,
  pct,
  barColor,
}: {
  label: string;
  count: number;
  pct: number;
  barColor: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <span className="shrink-0 text-xs tabular-nums text-slate-500">
          {count.toLocaleString()} · {pct}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}

// A titled box. Every section is one of these so the tab reads as a stack of
// cards rather than loose blocks running together.
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {children}
    </section>
  );
}

// Dependency-free SVG line+area chart with a real y-axis: whole-number
// gridlines + labels up the side, sparse date labels along the bottom.
function TimeSeriesLineChart({
  rows,
  emptyText,
  color,
  ariaLabel,
  tickSteps = 4,
}: {
  rows: WaitlistDayStat[];
  emptyText: string;
  color: string;
  ariaLabel: string;
  /** Number of y-axis gridline steps — pass a larger value for a denser axis. */
  tickSteps?: number;
}) {
  if (rows.length === 0) return <p className="text-xs text-slate-400">{emptyText}</p>;

  const w = 340;
  const h = 300;
  const plotLeft = 30;
  const plotRight = w - 8;
  const plotTop = 12;
  const plotBottom = h - 22;
  const ticks = niceTicks(Math.max(...rows.map((r) => r.count)), tickSteps);
  const axisMax = ticks[ticks.length - 1];
  const stepX = rows.length > 1 ? (plotRight - plotLeft) / (rows.length - 1) : 0;
  const xOf = (i: number) => (rows.length > 1 ? plotLeft + i * stepX : (plotLeft + plotRight) / 2);
  const yOf = (v: number) => plotTop + (plotBottom - plotTop) * (1 - v / axisMax);
  const linePoints = rows.map((r, i) => `${xOf(i)},${yOf(r.count)}`).join(" ");
  const areaPoints = `${xOf(0)},${plotBottom} ${linePoints} ${xOf(rows.length - 1)},${plotBottom}`;
  const labelIndices = evenLabelIndices(rows.length, 6);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={ariaLabel}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={plotLeft} y1={yOf(t)} x2={plotRight} y2={yOf(t)} stroke="#EEF2F6" strokeWidth="1" />
          <text x={plotLeft - 6} y={yOf(t) + 3} fontSize="9" textAnchor="end" fill="#94a3b8">{t}</text>
        </g>
      ))}
      <polygon points={areaPoints} fill={color} fillOpacity="0.12" />
      <polyline points={linePoints} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* One dot per day, with a native tooltip (hover/tap) showing the exact count. */}
      {rows.map((r, i) => (
        <circle key={r.date} cx={xOf(i)} cy={yOf(r.count)} r="2.5" fill={color}>
          <title>{`${r.date}: ${r.count}`}</title>
        </circle>
      ))}
      {labelIndices.map((i) => (
        <text key={rows[i].date} x={xOf(i)} y={h - 6} fontSize="9" textAnchor="middle" fill="#94a3b8">
          {rows[i].date.slice(5)}
        </text>
      ))}
    </svg>
  );
}

// Horizontal bar chart: y axis is the source (one row per channel), x axis is
// the count. A shared x-scale with gridlines + tick labels makes it read as a
// chart even when only one source has data.
function SourceBarChart({ rows, emptyText }: { rows: WaitlistSourceStat[]; emptyText: string }) {
  if (rows.length === 0) return <p className="text-xs text-slate-400">{emptyText}</p>;
  const ticks = niceTicks(Math.max(...rows.map((r) => r.count)));
  const axisMax = ticks[ticks.length - 1];
  return (
    <div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.source} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-xs text-slate-600">
              {SOURCE_LABELS[r.source] ?? r.source}
            </span>
            <div className="relative h-6 flex-1 overflow-hidden rounded bg-slate-100">
              {ticks.slice(1).map((t) => (
                <span
                  key={t}
                  className="absolute inset-y-0 w-px bg-slate-200"
                  style={{ left: `${(t / axisMax) * 100}%` }}
                />
              ))}
              <div
                className="absolute inset-y-0 left-0 rounded bg-blue-400"
                style={{ width: `${Math.max(1, (r.count / axisMax) * 100)}%` }}
              />
            </div>
            <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-500">
              {r.count}
              {r.percent !== null && <span className="text-slate-400"> · {r.percent}%</span>}
            </span>
          </li>
        ))}
      </ul>
      {/* x-axis scale, aligned under the bar track (label col 7rem + gap, value col 6rem + gap) */}
      <div className="relative ml-[7.75rem] mr-[6.75rem] mt-1 h-4">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute -translate-x-1/2 text-[10px] tabular-nums text-slate-400"
            style={{ left: `${(t / axisMax) * 100}%` }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Funnel() {
  const [data, setData] = useState<WaitlistFunnel | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const fresh = await adminApi.funnel();
      setData(fresh);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load funnel data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return (
      <div className="p-4">
        {error ? (
          <div className="space-y-2">
            <p className="text-sm text-rose-600">{error}</p>
            <button
              onClick={load}
              disabled={loading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Retrying…" : "Try again"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Loading…</p>
        )}
      </div>
    );
  }

  const conversionStats = [
    { label: "Visits (since launch)", value: data.visits.toLocaleString() },
    { label: "Signups (all time)", value: data.submittedDb.toLocaleString() },
    { label: "Conversion", value: `${data.submittedRate}%` },
  ];

  // Drop-off funnel: visits → started the waitlist form → actually submitted.
  // `started`/`startedRate` already come back from the API but were never
  // rendered — they're exactly what turns a single "27% conversion" number
  // into an actionable "most people who leave, leave before opening the form"
  // (vs. abandoning partway through it). Both depend on PostHog visit/start
  // data, so skip it when that's unavailable (posthogError / zero visits)
  // rather than show a misleading all-zero funnel.
  const showDropoff = !data.posthogError && data.visits > 0;
  const startedPct = data.startedRate;
  const submittedPctOfVisits = data.submittedRate;
  const submittedPctOfStarted =
    data.started > 0 ? Math.min(100, Math.round((data.submittedDb / data.started) * 100)) : null;
  const dropBeforeStarting = Math.max(0, 100 - startedPct);
  const dropAfterStarting = submittedPctOfStarted !== null ? Math.max(0, 100 - submittedPctOfStarted) : null;
  const biggestDrop =
    dropAfterStarting !== null && dropAfterStarting > dropBeforeStarting
      ? { pct: dropAfterStarting, where: "after starting the form but before finishing it" }
      : { pct: dropBeforeStarting, where: "before ever opening the form" };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Waitlist funnel</h2>
        <div className="flex items-center gap-3">
          {updatedAt && (
            <span className="text-xs text-slate-400">Updated {updatedAt.toLocaleTimeString()}</span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <span aria-hidden className={loading ? "animate-spin" : ""}>↻</span>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          Couldn't refresh ({error}) — showing the last loaded numbers.
        </p>
      )}
      {data.posthogError && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          PostHog data unavailable ({data.posthogError}) — showing your database's signup numbers
          only. Pageviews, conversion rate's visit count, pageviews over time, and pageviews by
          source won't be accurate until this is fixed.
        </p>
      )}

      {/* 1, 2 & 3. Pageviews / signups over time plus the conversion-rate
          summary, in one row on desktop. The two charts are scaled down from
          filling the row edge-to-edge (was 7fr/7fr/6fr — 35/35/30%), and the
          conversion card is a bit wider still (6fr/6fr/7fr — 31.6/31.6/36.8%)
          now that it also holds the drop-off funnel below. Pageviews are
          scoped to "since launch" (server/posthog.js LAUNCH_DATE) — the
          pre-launch dev/QA traffic isn't meaningful to show next to real
          traffic. Signups stay all-time since those are real people already
          on the list. */}
      <div className="grid gap-4 md:grid-cols-[6fr_6fr_7fr]">
        <Card title="Pageviews over time (since launch)">
          <TimeSeriesLineChart
            rows={data.visitsByDay}
            emptyText="No visits recorded yet."
            color="#3B82F6"
            ariaLabel={`Page views per day, ${data.visitsByDay.length} days`}
            tickSteps={8}
          />
        </Card>

        <Card title="Signups over time (all time)">
          <TimeSeriesLineChart
            rows={data.signupsByDay}
            emptyText="No signups yet."
            color="#10B981"
            ariaLabel={`Signups per day, ${data.signupsByDay.length} days`}
          />
        </Card>

        <Card title="Conversion rate">
          <div className="flex flex-wrap gap-2">
            {conversionStats.map((s) => (
              <div key={s.label} className="rounded-lg bg-slate-50 px-3 py-1.5">
                <p className="text-[10px] text-slate-500">{s.label}</p>
                <p className="text-base font-semibold text-slate-900">{s.value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            PostHog also recorded {data.submittedPosthog} client-side submit events since launch
            (informational — the signup count above is the source of truth from our own database).
          </p>

          {/* Where visitors drop off — visits → started the form → actually
              submitted. Skipped when PostHog visit data isn't available since
              a start/visit-based funnel is meaningless without it. */}
          {showDropoff && (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Where visitors drop off
              </p>
              <FunnelStage label="Visited" count={data.visits} pct={100} barColor="bg-blue-400" />
              <FunnelStage
                label="Started the form"
                count={data.started}
                pct={startedPct}
                barColor="bg-amber-400"
              />
              <FunnelStage
                label="Signed up"
                count={data.submittedDb}
                pct={submittedPctOfVisits}
                barColor="bg-emerald-400"
              />
              {biggestDrop.pct > 0 && (
                <p className="rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] leading-snug text-rose-700">
                  Biggest drop-off: <strong>{biggestDrop.pct}%</strong> leave {biggestDrop.where}.
                </p>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* 4. Signups by source — our own DB (exact, immune to ad blockers). */}
      <Card title="Signups by source (all time)">
        <SourceBarChart rows={data.bySource} emptyText="No signups yet." />
      </Card>

      {/* 5. Pageviews by source — PostHog, grouped by utm_source. Scoped to a
          later cutoff than the rest of the launch metrics (see
          server/posthog.js SINCE_UTM_FIX) since a capture bug meant pre-fix
          pageviews carry no reliable source tag at all. */}
      <Card title="Pageviews by source (since tracking fix)">
        <SourceBarChart rows={data.visitsBySource} emptyText="No visits recorded yet." />
      </Card>
    </div>
  );
}
