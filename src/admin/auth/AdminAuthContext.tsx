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
  /** Human-readable message when the last Google sign-in was rejected. */
  authError: string | null;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

// Messages for the ?error= codes the admin OAuth callback redirects with.
const AUTH_ERRORS: Record<string, string> = {
  not_admin:
    "That Google account is not an admin. You've been signed out — sign in with an admin account.",
  suspended: "That account is suspended.",
  google_failed: "Google sign-in failed. Please try again.",
  google_cancelled: "Google sign-in was cancelled.",
};

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Google OAuth lands back on "/?token=..." (success) or "/?error=..."
    // (rejected). Consume either once, then clean the URL so a refresh
    // doesn't re-consume a stale query param.
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    const urlError = params.get("error");
    if (urlToken) {
      setAdminToken(urlToken);
      window.history.replaceState({}, "", "/");
    } else if (urlError) {
      setAuthError(AUTH_ERRORS[urlError] ?? "Sign-in failed. Please try again.");
      // A rejected sign-in (wrong account, suspended) must not silently fall
      // through to a previously stored session — that made it look like the
      // rejected account had been let in. Drop any existing token and show
      // the sign-in gate with the error instead.
      if (urlError === "not_admin" || urlError === "suspended") {
        setAdminToken(null);
      }
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
    setAuthError(null);
  };

  return (
    <AdminAuthContext.Provider value={{ user, loading, authError, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
