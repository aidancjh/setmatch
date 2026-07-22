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
import type {
  AppNotification,
  ChatSummary,
  Comment,
  Game,
  Message,
  NewGameInput,
  UserProfile,
} from "../types";
import { api, newIdempotencyKey } from "../lib/api";

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

/** Force every subscriber (game lists, etc.) to re-fetch — used by pull-to-refresh. */
export function refreshAll() {
  notify();
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

export async function createGame(
  input: NewGameInput,
  repeatWeeks = 1
): Promise<Game> {
  const game = await api.post<Game>(
    "/games",
    { ...input, repeat: repeatWeeks },
    { "Idempotency-Key": newIdempotencyKey() }
  );
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

/** Cancel this and all later occurrences of a recurring series. */
export async function cancelSeries(id: string): Promise<{ count: number }> {
  const r = await api.post<{ ok: boolean; count: number }>(`/games/${id}/cancel-series`);
  notify();
  return { count: r.count };
}

// --- Host roster management ------------------------------------------------

export async function promoteMember(
  gameId: string,
  memberId: string
): Promise<Game> {
  const game = await api.post<Game>(`/games/${gameId}/members/${memberId}/promote`);
  notify();
  return game;
}

// --- User profiles --------------------------------------------------------

export async function getUserProfile(userId: string): Promise<UserProfile> {
  return api.get<UserProfile>(`/users/${userId}/profile`);
}

// --- Blocking --------------------------------------------------------------

export interface BlockedUser {
  id: string;
  name: string;
  avatarUrl: string;
}

export async function getBlocked(): Promise<BlockedUser[]> {
  return api.get<BlockedUser[]>("/blocks");
}

export async function blockUser(userId: string): Promise<void> {
  await api.post(`/users/${userId}/block`);
}

export async function unblockUser(userId: string): Promise<void> {
  await api.del(`/users/${userId}/block`);
}

// --- Comments -------------------------------------------------------------

export async function getComments(gameId: string): Promise<Comment[]> {
  return api.get<Comment[]>(`/games/${gameId}/comments`);
}

export async function addComment(
  gameId: string,
  body: string
): Promise<Comment[]> {
  return api.post<Comment[]>(`/games/${gameId}/comments`, { body });
}

export async function deleteComment(
  gameId: string,
  commentId: string
): Promise<Comment[]> {
  return api.del<Comment[]>(`/games/${gameId}/comments/${commentId}`);
}

// --- Chat (members-only group messages) -----------------------------------

export async function getChats(): Promise<ChatSummary[]> {
  return api.get<ChatSummary[]>("/chats");
}

export async function getMessages(gameId: string): Promise<Message[]> {
  return api.get<Message[]>(`/games/${gameId}/messages`);
}

export async function sendMessage(
  gameId: string,
  body: string
): Promise<Message> {
  return api.post<Message>(`/games/${gameId}/messages`, { body });
}

export async function deleteMessage(
  gameId: string,
  messageId: string
): Promise<void> {
  await api.del<void>(`/games/${gameId}/messages/${messageId}`);
}

// --- Cost splitting -------------------------------------------------------

export async function setMemberPaid(
  gameId: string,
  memberId: string,
  paid: boolean
): Promise<Game> {
  const game = await api.post<Game>(
    `/games/${gameId}/members/${memberId}/paid`,
    { paid }
  );
  notify();
  return game;
}

// --- Notifications --------------------------------------------------------

export async function getNotifications(): Promise<{
  items: AppNotification[];
  unreadCount: number;
}> {
  return api.get<{ items: AppNotification[]; unreadCount: number }>(
    "/notifications"
  );
}

export async function markNotificationsRead(): Promise<void> {
  await api.post<void>("/notifications/read-all");
}

export async function markNotificationRead(
  id: string
): Promise<{ ok: boolean; unreadCount: number }> {
  return api.post<{ ok: boolean; unreadCount: number }>(
    `/notifications/${id}/read`
  );
}

// --- Derived helpers (pure) -----------------------------------------------

export function spotsLeft(g: Game): number {
  return Math.max(0, g.totalSlots - g.players.length - (g.preFilled ?? 0));
}

export async function submitReview(
  gameId: string,
  rating: number,
  comment: string
): Promise<void> {
  await api.post("/reviews", { gameId, rating, comment });
}

export async function getPendingReviews(): Promise<Game[]> {
  return api.get<Game[]>("/reviews/pending");
}

export async function submitFeedback(
  type: "feedback" | "bug" | "other",
  subject: string,
  body: string
): Promise<void> {
  await api.post("/feedback", { type, subject, body });
}

export async function deleteAccount(password?: string): Promise<void> {
  await api.del("/auth/me", password ? { password } : undefined);
}

export async function getUserHighlights(userId: string): Promise<import("../types").Highlight[]> {
  return api.get<import("../types").Highlight[]>(`/users/${userId}/highlights`);
}

export function isInGame(g: Game, userId: string): boolean {
  return g.players.some((p) => p.id === userId);
}

export function isOnWaitlist(g: Game, userId: string): boolean {
  return g.waitlist.some((p) => p.id === userId);
}
