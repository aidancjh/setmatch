import { useEffect, useState } from "react";
import { adminApi } from "../services/adminService";

interface WaitlistSourceStat {
  source: string;
  count: number;
  percent: number | null; // null for the 'test' bucket (excluded from %)
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
