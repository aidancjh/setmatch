import { useEffect, useState } from "react";
import type { Game } from "../types";
import { getGames, subscribe } from "../services/gamesService";

/** Reactive list of all games — re-fetches whenever the service notifies. */
export function useGames(): { games: Game[]; loading: boolean } {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      getGames().then((g) => {
        if (active) {
          setGames(g);
          setLoading(false);
        }
      });
    };
    refresh();
    const unsub = subscribe(refresh);
    return () => {
      active = false;
      unsub();
    };
  }, []);

  return { games, loading };
}
