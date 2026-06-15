import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SkillLevel, User } from "../types";
import { api, getToken, setToken } from "../lib/api";

interface AuthState {
  user: User | null;
  loading: boolean;
  signup: (email: string, password: string, name: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateProfile: (update: {
    name?: string;
    skill?: SkillLevel;
    homeArea?: string;
    bio?: string;
    avatarUrl?: string;
    birthdate?: string | null;
    userGender?: string;
    showAge?: boolean;
    showGender?: boolean;
    favoritePositions?: string[];
    bannerColor?: string;
    bannerImage?: string;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, if we have a token, resolve the current user.
  useEffect(() => {
    let active = true;
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .get<{ user: User }>("/auth/me")
      .then((r) => active && setUser(r.user))
      .catch(() => {
        setToken(null); // stale/invalid token
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      async signup(email, password, name) {
        const r = await api.post<{ token: string; user: User }>(
          "/auth/signup",
          { email, password, name }
        );
        setToken(r.token);
        setUser(r.user);
      },
      async login(email, password) {
        const r = await api.post<{ token: string; user: User }>("/auth/login", {
          email,
          password,
        });
        setToken(r.token);
        setUser(r.user);
      },
      logout() {
        setToken(null);
        setUser(null);
      },
      async updateProfile(update) {
        const r = await api.patch<{ user: User }>("/auth/me", update);
        setUser(r.user);
      },
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
