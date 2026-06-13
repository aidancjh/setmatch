import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";

/** Gate a route behind sign-in. Redirects to /auth, remembering where to return. */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}
