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

      {/* Per-channel attribution from our own DB (utm_source captured at signup).
          Percentages exclude the 'test' bucket. */}
      <div className="space-y-2 pt-2">
        <h3 className="text-sm font-semibold text-slate-900">Signups by source</h3>
        {data.bySource.length === 0 ? (
          <p className="text-xs text-slate-400">No signups yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1 font-medium">Source</th>
                <th className="py-1 text-right font-medium">Signups</th>
                <th className="py-1 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {data.bySource.map((s) => (
                <tr key={s.source} className="border-t border-slate-100">
                  <td className="py-1.5 text-slate-700">
                    {SOURCE_LABELS[s.source] ?? s.source}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-900">{s.count}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500">
                    {s.percent === null ? "—" : `${s.percent}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
