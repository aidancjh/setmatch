// Fetch wrapper for the admin API — identical behavior to src/lib/api.ts,
// but with its own localStorage key so an admin session can never be
// confused with (or overwrite) a consumer session in the same browser.
export const ADMIN_TOKEN_KEY = "admin.vb.token";
const TIMEOUT_MS = 30000;
const MAX_RETRIES = 2;

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null) {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export class AdminApiError extends Error {
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
  retry?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    ...(opts.body != null ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
        throw new AdminApiError(message, res.status);
      }
      return data as T;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof AdminApiError) throw err;
      lastErr = err;
      if (opts.retry && attempt < MAX_RETRIES) {
        await sleep(600 * (attempt + 1));
        continue;
      }
      throw new AdminApiError("Couldn't reach the server. Check your connection and try again.", 0);
    }
  }
  throw lastErr instanceof Error ? lastErr : new AdminApiError("Request failed.", 0);
}

export const adminApiClient = {
  get: <T>(path: string) => request<T>(path, { retry: true }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: "DELETE", body }),
};
