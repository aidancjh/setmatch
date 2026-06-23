/**
 * Tiny stale-while-revalidate cache for GET responses.
 *
 * Reads come from an in-memory Map first (synchronous, instant on navigation),
 * backed by localStorage so a freshly-opened app can paint last-known data
 * before the network responds. Pages render the cached value immediately, then
 * quietly swap in fresh data when the fetch resolves.
 *
 * The cache is per-signed-in-user: clearCache() runs on login and logout so one
 * account never sees another's data.
 */

const MEM = new Map<string, unknown>();
const PREFIX = "vb.cache.";

export function readCache<T>(key: string): T | undefined {
  if (MEM.has(key)) return MEM.get(key) as T;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return undefined;
    const val = JSON.parse(raw) as T;
    MEM.set(key, val);
    return val;
  } catch {
    return undefined;
  }
}

export function writeCache<T>(key: string, val: T): void {
  MEM.set(key, val);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(val));
  } catch {
    // Quota or private-mode failure — the in-memory copy still works this session.
  }
}

export function clearCache(): void {
  MEM.clear();
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
