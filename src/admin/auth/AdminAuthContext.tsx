import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getAdminToken, setAdminToken, adminApiClient, AdminApiError } from "../lib/adminApi";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AdminAuthValue {
  user: AdminUser | null;
  loading: boolean;
  /** Rejects with a human-readable message on wrong password / server error. */
  login: (password: string) => Promise<void>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      setLoading(false);
      return;
    }
    adminApiClient
      .get<AdminUser>("/admin/whoami")
      .then(setUser)
      .catch(() => setAdminToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (password: string) => {
    try {
      const { token } = await adminApiClient.post<{ token: string }>("/auth/login", { password });
      setAdminToken(token);
      const me = await adminApiClient.get<AdminUser>("/admin/whoami");
      setUser(me);
    } catch (e) {
      setAdminToken(null);
      throw new Error(e instanceof AdminApiError ? e.message : "Sign-in failed. Please try again.");
    }
  };

  const logout = () => {
    setAdminToken(null);
    setUser(null);
  };

  return (
    <AdminAuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
