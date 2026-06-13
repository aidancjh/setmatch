import type { AdminStats, AdminUser, Game } from "../types";
import { api } from "../lib/api";

export const adminApi = {
  stats: () => api.get<AdminStats>("/admin/stats"),
  users: () => api.get<AdminUser[]>("/admin/users"),
  games: () => api.get<Game[]>("/admin/games"),
  setRole: (id: string, role: AdminUser["role"]) =>
    api.patch<AdminUser>(`/admin/users/${id}/role`, { role }),
  deleteGame: (id: string) => api.del<void>(`/admin/games/${id}`),
};
