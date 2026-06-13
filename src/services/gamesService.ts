/**
 * The single data-access layer for games.
 *
 * Phase 2: every function calls the Express API via `src/lib/api.ts`.
 * The function signatures are unchanged from Phase 1 (still async), so the
 * pages and hooks that import from here did not need to change.
 *
 * A lightweight subscribe/notify keeps lists fresh after a mutation, since
 * there is no realtime channel yet — components re-fetch on notify().
 */
import type { Game, NewGameInput } from "../types";
import { api } from "../lib/api";

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to any successful mutation. Returns an unsubscribe fn. */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

// --- Reads ----------------------------------------------------------------

export async function getGames(): Promise<Game[]> {
  return api.get<Game[]>("/games");
}

export async function getGame(id: string): Promise<Game | undefined> {
  try {
    return await api.get<Game>(`/games/${id}`);
  } catch {
    return undefined;
  }
}

// --- Mutations (require auth on the server) --------------------------------

export async function createGame(input: NewGameInput): Promise<Game> {
  const game = await api.post<Game>("/games", input);
  notify();
  return game;
}

export async function updateGame(
  id: string,
  input: NewGameInput
): Promise<Game> {
  const game = await api.patch<Game>(`/games/${id}`, input);
  notify();
  return game;
}

export async function joinGame(id: string): Promise<Game | undefined> {
  const game = await api.post<Game>(`/games/${id}/join`);
  notify();
  return game;
}

export async function leaveGame(id: string): Promise<Game | undefined> {
  const game = await api.post<Game>(`/games/${id}/leave`);
  notify();
  return game;
}

export async function toggleInterested(id: string): Promise<Game | undefined> {
  const game = await api.post<Game>(`/games/${id}/interested`);
  notify();
  return game;
}

export async function deleteGame(id: string): Promise<void> {
  await api.del<void>(`/games/${id}`);
  notify();
}

// --- Derived helpers (pure) -----------------------------------------------

export function spotsLeft(g: Game): number {
  return Math.max(0, g.totalSlots - g.players.length);
}

export function isInGame(g: Game, userId: string): boolean {
  return g.players.some((p) => p.id === userId);
}

export function isOnWaitlist(g: Game, userId: string): boolean {
  return g.waitlist.some((p) => p.id === userId);
}
