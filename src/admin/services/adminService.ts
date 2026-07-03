import type {
  AdminStats,
  AdminUser,
  AdminComment,
  AdminFeedback,
  AdminAuditEntry,
  AdminReport,
  Game,
  Highlight,
} from "../../types";
import { adminApiClient as api } from "../lib/adminApi";

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

export const adminApi = {
  stats: () => api.get<AdminStats>("/admin/stats"),
  users: () => api.get<AdminUser[]>("/admin/users"),
  games: () => api.get<Game[]>("/admin/games"),
  setRole: (id: string, role: AdminUser["role"]) =>
    api.patch<AdminUser>(`/admin/users/${id}/role`, { role }),
  setSuspended: (id: string, suspended: boolean) =>
    api.patch<AdminUser>(`/admin/users/${id}/suspend`, { suspended }),
  removeUser: (id: string) => api.del<void>(`/admin/users/${id}`),
  deleteGame: (id: string) => api.del<void>(`/admin/games/${id}`),
  highlights: () => api.get<Highlight[]>("/admin/highlights"),
  deleteHighlight: (id: string) => api.del<void>(`/admin/highlights/${id}`),
  comments: () => api.get<AdminComment[]>("/admin/comments"),
  deleteComment: (kind: AdminComment["kind"], id: string) =>
    api.del<void>(`/admin/comments/${kind}/${id}`),
  feedback: () => api.get<AdminFeedback[]>("/admin/feedback"),
  resolveFeedback: (id: string, resolved: boolean) =>
    api.patch<{ ok: boolean; resolved: boolean }>(`/admin/feedback/${id}/resolve`, { resolved }),
  deleteFeedback: (id: string) => api.del<void>(`/admin/feedback/${id}`),
  audit: () => api.get<AdminAuditEntry[]>("/admin/audit"),
  reports: () => api.get<AdminReport[]>("/admin/reports"),
  setReportStatus: (id: string, status: AdminReport["status"]) =>
    api.patch<{ ok: boolean; status: string }>(`/admin/reports/${id}`, { status }),
  flags: () => api.get<Record<string, boolean>>("/admin/flags"),
  setFlag: (key: string, enabled: boolean) =>
    api.patch<{ ok: boolean }>(`/admin/flags/${key}`, { enabled }),
  broadcast: (message: string) =>
    api.post<{ ok: boolean; count: number }>("/admin/broadcast", { message }),
  // Cache-busted (?t=) so the Funnel tab's Refresh button always pulls live
  // numbers, never a stale cached response.
  funnel: () => api.get<WaitlistFunnel>(`/admin/analytics/funnel?t=${Date.now()}`),
};
