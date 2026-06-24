import type { AdminStats, AdminUser, AdminComment, Game, Highlight } from "../types";
import { api } from "../lib/api";

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
};
