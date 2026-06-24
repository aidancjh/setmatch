import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { AdminStats, AdminUser, AdminComment, Game, Highlight } from "../types";
import { adminApi } from "../services/adminService";
import { useAuth } from "../auth/AuthContext";
import { formatDate } from "../lib/format";

type Tab = "overview" | "users" | "content" | "games";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [error, setError] = useState("");

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    adminApi.stats().then(setStats).catch(() => {});
    adminApi.users().then(setUsers).catch(() => {});
    adminApi.games().then(setGames).catch(() => {});
    adminApi.highlights().then(setHighlights).catch(() => {});
    adminApi.comments().then(setComments).catch(() => {});
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

  const toggleSuspend = async (u: AdminUser) => {
    setError("");
    try {
      await adminApi.setSuspended(u.id, !u.suspended);
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, suspended: !u.suspended } : x))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the user.");
    }
  };

  const removeUser = async (u: AdminUser) => {
    if (!confirm(`Permanently delete ${u.name} (${u.email})? This removes all their games, highlights, and data. There is no undo.`)) return;
    setError("");
    try {
      await adminApi.removeUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the user.");
    }
  };

  const removeGame = async (g: Game) => {
    if (!confirm(`Delete "${g.title}"? This removes it for everyone.`)) return;
    setError("");
    try {
      await adminApi.deleteGame(g.id);
      setGames((prev) => prev.filter((x) => x.id !== g.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete game.");
    }
  };

  const removeHighlight = async (h: Highlight) => {
    if (!confirm("Delete this highlight for everyone?")) return;
    setError("");
    try {
      await adminApi.deleteHighlight(h.id);
      setHighlights((prev) => prev.filter((x) => x.id !== h.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete highlight.");
    }
  };

  const removeComment = async (c: AdminComment) => {
    if (!confirm("Delete this comment for everyone?")) return;
    setError("");
    try {
      await adminApi.deleteComment(c.kind, c.id);
      setComments((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete comment.");
    }
  };

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, userQuery]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "users", label: `Users${users.length ? ` (${users.length})` : ""}` },
    { key: "content", label: "Content" },
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
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Total users" value={stats?.users} />
            <Stat label="New (7 days)" value={stats?.newUsers7d} />
            <Stat label="New (30 days)" value={stats?.newUsers30d} />
            <Stat label="Suspended" value={stats?.suspendedUsers} />
            <Stat label="Total games" value={stats?.games} />
            <Stat label="Upcoming games" value={stats?.upcomingGames} />
            <Stat label="Highlights" value={stats?.highlights} />
            <Stat label="Comments" value={stats?.comments} />
          </div>
          <SignupsChart data={stats?.signupsByWeek} />
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-2">
          <input
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="mb-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
          {filteredUsers.map((u) => {
            const isSelf = u.id === user?.id;
            const isAdminRow = u.role === "admin";
            return (
              <div
                key={u.id}
                className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      to={`/user/${u.id}`}
                      className="flex items-center gap-1.5 truncate font-semibold text-slate-900 hover:underline"
                    >
                      {u.name}
                      {u.suspended && (
                        <span className="shrink-0 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">
                          suspended
                        </span>
                      )}
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
                {!isAdminRow && !isSelf && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => toggleSuspend(u)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        u.suspended
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                      }`}
                    >
                      {u.suspended ? "Unsuspend" : "Suspend"}
                    </button>
                    <button
                      onClick={() => removeUser(u)}
                      className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {filteredUsers.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">No users match.</p>
          )}
        </div>
      )}

      {tab === "content" && (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Highlights ({highlights.length})
            </p>
            <div className="space-y-2">
              {highlights.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white p-2.5 shadow-sm"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                      {h.thumbUrl || h.mediaType === "photo" ? (
                        <img
                          src={h.mediaType === "photo" ? h.videoUrl : h.thumbUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm">🎬</div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {h.caption || <span className="text-slate-400">No caption</span>}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {h.userName} · {shortDate(h.createdAt)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeHighlight(h)}
                    className="shrink-0 text-xs font-medium text-rose-500 hover:text-rose-600"
                  >
                    Delete
                  </button>
                </div>
              ))}
              {highlights.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-400">No highlights.</p>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Recent comments ({comments.length})
            </p>
            <div className="space-y-2">
              {comments.map((c) => (
                <div
                  key={`${c.kind}-${c.id}`}
                  className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-sm text-slate-700">{c.body}</p>
                    <button
                      onClick={() => removeComment(c)}
                      className="shrink-0 text-xs font-medium text-rose-500 hover:text-rose-600"
                    >
                      Delete
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {c.author} ·{" "}
                    <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-500">
                      {c.kind === "highlight" ? "highlight" : "game"}
                    </span>{" "}
                    {c.kind === "game" ? (
                      <Link to={`/game/${c.refId}`} className="hover:underline">
                        {c.refTitle}
                      </Link>
                    ) : (
                      c.refTitle
                    )}{" "}
                    · {shortDate(c.createdAt)}
                  </p>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-400">No comments.</p>
              )}
            </div>
          </div>
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

function SignupsChart({ data }: { data?: { week: string; count: number }[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Signups (last 8 weeks)
        </p>
        <p className="py-6 text-center text-sm text-slate-400">Not enough data yet.</p>
      </div>
    );
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Signups (last 8 weeks)
      </p>
      <div className="flex h-28 items-end justify-between gap-1.5">
        {data.map((d) => (
          <div key={d.week} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] font-semibold text-slate-500">{d.count}</span>
            <div
              className="w-full rounded-t bg-brand/80"
              style={{ height: `${Math.max(4, (d.count / max) * 80)}px` }}
              title={`Week of ${d.week}: ${d.count}`}
            />
            <span className="text-[9px] text-slate-400">{shortDate(d.week)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
