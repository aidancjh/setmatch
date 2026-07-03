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

// Horizontal bar chart for a per-source breakdown. Bar width is relative to the
// biggest row; each row shows its raw count and (for non-'test' rows) its share.
function SourceBarChart({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: WaitlistSourceStat[];
  emptyText: string;
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <div className="space-y-2 pt-2">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">{emptyText}</p>
      ) : (
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
      )}
    </div>
  );
}

// Dependency-free SVG line chart for daily signup counts. No chart library in
// this repo, so this is hand-rolled: a polyline for the line, a matching
// filled polygon underneath for the area, and date labels on a sparse subset
// of days (every ~5th, plus the last) so they don't overlap.
function SignupsOverTimeChart({ rows }: { rows: WaitlistDayStat[] }) {
  if (rows.length === 0) return <p className="text-xs text-slate-400">No signups yet.</p>;

  const w = 700;
  const h = 140;
  const padX = 6;
  const padTop = 10;
  const padBottom = 22;
  const max = Math.max(1, ...rows.map((r) => r.count));
  const stepX = rows.length > 1 ? (w - padX * 2) / (rows.length - 1) : 0;
  const plotBottom = h - padBottom;

  const points = rows.map((r, i) => {
    const x = padX + i * stepX;
    const y = padTop + (plotBottom - padTop) * (1 - r.count / max);
    return { x, y };
  });
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPoints = `${padX},${plotBottom} ${linePoints} ${points[points.length - 1].x},${plotBottom}`;

  const labelEvery = Math.max(1, Math.ceil(rows.length / 6));

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full"
      role="img"
      aria-label={`Signups per day over the last ${rows.length} days, ranging from 0 to ${max}`}
    >
      <line x1={padX} y1={plotBottom} x2={w - padX} y2={plotBottom} stroke="#E2E8F0" strokeWidth="1" />
      <polygon points={areaPoints} fill="#FB923C" fillOpacity="0.12" />
      <polyline points={linePoints} fill="none" stroke="#FB923C" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
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

  const stages = [
    { label: "Visited /waitlist", value: data.visits, rate: null },
    { label: "Started typing an email", value: data.started, rate: data.startedRate },
    { label: "Submitted", value: data.submittedDb, rate: data.submittedRate },
  ];

  return (
    <div className="space-y-3 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Waitlist funnel (last 30 days)</h2>
      {data.posthogError && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          PostHog data unavailable ({data.posthogError}) — showing your database's signup count
          only. Visits, "started an email", and visits-by-source won't be accurate until this is
          fixed.
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        {stages.map((s) => (
          <div key={s.label} className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-2xl font-semibold text-slate-900">{s.value}</p>
            {s.rate !== null && <p className="text-xs text-slate-400">{s.rate}% of visits</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        PostHog also recorded {data.submittedPosthog} client-side submit events (informational —
        the count above is the source of truth from our own database).
      </p>

      {/* Daily signup counts from our own DB — no PostHog dependency. */}
      <div className="space-y-2 pt-2">
        <h3 className="text-sm font-semibold text-slate-900">Signups over time (last 30 days)</h3>
        <SignupsOverTimeChart rows={data.signupsByDay} />
      </div>

      {/* Per-channel breakdown. Visits come from PostHog (pageviews); signups
          from our own DB. Percentages exclude the private 'test' bucket. */}
      <SourceBarChart
        title="Page visits by source"
        rows={data.visitsBySource}
        emptyText="No visits recorded yet."
      />
      <SourceBarChart
        title="Signups by source"
        rows={data.bySource}
        emptyText="No signups yet."
      />
    </div>
  );
}
