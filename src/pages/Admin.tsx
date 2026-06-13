import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AdminStats, AdminUser, Game } from "../types";
import { adminApi } from "../services/adminService";
import { useAuth } from "../auth/AuthContext";
import { formatDate } from "../lib/format";

type Tab = "overview" | "users" | "games";

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState("");

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    adminApi.stats().then(setStats).catch(() => {});
    adminApi.users().then(setUsers).catch(() => {});
    adminApi.games().then(setGames).catch(() => {});
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-slate-500">
          This area is for administrators only.
        </p>
        <button
          onClick={() => navigate("/")}
          className="mt-3 text-sm font-semibold text-brand underline"
        >
          Back to games
        </button>
      </div>
    );
  }

  const changeRole = async (u: AdminUser, role: AdminUser["role"]) => {
    setError("");
    try {
      await adminApi.setRole(u.id, role);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update role.");
    }
  };

  const removeGame = async (g: Game) => {
    if (!confirm(`Delete "${g.title}"? This removes it for everyone.`)) return;
    try {
      await adminApi.deleteGame(g.id);
      setGames((prev) => prev.filter((x) => x.id !== g.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete game.");
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "users", label: `Users${users.length ? ` (${users.length})` : ""}` },
    { key: "games", label: `Games${games.length ? ` (${games.length})` : ""}` },
  ];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">
        Admin
      </h1>
      <p className="mb-4 text-sm text-slate-500">
        Signed in as {user?.name} · admin
      </p>

      <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${
              tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
          {error}
        </p>
      )}

      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Total users" value={stats?.users} />
          <Stat label="New (7 days)" value={stats?.newUsers7d} />
          <Stat label="Total games" value={stats?.games} />
          <Stat label="Upcoming games" value={stats?.upcomingGames} />
          <Stat label="Comments" value={stats?.comments} />
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    to={`/user/${u.id}`}
                    className="truncate font-semibold text-slate-900 hover:underline"
                  >
                    {u.name}
                  </Link>
                  <p className="truncate text-xs text-slate-400">{u.email}</p>
                </div>
                <select
                  value={u.role}
                  onChange={(e) =>
                    changeRole(u, e.target.value as AdminUser["role"])
                  }
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                >
                  <option value="user">user</option>
                  <option value="staff">staff</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {u.hosted} hosted · {u.joined} joined · joined{" "}
                {new Date(u.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}

      {tab === "games" && (
        <div className="space-y-2">
          {games.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white p-3 shadow-sm"
            >
              <Link to={`/game/${g.id}`} className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{g.title}</p>
                <p className="truncate text-xs text-slate-400">
                  {formatDate(g.date)} · {g.players.length}/{g.totalSlots} · {g.hostName}
                </p>
              </Link>
              <button
                onClick={() => removeGame(g)}
                className="shrink-0 text-xs font-medium text-rose-500 hover:text-rose-600"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm">
      <p className="text-2xl font-bold text-slate-900">{value ?? "—"}</p>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
    </div>
  );
}
