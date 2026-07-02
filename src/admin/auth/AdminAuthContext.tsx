import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getAdminToken, setAdminToken, adminApiClient } from "../lib/adminApi";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AdminAuthValue {
  user: AdminUser | null;
  loading: boolean;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Google OAuth lands back on "/?token=...". Consume it once, then clean
    // the URL so a refresh doesn't try to re-consume a stale query param.
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      setAdminToken(urlToken);
      window.history.replaceState({}, "", "/");
    }

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

  const logout = () => {
    setAdminToken(null);
    setUser(null);
  };

  return (
    <AdminAuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
