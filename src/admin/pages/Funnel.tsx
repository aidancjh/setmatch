import { useEffect, useState } from "react";
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

// A section wrapper: consistent heading + spacing + a divider above every
// section but the first, so the five blocks read as one neat, scannable list.
function Section({
  title,
  first,
  children,
}: {
  title: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={first ? "space-y-2" : "space-y-2 border-t border-slate-100 pt-4"}>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  );
}

// Dependency-free SVG line+area chart (no chart library in this repo). Y axis
// is the count (0 at the baseline, max at the top, both labelled); X axis is
// the day, labelled on a sparse subset so dates don't overlap.
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

  const w = 700;
  const h = 150;
  const padX = 26; // room for the y-axis "0" / max labels
  const padTop = 14;
  const padBottom = 22;
  const max = Math.max(1, ...rows.map((r) => r.count));
  const plotBottom = h - padBottom;
  const stepX = rows.length > 1 ? (w - padX * 2) / (rows.length - 1) : 0;

  const points = rows.map((r, i) => {
    const x = padX + i * stepX;
    const y = padTop + (plotBottom - padTop) * (1 - r.count / max);
    return { x, y };
  });
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPoints = `${padX},${plotBottom} ${linePoints} ${points[points.length - 1].x},${plotBottom}`;
  const labelEvery = Math.max(1, Math.ceil(rows.length / 6));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={ariaLabel}>
      <line x1={padX} y1={plotBottom} x2={w - 4} y2={plotBottom} stroke="#E2E8F0" strokeWidth="1" />
      <polygon points={areaPoints} fill={color} fillOpacity="0.12" />
      <polyline points={linePoints} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <text x={padX - 4} y={plotBottom + 3} fontSize="9" textAnchor="end" fill="#94a3b8">0</text>
      <text x={padX - 4} y={padTop + 4} fontSize="9" textAnchor="end" fill="#94a3b8">{max}</text>
      {rows.map((r, i) => {
        if (i % labelEvery !== 0 && i !== rows.length - 1) return null;
        const x = padX + i * stepX;
        return (
          <text key={r.date} x={x} y={h - 6} fontSize="9" textAnchor="middle" fill="#94a3b8">
            {r.date.slice(5)}
          </text>
        );
      })}
    </svg>
  );
}

// Horizontal bar chart for a per-source breakdown: y axis is the source (one
// row per channel), x axis is the count. Bar width is relative to the biggest
// row; each row shows its raw count and (for non-'test' rows) its share.
function SourceBarChart({ rows, emptyText }: { rows: WaitlistSourceStat[]; emptyText: string }) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  if (rows.length === 0) return <p className="text-xs text-slate-400">{emptyText}</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.source} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs text-slate-600">
            {SOURCE_LABELS[r.source] ?? r.source}
          </span>
          <div className="relative h-5 flex-1 rounded bg-slate-100">
            <div
              className="h-5 rounded bg-orange-400"
              style={{ width: max > 0 ? `${Math.max(2, (r.count / max) * 100)}%` : "0%" }}
            />
          </div>
          <span className="w-24 shrink-0 text-right text-xs tabular-nums text-slate-500">
            {r.count}
            {r.percent !== null && <span className="text-slate-400"> · {r.percent}%</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function Funnel() {
  const [data, setData] = useState<WaitlistFunnel | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi
      .funnel()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load funnel data."));
  }, []);

  if (error) return <p className="p-4 text-sm text-rose-600">{error}</p>;
  if (!data) return <p className="p-4 text-sm text-slate-400">Loading…</p>;

  const conversionStats = [
    { label: "Visits", value: data.visits },
    { label: "Signups", value: data.submittedDb },
    { label: "Conversion", value: `${data.submittedRate}%` },
  ];

  return (
    <div className="space-y-4 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Waitlist funnel (last 30 days)</h2>
      {data.posthogError && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          PostHog data unavailable ({data.posthogError}) — showing your database's signup numbers
          only. Pageviews, conversion rate's visit count, pageviews over time, and pageviews by
          source won't be accurate until this is fixed.
        </p>
      )}

      {/* 1. Pageviews over time — PostHog pageviews, grouped by day. */}
      <Section title="Pageviews over time" first>
        <TimeSeriesLineChart
          rows={data.visitsByDay}
          emptyText="No visits recorded yet."
          color="#3B82F6"
          ariaLabel={`Page views per day over the last ${data.visitsByDay.length} days`}
        />
      </Section>

      {/* 2. Conversion rate — visits, signups, and the % between them. */}
      <Section title="Conversion rate">
        <div className="grid grid-cols-3 gap-3">
          {conversionStats.map((s) => (
            <div key={s.label} className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className="text-2xl font-semibold text-slate-900">{s.value}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          PostHog also recorded {data.submittedPosthog} client-side submit events (informational —
          the signup count above is the source of truth from our own database).
        </p>
      </Section>

      {/* 3. Signups over time — our own DB, no PostHog dependency. */}
      <Section title="Signups over time">
        <TimeSeriesLineChart
          rows={data.signupsByDay}
          emptyText="No signups yet."
          color="#FB923C"
          ariaLabel={`Signups per day over the last ${data.signupsByDay.length} days`}
        />
      </Section>

      {/* 4. Signups by source — our own DB (exact, immune to ad blockers). */}
      <Section title="Signups by source">
        <SourceBarChart rows={data.bySource} emptyText="No signups yet." />
      </Section>

      {/* 5. Pageviews by source — PostHog, grouped by utm_source. */}
      <Section title="Pageviews by source">
        <SourceBarChart rows={data.visitsBySource} emptyText="No visits recorded yet." />
      </Section>
    </div>
  );
}
