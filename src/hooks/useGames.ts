import { useCallback, useEffect, useRef, useState } from "react";
import type { Game } from "../types";
import { getGames, subscribe } from "../services/gamesService";

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
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(true);

  const refresh = useCallback(() => {
    setError(null);
    // If the first load drags on, the host is likely waking from sleep.
    const slowTimer = setTimeout(() => activeRef.current && setSlow(true), 4000);
    getGames()
      .then((g) => {
        if (!activeRef.current) return;
        setGames(g);
        setError(null);
      })
      .catch((err) => {
        if (!activeRef.current) return;
        setError(
          err instanceof Error ? err.message : "Couldn't reach the server."
        );
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
