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

// "Nice" integer axis ticks from 0 up to at least max (~4 steps of 1/2/5×10ⁿ).
// Guarantees whole-number increments so count axes never show fractions.
function niceTicks(max: number): number[] {
  const m = Math.max(1, max);
  const rawStep = m / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = Math.max(1, Math.round([1, 2, 5, 10].map((x) => x * pow).find((s) => s >= rawStep) ?? 10 * pow));
  const ticks: number[] = [];
  for (let v = 0; v <= m; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < m) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
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
}: {
  rows: WaitlistDayStat[];
  emptyText: string;
  color: string;
  ariaLabel: string;
}) {
  if (rows.length === 0) return <p className="text-xs text-slate-400">{emptyText}</p>;

  const w = 340;
  const h = 300;
  const plotLeft = 30;
  const plotRight = w - 8;
  const plotTop = 12;
  const plotBottom = h - 22;
  const ticks = niceTicks(Math.max(...rows.map((r) => r.count)));
  const axisMax = ticks[ticks.length - 1];
  const stepX = rows.length > 1 ? (plotRight - plotLeft) / (rows.length - 1) : 0;
  const xOf = (i: number) => (rows.length > 1 ? plotLeft + i * stepX : (plotLeft + plotRight) / 2);
  const yOf = (v: number) => plotTop + (plotBottom - plotTop) * (1 - v / axisMax);
  const linePoints = rows.map((r, i) => `${xOf(i)},${yOf(r.count)}`).join(" ");
  const areaPoints = `${xOf(0)},${plotBottom} ${linePoints} ${xOf(rows.length - 1)},${plotBottom}`;
  const labelEvery = Math.max(1, Math.ceil(rows.length / 6));

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
      {rows.map((r, i) => {
        if (i % labelEvery !== 0 && i !== rows.length - 1) return null;
        return (
          <text key={r.date} x={xOf(i)} y={h - 6} fontSize="9" textAnchor="middle" fill="#94a3b8">
            {r.date.slice(5)}
          </text>
        );
      })}
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
                className="absolute inset-y-0 left-0 rounded bg-orange-400"
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

      {/* 1 & 3. Pageviews / signups over time, side by side so each chart gets
          a squarer aspect ratio instead of stretching full-width. Pageviews
          are scoped to "since launch" (server/posthog.js LAUNCH_DATE) — the
          pre-launch dev/QA traffic isn't meaningful to show next to real
          traffic. Signups stay all-time since those are real people already
          on the list. */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Pageviews over time (since launch)">
          <TimeSeriesLineChart
            rows={data.visitsByDay}
            emptyText="No visits recorded yet."
            color="#3B82F6"
            ariaLabel={`Page views per day, ${data.visitsByDay.length} days`}
          />
        </Card>

        <Card title="Signups over time (all time)">
          <TimeSeriesLineChart
            rows={data.signupsByDay}
            emptyText="No signups yet."
            color="#FB923C"
            ariaLabel={`Signups per day, ${data.signupsByDay.length} days`}
          />
        </Card>
      </div>

      {/* 2. Conversion rate — visits, signups, and the % between them. */}
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
      </Card>

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
