/**
 * Tiny fetch wrapper for the Coterie API.
 * - Prefixes /api (Vite proxies this to the Express server in dev).
 * - Attaches the JWT from localStorage when present.
 * - Times out slow requests, and retries safe (GET) requests on transient
 *   failures — e.g. the free host waking from sleep.
 * - Throws an Error with the server's message on non-2xx responses.
 */

export const TOKEN_KEY = "vb.token";
const TIMEOUT_MS = 30000; // generous — the free host can cold-start ~30s
const MAX_RETRIES = 2;

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Whether this call is safe to auto-retry (true for GET). */
  retry?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(opts.body != null ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= (opts.retry ? MAX_RETRIES : 0); attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`/api${path}`, {
        method: opts.method || "GET",
        headers,
        body: opts.body == null ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      // Retry transient server errors on safe requests.
      if (opts.retry && [502, 503, 504].includes(res.status) && attempt < MAX_RETRIES) {
        await sleep(600 * (attempt + 1));
        continue;
      }

      if (res.status === 204) return undefined as T;
      const text = await res.text();
      let data: unknown = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      if (!res.ok) {
        const message =
          (data && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : null) || `Request failed (${res.status})`;
        throw new ApiError(message, res.status);
      }
      return data as T;
    } catch (err) {
      clearTimeout(timer);
      // Don't retry real API errors (4xx/5xx with a message) — only network/timeout.
      if (err instanceof ApiError) throw err;
      lastErr = err;
      if (opts.retry && attempt < MAX_RETRIES) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      throw new ApiError(
        "Couldn't reach the server. Check your connection and try again.",
        0
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new ApiError("Request failed.", 0);
}

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { retry: true }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: "POST", body, headers }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: "DELETE", body }),
};
