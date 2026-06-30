// Tracks the last time the user viewed each game's chat, so the Chats list can
// show an unread indicator. Stored per-device in localStorage (no server schema
// needed); timestamps are ISO strings so a lexical compare is chronological.

const KEY = "vb.chatSeen";

function read(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

export function markChatSeen(gameId: string, at: string): void {
  const map = read();
  // Only advance the marker forward.
  if (!map[gameId] || at > map[gameId]) {
    map[gameId] = at;
    try {
      localStorage.setItem(KEY, JSON.stringify(map));
    } catch {
      /* storage full / unavailable — non-critical */
    }
  }
}

export function isChatUnread(gameId: string, lastMessageAt?: string | null): boolean {
  if (!lastMessageAt) return false;
  const seen = read()[gameId];
  return !seen || lastMessageAt > seen;
}
