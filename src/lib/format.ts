/** Formatting helpers for dates/times shown in the UI. */

export function formatDate(iso: string): string {
  // iso = "2026-06-20"
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(time: string): string {
  // time = "18:30"
  const [h, min] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(h, min, 0, 0);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "in 3 days" / "today" / "tomorrow" relative to now. */
export function relativeDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - now.getTime()) / 86400000);
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return `In ${days} days`;
  return `In ${Math.round(days / 7)}w`;
}

/** Compact "time ago" from an ISO timestamp, e.g. "just now", "5m", "3h", "2d". */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks}w ago`;
}

/** Today's date as a YYYY-MM-DD string in the user's local timezone. */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "6:00 PM – 8:30 PM" or just "6:00 PM" if no endTime */
export function formatTimeRange(startTime: string, endTime: string): string {
  if (!endTime) return formatTime(startTime);
  return `${formatTime(startTime)} – ${formatTime(endTime)}`;
}

export function isPast(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  target.setHours(23, 59, 59, 0);
  return target.getTime() < Date.now();
}
