import { useEffect, useState } from "react";
import { adminApi } from "../services/adminService";

interface WaitlistFunnel {
  visits: number;
  started: number;
  submittedDb: number;
  submittedPosthog: number;
  startedRate: number;
  submittedRate: number;
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
    </div>
  );
}
