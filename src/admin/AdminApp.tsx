import { useEffect, useMemo, useState } from "react";
import { consumerUrl } from "./lib/links";
import type {
  AdminStats,
  AdminUser,
  AdminComment,
  AdminFeedback,
  AdminAuditEntry,
  AdminReport,
  Game,
  Highlight,
} from "../types";
import { adminApi } from "./services/adminService";
import { useAdminAuth as useAuth } from "./auth/AdminAuthContext";
import { formatDate } from "../lib/format";
import Funnel from "./pages/Funnel";

type Tab =
  | "overview"
  | "users"
  | "content"
  | "reports"
  | "feedback"
  | "activity"
  | "system"
  | "games"
  | "funnel";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function AdminApp() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [feedback, setFeedback] = useState<AdminFeedback[]>([]);
  const [audit, setAudit] = useState<AdminAuditEntry[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [userQuery, setUserQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi.stats().then(setStats).catch(() => {});
    adminApi.users().then(setUsers).catch(() => {});
    adminApi.games().then(setGames).catch(() => {});
    adminApi.highlights().then(setHighlights).catch(() => {});
    adminApi.comments().then(setComments).catch(() => {});
    adminApi.feedback().then(setFeedback).catch(() => {});
    adminApi.audit().then(setAudit).catch(() => {});
    adminApi.reports().then(setReports).catch(() => {});
    adminApi.flags().then(setFlags).catch(() => {});
  }, []);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, userQuery]);

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

  const resolveFeedback = async (f: AdminFeedback) => {
    setError("");
    try {
      await adminApi.resolveFeedback(f.id, !f.resolved);
      setFeedback((prev) =>
        prev.map((x) => (x.id === f.id ? { ...x, resolved: !f.resolved } : x))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update feedback.");
    }
  };

  const removeFeedback = async (f: AdminFeedback) => {
    if (!confirm("Delete this feedback item?")) return;
    setError("");
    try {
      await adminApi.deleteFeedback(f.id);
      setFeedback((prev) => prev.filter((x) => x.id !== f.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete feedback.");
    }
  };

  const setReportStatus = async (r: AdminReport, status: AdminReport["status"]) => {
    setError("");
    try {
      await adminApi.setReportStatus(r.id, status);
      setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update report.");
    }
  };

  const deleteReported = async (r: AdminReport) => {
    if (!confirm("Delete the reported content for everyone?")) return;
    setError("");
    try {
      if (r.targetType === "game") await adminApi.deleteGame(r.targetId);
      else if (r.targetType === "highlight") await adminApi.deleteHighlight(r.targetId);
      else if (r.targetType === "game_comment") await adminApi.deleteComment("game", r.targetId);
      else if (r.targetType === "highlight_comment") await adminApi.deleteComment("highlight", r.targetId);
      await adminApi.setReportStatus(r.id, "resolved");
      setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: "resolved" } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the content.");
    }
  };

  const toggleFlag = async (key: string) => {
    setError("");
    const next = !flags[key];
    try {
      await adminApi.setFlag(key, next);
      setFlags((prev) => ({ ...prev, [key]: next }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update setting.");
    }
  };

  const openFeedback = feedback.filter((f) => !f.resolved).length;
  const openReports = reports.filter((r) => r.status === "open").length;

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "users", label: `Users${users.length ? ` (${users.length})` : ""}` },
    { key: "content", label: "Content" },
    { key: "reports", label: `Reports${openReports ? ` (${openReports})` : ""}` },
    { key: "feedback", label: `Feedback${openFeedback ? ` (${openFeedback})` : ""}` },
    { key: "activity", label: "Activity" },
    { key: "system", label: "System" },
    { key: "games", label: `Games${games.length ? ` (${games.length})` : ""}` },
    { key: "funnel", label: "Funnel" },
  ];

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">
            Admin
          </h1>
          <p className="text-sm text-slate-500">
            Signed in as <span className="font-medium text-slate-700">{user?.email}</span> · admin
          </p>
        </div>
        <button
          onClick={logout}
          className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95"
        >
          Sign out
        </button>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition ${
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
                    <a
                      href={consumerUrl(`/user/${u.id}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 truncate font-semibold text-slate-900 hover:underline"
                    >
                      {u.name}
                      {u.suspended && (
                        <span className="shrink-0 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">
                          suspended
                        </span>
                      )}
                    </a>
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
                      <a
                        href={consumerUrl(`/game/${c.refId}`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {c.refTitle}
                      </a>
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

      {tab === "reports" && (
        <div className="space-y-2">
          {reports.map((r) => {
            const label =
              r.targetType === "game"
                ? "Game"
                : r.targetType === "highlight"
                ? "Highlight"
                : r.targetType === "game_comment"
                ? "Game comment"
                : "Highlight comment";
            return (
              <div
                key={r.id}
                className={`rounded-xl border p-3 shadow-sm ${
                  r.status === "open" ? "border-slate-100 bg-white" : "border-slate-100 bg-slate-50"
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                    {label}
                  </span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      r.status === "open"
                        ? "bg-amber-100 text-amber-700"
                        : r.status === "resolved"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {r.status}
                  </span>
                  <span className="ml-auto text-[11px] text-slate-400">{shortDate(r.createdAt)}</span>
                </div>
                <p className="text-sm font-medium text-slate-800">Reason: {r.reason || "—"}</p>
                <p className="mt-0.5 text-xs text-slate-400">Reported by {r.reporterName}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.targetType === "game" && (
                    <a
                      href={consumerUrl(`/game/${r.targetId}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                    >
                      View game
                    </a>
                  )}
                  {r.targetType === "highlight" && (
                    <a
                      href={consumerUrl("/highlights")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                    >
                      View highlights
                    </a>
                  )}
                  <button
                    onClick={() => deleteReported(r)}
                    className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                  >
                    Delete content
                  </button>
                  {r.status !== "resolved" && (
                    <button
                      onClick={() => setReportStatus(r, "resolved")}
                      className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      Resolve
                    </button>
                  )}
                  {r.status === "open" && (
                    <button
                      onClick={() => setReportStatus(r, "dismissed")}
                      className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {reports.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">No reports.</p>
          )}
        </div>
      )}

      {tab === "system" && (
        <div className="space-y-3">
          <BroadcastBox />
          <p className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Settings
          </p>
          <FlagRow
            label="Maintenance mode"
            sub="Blocks the app for everyone except admins (you still get in)."
            on={!!flags.maintenance_mode}
            danger
            onToggle={() => toggleFlag("maintenance_mode")}
          />
          <FlagRow
            label="Allow new sign-ups"
            sub="When off, new accounts can't be created (existing users unaffected)."
            on={flags.signups_enabled !== false}
            onToggle={() => toggleFlag("signups_enabled")}
          />
        </div>
      )}

      {tab === "feedback" && (
        <div className="space-y-2">
          {feedback.map((f) => (
            <div
              key={f.id}
              className={`rounded-xl border p-3 shadow-sm ${
                f.resolved ? "border-slate-100 bg-slate-50" : "border-slate-100 bg-white"
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    f.type === "bug"
                      ? "bg-rose-100 text-rose-600"
                      : f.type === "feedback"
                      ? "bg-sky-100 text-sky-700"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {f.type}
                </span>
                {f.resolved && (
                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                    resolved
                  </span>
                )}
                <span className="ml-auto text-[11px] text-slate-400">{shortDate(f.createdAt)}</span>
              </div>
              {f.subject && <p className="text-sm font-semibold text-slate-900">{f.subject}</p>}
              <p className="whitespace-pre-wrap text-sm text-slate-700">{f.body}</p>
              <p className="mt-1 text-xs text-slate-400">
                {f.userName}
                {f.userEmail ? ` · ${f.userEmail}` : ""}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => resolveFeedback(f)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    f.resolved
                      ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  {f.resolved ? "Reopen" : "Mark resolved"}
                </button>
                <button
                  onClick={() => removeFeedback(f)}
                  className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {feedback.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">No feedback yet.</p>
          )}
        </div>
      )}

      {tab === "activity" && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">
            Every admin action is recorded here (most recent first).
          </p>
          {audit.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
              <p className="text-sm text-slate-800">{a.detail || a.action}</p>
              <p className="mt-1 text-xs text-slate-400">
                {a.adminName} · {new Date(a.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
          {audit.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">No admin activity yet.</p>
          )}
        </div>
      )}

      {tab === "games" && (
        <div className="space-y-2">
          {games.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white p-3 shadow-sm"
            >
              <a
                href={consumerUrl(`/game/${g.id}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0"
              >
                <p className="truncate font-semibold text-slate-900">{g.title}</p>
                <p className="truncate text-xs text-slate-400">
                  {formatDate(g.date)} · {g.players.length}/{g.totalSlots} · {g.hostName}
                </p>
              </a>
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

      {tab === "funnel" && <Funnel />}
    </div>
  );
}

function BroadcastBox() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [err, setErr] = useState("");

  async function send() {
    const m = msg.trim();
    if (!m) return;
    if (!confirm(`Send this announcement to ALL users?\n\n"${m}"`)) return;
    setBusy(true);
    setErr("");
    setResult("");
    try {
      const r = await adminApi.broadcast(m);
      setResult(`Sent to ${r.count} ${r.count === 1 ? "user" : "users"}.`);
      setMsg("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send the announcement.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">📣 Broadcast announcement</p>
      <p className="mb-3 text-xs text-slate-400">
        Sends an in-app notification to every user. Use sparingly.
      </p>
      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value.slice(0, 280))}
        rows={3}
        placeholder="e.g. New feature: you can now rate teammates after a game!"
        className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
      />
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-slate-400">{msg.length}/280</span>
        <button
          onClick={send}
          disabled={busy || !msg.trim()}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40"
        >
          {busy ? "Sending…" : "Send to everyone"}
        </button>
      </div>
      {result && <p className="mt-2 text-sm font-medium text-emerald-600">{result}</p>}
      {err && <p className="mt-2 text-sm text-rose-600">{err}</p>}
    </div>
  );
}

function FlagRow({
  label,
  sub,
  on,
  onToggle,
  danger,
}: {
  label: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${danger && on ? "text-amber-600" : "text-slate-900"}`}>
          {label}
        </p>
        <p className="text-xs text-slate-400">{sub}</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          on ? (danger ? "bg-amber-500" : "bg-brand") : "bg-slate-200"
        }`}
      >
        <span
          className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
          style={{ transform: on ? "translateX(20px)" : "translateX(0)" }}
        />
      </button>
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
