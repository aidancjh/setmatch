import type { Profile } from "../types";
import { useAuth } from "../auth/AuthContext";

const GUEST: Profile = {
  id: "",
  name: "",
  skill: "Intermediate",
  homeArea: "",
};

/**
 * The current user as a non-null Profile. Returns a guest (empty id) when
 * signed out, so public screens like Browse can still call `isInGame(g, me.id)`
 * safely (it just returns false).
 */
export function useProfile(): Profile {
  const { user } = useAuth();
  return user ?? GUEST;
}
