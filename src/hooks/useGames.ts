import { useCallback, useEffect, useRef, useState } from "react";
import type { Game } from "../types";
import { getGames, subscribe } from "../services/gamesService";
import { readCache, writeCache } from "../lib/cache";

const CACHE_KEY = "games";

interface GamesState {
  games: Game[];
  loading: boolean;
  /** True once loading has taken a while (free-host cold start). */
  slow: boolean;
  /** Set if the fetch failed (offline / server error). */
  error: string | null;
  reload: () => void;
}

/** Reactive list of all games — re-fetches whenever the service notifies. */
export function useGames(): GamesState {
  // Render last-known games instantly from cache, then revalidate in the
  // background so navigating to Browse / My Games never shows a blank wait.
  const [games, setGames] = useState<Game[]>(() => readCache<Game[]>(CACHE_KEY) ?? []);
  const [loading, setLoading] = useState(() => readCache<Game[]>(CACHE_KEY) === undefined);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(true);
  const hasDataRef = useRef(readCache<Game[]>(CACHE_KEY) !== undefined);

  const refresh = useCallback(() => {
    setError(null);
    // If the first load drags on, the host is likely waking from sleep.
    const slowTimer = setTimeout(() => activeRef.current && setSlow(true), 4000);
    getGames()
      .then((g) => {
        if (!activeRef.current) return;
        setGames(g);
        writeCache(CACHE_KEY, g);
        hasDataRef.current = true;
        setError(null);
      })
      .catch((err) => {
        if (!activeRef.current) return;
        // Keep showing cached data if we have any; only surface the error when
        // there's nothing to show.
        if (!hasDataRef.current) {
          setError(
            err instanceof Error ? err.message : "Couldn't reach the server."
          );
        }
      })
      .finally(() => {
        clearTimeout(slowTimer);
        if (activeRef.current) {
          setLoading(false);
          setSlow(false);
        }
      });
  }, []);

  useEffect(() => {
    activeRef.current = true;
    refresh();
    const unsub = subscribe(refresh);
    return () => {
      activeRef.current = false;
      unsub();
    };
  }, [refresh]);

  return { games, loading, slow, error, reload: refresh };
}
