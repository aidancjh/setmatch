# Admin Split + Waitlist Funnel Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all admin functionality out of the consumer app into a standalone, separately-deployed admin service with its own auth, its own capped DB connection pool, and its own rate limits — then add a "Funnel" tab showing waitlist visits → started-email → submitted conversion, sourced from PostHog.

**Architecture:** Same repo, same `package.json`, same Postgres database. Two Express entry points (`server/index.js` unchanged minus admin routes; new `server/admin-server.js`) deployed as two separate Railway services from the same repo, differing only by Start Command. Two Vite builds from one `npm run build` (`dist/` for the consumer app, `dist-admin/` for the admin app). Admin auth uses a distinct JWT secret/audience so a leaked consumer token can never authenticate against the admin service and vice versa. PostHog captures the waitlist funnel client-side; the admin service queries PostHog server-side with a private key that never reaches the browser.

**Tech Stack:** Express 4, `pg`, `jsonwebtoken`, `express-rate-limit`, React 18 + Vite 6 (existing stack — no new runtime dependencies added).

## Global Constraints

- Reuse the single existing Postgres database (`DATABASE_URL`) — no new DB role, no new instance.
- Reuse the existing Google OAuth Client (Client ID/Secret) — the admin service adds its own callback route; no new OAuth client is created.
- Admin JWT is a distinct token type: separate secret `ADMIN_JWT_SECRET`, `aud: "admin"` claim, 8h expiry (vs. the consumer JWT's 14d) — stored in the admin frontend under a distinct localStorage key (`admin.vb.token`) so it never collides with the consumer token (`vb.token`).
- One repo, one `package.json`, one `node_modules` — no nested package. `npm run build` produces both `dist/` and `dist-admin/`.
- Two Railway services from the same repo/root, differing only by **Start Command** (`node server/index.js` vs `node server/admin-server.js`).
- `server/db.js`'s pool gets a configurable `DB_POOL_MAX` env var (default unchanged) so the admin service can cap its pool independently of the consumer service.
- Admin login is **lookup-only, never creates a user**: `repo.findUserByEmail` + a `role === "admin"` check. Never call `repo.findOrCreateGoogleUser` from the admin service.
- No new npm dependencies: PostHog client-side uses the official inline snippet injected by a small helper (no `posthog-js`); PostHog server-side uses plain `fetch` (no `posthog-node`).
- Backend tests follow the existing convention exactly: Vitest + Supertest, no live DB access (mock `server/db.js`'s `query` via `vi.mock`, matching `tests/api.test.js`).
- This repo has zero frontend component-test infrastructure (no React Testing Library anywhere in `src/`) — new admin frontend code is implemented and verified via the Claude Code preview browser tools, not unit-tested. Do not introduce a new frontend test framework for this plan.
- Every new credential (`ADMIN_JWT_SECRET`, `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`, `VITE_POSTHOG_KEY`, `DB_POOL_MAX`) is read from `process.env` / `import.meta.env` exactly as existing code reads `JWT_SECRET` / `GOOGLE_CLIENT_ID` — never hard-coded.

---

## File Structure

**New files:**
- `server/lib/asyncHandler.js` — the `h()` async-route wrapper, extracted so both `server/index.js` and `server/adminRoutes.js` can use it without duplication.
- `server/security.js` — the shared Helmet config object, extracted so both servers get identical security headers.
- `server/adminAuth.js` — `signAdminToken`, `requireAdminAuth` middleware (admin-scoped JWT).
- `server/posthog.js` — `queryWaitlistFunnel()`, server-side PostHog HogQL query.
- `server/adminRoutes.js` — Express Router with every `/api/admin/*` route (moved from `server/index.js`) plus the new `GET /api/admin/analytics/funnel`.
- `server/admin-server.js` — standalone Express entry: admin Google OAuth, `adminRoutes.js`, serves `dist-admin/`.
- `admin.html` — Vite entry HTML for the admin build (repo root, sibling to `index.html`).
- `vite.admin.config.ts` — separate Vite config for the admin bundle.
- `src/admin-main.tsx` — admin app's React root.
- `src/admin/AdminApp.tsx` — admin app shell (moved/adapted from `src/pages/Admin.tsx`).
- `src/admin/lib/adminApi.ts` — fetch wrapper mirroring `src/lib/api.ts`, with its own token key.
- `src/admin/auth/AdminAuthContext.tsx` — minimal admin-only auth context.
- `src/admin/services/adminService.ts` — moved from `src/services/adminService.ts`, repointed at `adminApi`, plus a new `funnel()` call.
- `src/admin/pages/Funnel.tsx` — new tab showing the waitlist conversion funnel.
- `src/lib/posthog.ts` — tiny helper that injects the PostHog snippet and exposes `capture()`.

**Modified files:**
- `server/db.js` — configurable pool `max`.
- `server/middleware/rateLimiters.js` — add `adminApiLimiter`.
- `server/index.js` — remove `requireAdmin`, all `/api/admin/*` routes, the now-dead `GET /api/waitlist`; use the extracted `h`/Helmet config.
- `src/App.tsx` — remove the `/admin` route and its lazy import.
- `src/pages/Waitlist.tsx` — PostHog snippet init + `capture()` calls.
- `vitest.config.ts` — add `ADMIN_JWT_SECRET` test env.
- `package.json` — `build` script builds both bundles.
- `CLAUDE.md` — document the new admin service.

**Deleted:**
- `src/pages/Admin.tsx` (replaced by `src/admin/AdminApp.tsx`).
- `src/services/adminService.ts` (replaced by `src/admin/services/adminService.ts`).

---

### Task 1: Extract shared `h()` helper and Helmet config

**Files:**
- Create: `server/lib/asyncHandler.js`
- Create: `server/security.js`
- Modify: `server/index.js:239` (remove local `h` definition, import instead), `server/index.js:60-92` (use extracted Helmet options)
- Test: `tests/asyncHandler.test.js`

**Interfaces:**
- Produces: `h(fn)` — `(req, res) => void`, wraps an async Express handler so a thrown error becomes a 500 instead of crashing.
- Produces: `helmetOptions` — the exact object currently inline at `server/index.js:61-91`.

- [ ] **Step 1: Write the failing test**

```js
// tests/asyncHandler.test.js
import { describe, it, expect, vi } from "vitest";
import { h } from "../server/lib/asyncHandler.js";

describe("asyncHandler h()", () => {
  it("returns a 500 JSON error when the wrapped handler rejects", async () => {
    const req = {};
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const failing = h(async () => {
      throw new Error("boom");
    });
    await failing(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Something went wrong on the server." });
  });

  it("does nothing extra when the wrapped handler resolves", async () => {
    const req = {};
    const res = { status: vi.fn(), json: vi.fn() };
    const ok = h(async (_req, r) => {
      r.json({ done: true });
    });
    await ok(req, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ done: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/asyncHandler.test.js`
Expected: FAIL — `Cannot find module '../server/lib/asyncHandler.js'`

- [ ] **Step 3: Create `server/lib/asyncHandler.js`**

```js
// Wrap an async route so thrown errors become a 500 instead of crashing the
// process. Shared by server/index.js and server/adminRoutes.js.
export const h = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error("[api] error:", err);
    res.status(500).json({ error: "Something went wrong on the server." });
  });
```

- [ ] **Step 4: Create `server/security.js`**

```js
// Shared Helmet config, used by both server/index.js (consumer app) and
// server/admin-server.js (admin app) so both get identical security headers.
export const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
      mediaSrc: ["'self'", "blob:", "https://res.cloudinary.com"],
      connectSrc: [
        "'self'",
        "https://api.cloudinary.com",
        "https://api.resend.com",
        "https://*.ingest.sentry.io",
        "https://*.ingest.us.sentry.io",
      ],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
};
```

- [ ] **Step 5: Update `server/index.js` to use both**

In `server/index.js`, replace the inline `helmet({...})` call (lines 60-92) with:

```js
import { helmetOptions } from "./security.js";
// ...
app.use(helmet(helmetOptions));
```

Delete the local `const h = (fn) => ...` definition (around line 239) and add near the top imports:

```js
import { h } from "./lib/asyncHandler.js";
```

- [ ] **Step 6: Run test to verify it passes, and confirm no regression**

Run: `npx vitest run tests/asyncHandler.test.js`
Expected: PASS (2 tests)

Run: `npm test`
Expected: all existing suites still pass (this is a pure refactor — no behavior change)

- [ ] **Step 7: Commit**

```bash
git add server/lib/asyncHandler.js server/security.js server/index.js tests/asyncHandler.test.js
git commit -m "refactor: extract shared asyncHandler + Helmet config for admin service reuse"
```

---

### Task 2: Configurable DB pool size

**Files:**
- Modify: `server/db.js:17-20`
- Test: `tests/dbPool.test.js`

**Interfaces:**
- Produces: `pool.options.max` reflects `DB_POOL_MAX` env var when set, otherwise unchanged (pg's default, 10).

- [ ] **Step 1: Write the failing test**

```js
// tests/dbPool.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("db pool size", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("defaults to pg's default pool size when DB_POOL_MAX is unset", async () => {
    delete process.env.DB_POOL_MAX;
    const { pool } = await import("../server/db.js");
    expect(pool.options.max).toBe(10);
  });

  it("respects DB_POOL_MAX when set", async () => {
    process.env.DB_POOL_MAX = "5";
    const { pool } = await import("../server/db.js");
    expect(pool.options.max).toBe(5);
    delete process.env.DB_POOL_MAX;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dbPool.test.js`
Expected: FAIL — first test expects `10` but gets `undefined` (pg's own default isn't reflected in `.options.max` until explicitly set)

- [ ] **Step 3: Modify `server/db.js`**

Replace:

```js
export const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});
```

with:

```js
// Default matches pg's own built-in default (10). Set DB_POOL_MAX on the admin
// service so a burst of admin queries can never exhaust connections the
// consumer app's own (separately-pooled) service needs.
const poolMax = process.env.DB_POOL_MAX ? Number(process.env.DB_POOL_MAX) : 10;

export const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  max: poolMax,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dbPool.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/db.js tests/dbPool.test.js
git commit -m "feat: make DB pool size configurable via DB_POOL_MAX"
```

---

### Task 3: Admin rate limiter

**Files:**
- Modify: `server/middleware/rateLimiters.js`
- Modify: `tests/rateLimiters.test.js`

**Interfaces:**
- Produces: `adminApiLimiter` — exported rate-limit middleware, 60 requests/min, keyed by IP (matches `apiLimiter`'s shape).

- [ ] **Step 1: Write the failing test**

Update `tests/rateLimiters.test.js` to include the new limiter:

```js
import { describe, it, expect } from "vitest";
import {
  loginLimiter,
  signupLimiter,
  authLimiter,
  apiLimiter,
  contentLimiter,
  waitlistLimiter,
  adminApiLimiter,
} from "../server/middleware/rateLimiters.js";

describe("rateLimiters", () => {
  it("exports all seven limiters as middleware functions", () => {
    for (const limiter of [
      loginLimiter,
      signupLimiter,
      authLimiter,
      apiLimiter,
      contentLimiter,
      waitlistLimiter,
      adminApiLimiter,
    ]) {
      expect(typeof limiter).toBe("function");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rateLimiters.test.js`
Expected: FAIL — `adminApiLimiter` is not exported

- [ ] **Step 3: Add `adminApiLimiter` to `server/middleware/rateLimiters.js`**

Append:

```js
// The admin service is low-volume/trusted (a handful of admins, not the
// public), so this is tighter than the consumer app's apiLimiter — mainly a
// backstop against a runaway script or a compromised admin token, not normal
// traffic shaping.
export const adminApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — slow down." },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/rateLimiters.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add server/middleware/rateLimiters.js tests/rateLimiters.test.js
git commit -m "feat: add adminApiLimiter for the standalone admin service"
```

---

### Task 4: Admin-scoped JWT (`server/adminAuth.js`)

**Files:**
- Create: `server/adminAuth.js`
- Test: `tests/adminAuth.test.js`

**Interfaces:**
- Consumes: `query` from `server/db.js` (indirectly, via `server/repo.js`'s `findUserById` — but this module calls `repo.findUserById` directly, not `query`).
- Produces: `signAdminToken(userId, tokenVersion = 0)` → JWT string, claims `{ sub: userId, aud: "admin", tv: tokenVersion }`, 8h expiry. Reuses the existing `users.token_version` column (already used by the consumer JWT's revocation check in `server/auth.js`) — no new migration. Admin accounts are Google-OAuth-only (passwordless), so nothing else ever bumps this column for them; it exists purely as a manual "revoke this admin's sessions" lever.
- Produces: `requireAdminAuth` — Express middleware. Sets `req.userId` on success; 401 on missing/invalid/wrong-audience token, 401 if the account no longer exists, 403 if suspended, 401 if `tv` doesn't match the account's current `token_version` (revoked), 403 if `role !== "admin"`.

- [ ] **Step 1: Write the failing test**

```js
// tests/adminAuth.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

vi.mock("../server/repo.js", () => ({
  findUserById: vi.fn(),
}));

const ADMIN_SECRET = "test-admin-secret-not-for-production";

describe("adminAuth", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ADMIN_JWT_SECRET = ADMIN_SECRET;
  });

  it("signAdminToken produces a token with aud=admin, tv, and an 8h expiry", async () => {
    const { signAdminToken } = await import("../server/adminAuth.js");
    const token = signAdminToken("user_1", 2);
    const payload = jwt.verify(token, ADMIN_SECRET);
    expect(payload.sub).toBe("user_1");
    expect(payload.aud).toBe("admin");
    expect(payload.tv).toBe(2);
    const ttlSeconds = payload.exp - payload.iat;
    expect(ttlSeconds).toBe(8 * 60 * 60);
  });

  it("signAdminToken defaults tv to 0 when not passed", async () => {
    const { signAdminToken } = await import("../server/adminAuth.js");
    const token = signAdminToken("user_1");
    const payload = jwt.verify(token, ADMIN_SECRET);
    expect(payload.tv).toBe(0);
  });

  it("requireAdminAuth rejects a request with no token (401)", async () => {
    const { requireAdminAuth } = await import("../server/adminAuth.js");
    const req = { headers: {} };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await requireAdminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireAdminAuth rejects a consumer-style token signed with a different secret (401)", async () => {
    const { requireAdminAuth } = await import("../server/adminAuth.js");
    const wrongToken = jwt.sign({ sub: "user_1", tv: 0 }, "some-other-secret");
    const req = { headers: { authorization: `Bearer ${wrongToken}` } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await requireAdminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireAdminAuth rejects a valid admin-secret token whose account role isn't admin (403)", async () => {
    const repo = await import("../server/repo.js");
    repo.findUserById.mockResolvedValue({ id: "user_2", role: "user", suspended: false, token_version: 0 });
    const { signAdminToken, requireAdminAuth } = await import("../server/adminAuth.js");
    const token = signAdminToken("user_2", 0);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await requireAdminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireAdminAuth rejects a token whose tv no longer matches the account's token_version (revoked, 401)", async () => {
    const repo = await import("../server/repo.js");
    repo.findUserById.mockResolvedValue({ id: "user_4", role: "admin", suspended: false, token_version: 1 });
    const { signAdminToken, requireAdminAuth } = await import("../server/adminAuth.js");
    const token = signAdminToken("user_4", 0); // stale — DB now at token_version 1
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await requireAdminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireAdminAuth sets req.userId and calls next() for a valid admin", async () => {
    const repo = await import("../server/repo.js");
    repo.findUserById.mockResolvedValue({ id: "user_3", role: "admin", suspended: false, token_version: 0 });
    const { signAdminToken, requireAdminAuth } = await import("../server/adminAuth.js");
    const token = signAdminToken("user_3", 0);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await requireAdminAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe("user_3");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/adminAuth.test.js`
Expected: FAIL — `Cannot find module '../server/adminAuth.js'`

- [ ] **Step 3: Create `server/adminAuth.js`**

```js
// Admin-scoped JWT: a deliberately separate token type from server/auth.js's
// consumer JWT — different secret, different audience claim, shorter expiry.
// A leaked consumer token can never authenticate against the admin service
// (wrong secret entirely) and a leaked admin token expires within hours.
import jwt from "jsonwebtoken";
import { findUserById } from "./repo.js";

const DEV_SECRET = "coterie-admin-dev-secret-change-me";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || DEV_SECRET;

if (process.env.NODE_ENV === "production" && ADMIN_JWT_SECRET === DEV_SECRET) {
  console.error(
    "[adminAuth] FATAL: ADMIN_JWT_SECRET is not set. Set it in the admin service's Railway environment variables before deploying."
  );
  process.exit(1);
}

const ADMIN_TOKEN_TTL = "8h";

export function signAdminToken(userId, tokenVersion = 0) {
  return jwt.sign({ sub: userId, aud: "admin", tv: tokenVersion }, ADMIN_JWT_SECRET, {
    expiresIn: ADMIN_TOKEN_TTL,
  });
}

/**
 * Express middleware: requires a valid admin-audience Bearer token, then
 * re-checks the account's current role, suspended status, and token_version
 * on every request — a role downgrade, suspension, or explicit revocation
 * (bumping token_version) takes effect immediately, not after the 8h token
 * expires. Reuses the same users.token_version column server/auth.js's
 * consumer JWT already uses; admin accounts are passwordless (Google-OAuth
 * only) so nothing else ever bumps it — it's purely a manual revoke lever
 * here. Sets req.userId.
 */
export async function requireAdminAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not signed in." });

  let payload;
  try {
    payload = jwt.verify(token, ADMIN_JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }
  if (payload.aud !== "admin") {
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }

  try {
    const user = await findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: "Account not found." });
    if (user.suspended) return res.status(403).json({ error: "This account has been suspended." });
    if ((payload.tv ?? 0) !== (user.token_version ?? 0)) {
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
    if ((user.role || "user") !== "admin") {
      return res.status(403).json({ error: "Admin access required." });
    }
    req.userId = payload.sub;
    next();
  } catch (e) {
    console.error("[adminAuth] requireAdminAuth status check failed:", e);
    return res.status(503).json({ error: "Service temporarily unavailable. Please try again." });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/adminAuth.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/adminAuth.js tests/adminAuth.test.js
git commit -m "feat: admin-scoped JWT (separate secret, audience, and expiry from consumer auth)"
```

---

### Task 5: PostHog server-side query helper

**Files:**
- Create: `server/posthog.js`
- Test: `tests/posthog.test.js`

**Interfaces:**
- Produces: `queryWaitlistFunnel()` → `Promise<{ visits: number, started: number, submittedPosthog: number }>`. Throws on non-2xx or malformed PostHog response.

- [ ] **Step 1: Write the failing test**

```js
// tests/posthog.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("posthog.queryWaitlistFunnel", () => {
  beforeEach(() => {
    process.env.POSTHOG_PROJECT_ID = "494538";
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_test_key";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.POSTHOG_PROJECT_ID;
    delete process.env.POSTHOG_PERSONAL_API_KEY;
  });

  it("calls the PostHog Query API with the project id, bearer key, and a HogQL body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [[120, 45, 30]] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { queryWaitlistFunnel } = await import("../server/posthog.js");
    const result = await queryWaitlistFunnel();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://us.posthog.com/api/projects/494538/query/");
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBe("Bearer phx_test_key");
    const body = JSON.parse(opts.body);
    expect(body.query.kind).toBe("HogQLQuery");
    expect(body.query.query).toMatch(/FROM events/i);

    expect(result).toEqual({ visits: 120, started: 45, submittedPosthog: 30 });
  });

  it("throws when PostHog responds non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    );
    const { queryWaitlistFunnel } = await import("../server/posthog.js");
    await expect(queryWaitlistFunnel()).rejects.toThrow(/PostHog query failed/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/posthog.test.js`
Expected: FAIL — `Cannot find module '../server/posthog.js'`

- [ ] **Step 3: Create `server/posthog.js`**

```js
// Server-side PostHog query — uses the private Personal API Key, never the
// public client-side project token. Counts, over the last 30 days:
//   visits    — $pageview events on /waitlist
//   started   — custom "waitlist_email_started" events (first keystroke)
//   submittedPosthog — custom "waitlist_signup" events (client-fired on success)
// submittedPosthog is informational only; the admin route treats the app's
// own `waitlist` table count as the source of truth for actual submissions
// (PostHog can undercount due to ad blockers / consent declines).
const POSTHOG_HOST = process.env.POSTHOG_HOST || "https://us.posthog.com";

const FUNNEL_QUERY = `
  SELECT
    countIf(event = '$pageview' AND properties.$pathname = '/waitlist') AS visits,
    countIf(event = 'waitlist_email_started') AS started,
    countIf(event = 'waitlist_signup') AS submitted
  FROM events
  WHERE timestamp > now() - INTERVAL 30 DAY
`;

export async function queryWaitlistFunnel() {
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!projectId || !apiKey) {
    throw new Error("PostHog is not configured (POSTHOG_PROJECT_ID / POSTHOG_PERSONAL_API_KEY missing).");
  }

  const res = await fetch(`${POSTHOG_HOST}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: { kind: "HogQLQuery", query: FUNNEL_QUERY },
    }),
  });

  if (!res.ok) {
    throw new Error(`PostHog query failed (${res.status})`);
  }
  const data = await res.json();
  const row = data.results && data.results[0];
  if (!row) throw new Error("PostHog query failed: no results returned.");

  const [visits, started, submittedPosthog] = row;
  return { visits, started, submittedPosthog };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/posthog.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/posthog.js tests/posthog.test.js
git commit -m "feat: server-side PostHog HogQL query for the waitlist funnel"
```

---

### Task 6: `server/adminRoutes.js` — move admin routes, add the funnel route

**Files:**
- Create: `server/adminRoutes.js`
- Modify: `server/index.js` (delete lines ~880-1139: `requireAdmin` + every `/api/admin/*` route; delete `GET /api/waitlist` at ~1447-1453 — confirmed unused by any frontend page, its job is now served by `GET /api/admin/analytics/funnel` below; keep `POST /api/waitlist` unchanged, it's the public signup endpoint)
- Test: `tests/adminRoutes.test.js`

**Interfaces:**
- Consumes: `h` from `server/lib/asyncHandler.js`, `requireAdminAuth` from `server/adminAuth.js`, `queryWaitlistFunnel` from `server/posthog.js`, `repo.*` and `logAdminAction` from `server/repo.js`.
- Produces: default export — an Express `Router` mountable at `/api/admin` (routes below are written relative to that mount, e.g. `router.get("/stats", ...)` serves `/api/admin/stats`).

- [ ] **Step 1: Write the failing test**

```js
// tests/adminRoutes.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("../server/adminAuth.js", () => ({
  // Bypass real auth for these route-shape tests; auth itself is covered by
  // tests/adminAuth.test.js.
  requireAdminAuth: (req, _res, next) => {
    req.userId = "admin_1";
    next();
  },
}));

vi.mock("../server/repo.js", () => ({
  adminStats: vi.fn().mockResolvedValue({ users: 10, games: 3 }),
  getWaitlistCount: vi.fn().mockResolvedValue(7),
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../server/posthog.js", () => ({
  queryWaitlistFunnel: vi.fn().mockResolvedValue({ visits: 100, started: 40, submittedPosthog: 25 }),
}));

describe("adminRoutes", () => {
  let app;
  beforeEach(async () => {
    vi.clearAllMocks();
    const { default: adminRoutes } = await import("../server/adminRoutes.js");
    app = express();
    app.use(express.json());
    app.use("/api/admin", adminRoutes);
  });

  it("GET /api/admin/stats returns repo.adminStats()", async () => {
    const res = await request(app).get("/api/admin/stats");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ users: 10, games: 3 });
  });

  it("GET /api/admin/analytics/funnel combines PostHog counts with the DB waitlist count and computes rates", async () => {
    const res = await request(app).get("/api/admin/analytics/funnel");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      visits: 100,
      started: 40,
      submittedDb: 7,
      submittedPosthog: 25,
      startedRate: 40, // 40/100 * 100
      submittedRate: 7, // 7/100 * 100
    });
  });

  it("GET /api/admin/analytics/funnel returns zero rates when there are no visits (no divide-by-zero)", async () => {
    const posthog = await import("../server/posthog.js");
    posthog.queryWaitlistFunnel.mockResolvedValueOnce({ visits: 0, started: 0, submittedPosthog: 0 });
    const repo = await import("../server/repo.js");
    repo.getWaitlistCount.mockResolvedValueOnce(0);

    const res = await request(app).get("/api/admin/analytics/funnel");
    expect(res.status).toBe(200);
    expect(res.body.startedRate).toBe(0);
    expect(res.body.submittedRate).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/adminRoutes.test.js`
Expected: FAIL — `Cannot find module '../server/adminRoutes.js'`

- [ ] **Step 3: Create `server/adminRoutes.js`**

Move every handler currently at `server/index.js` lines 894-1139 into this router, unchanged in logic, plus the new funnel route. Full contents:

```js
// Every /api/admin/* route. Mounted by BOTH nowhere else — only
// server/admin-server.js mounts this, behind requireAdminAuth. The consumer
// app (server/index.js) no longer serves any /api/admin/* route at all.
import { Router } from "express";
import { h } from "./lib/asyncHandler.js";
import { requireAdminAuth } from "./adminAuth.js";
import { queryWaitlistFunnel } from "./posthog.js";
import * as repo from "./repo.js";

const router = Router();
router.use(requireAdminAuth);

router.get("/stats", h(async (_req, res) => res.json(await repo.adminStats())));

router.get("/users", h(async (_req, res) => res.json(await repo.adminListUsers())));

router.patch(
  "/users/:id/role",
  h(async (req, res) => {
    const user = await repo.setUserRole(req.params.id, req.body && req.body.role);
    if (!user) return res.status(400).json({ error: "Invalid role." });
    await repo.logAdminAction(req.userId, "set_role", `Set ${user.name}'s role to ${user.role}`);
    res.json(repo.publicUser(user));
  })
);

router.get("/games", h(async (_req, res) => res.json(await repo.adminListGames())));

router.delete(
  "/games/:id",
  h(async (req, res) => {
    const title = await repo.adminDeleteGame(req.params.id);
    await repo.logAdminAction(req.userId, "delete_game", `Deleted game "${title}"`);
    res.status(204).end();
  })
);

router.patch(
  "/users/:id/suspend",
  h(async (req, res) => {
    const target = await repo.findUserById(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found." });
    if ((target.role || "user") === "admin")
      return res.status(400).json({ error: "Admin accounts can't be suspended." });
    const user = await repo.setUserSuspended(req.params.id, req.body && req.body.suspended === true);
    await repo.logAdminAction(
      req.userId,
      "suspend_user",
      `${user.suspended ? "Suspended" : "Unsuspended"} ${user.name} (${user.email})`
    );
    res.json(repo.publicUser(user));
  })
);

router.delete(
  "/users/:id",
  h(async (req, res) => {
    const target = await repo.findUserById(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found." });
    if ((target.role || "user") === "admin")
      return res.status(400).json({ error: "Admin accounts can't be deleted here." });
    await repo.adminDeleteUser(req.params.id);
    await repo.logAdminAction(req.userId, "delete_user", `Removed ${target.name} (${target.email})`);
    res.status(204).end();
  })
);

router.get("/highlights", h(async (_req, res) => res.json(await repo.adminListHighlights())));

router.delete(
  "/highlights/:id",
  h(async (req, res) => {
    const owner = await repo.adminDeleteHighlight(req.params.id);
    await repo.logAdminAction(req.userId, "delete_highlight", `Deleted highlight by ${owner}`);
    res.status(204).end();
  })
);

router.get("/comments", h(async (_req, res) => res.json(await repo.adminListComments())));

router.delete(
  "/comments/:kind/:id",
  h(async (req, res) => {
    const kind = req.params.kind === "highlight" ? "highlight" : "game";
    await repo.adminDeleteComment(kind, req.params.id);
    await repo.logAdminAction(req.userId, "delete_comment", `Deleted a ${kind} comment`);
    res.status(204).end();
  })
);

router.post(
  "/seed-past-data",
  h(async (req, res) => {
    const { seedPastData } = await import("./seed.js");
    await seedPastData();
    await repo.logAdminAction(req.userId, "seed_past_data", "Ran: seed past data");
    res.json({ ok: true });
  })
);

router.get("/feedback", h(async (_req, res) => res.json(await repo.adminListFeedback())));

router.patch(
  "/feedback/:id/resolve",
  h(async (req, res) => {
    const resolved = !!(req.body && req.body.resolved);
    await repo.setFeedbackResolved(req.params.id, resolved);
    await repo.logAdminAction(
      req.userId,
      "feedback_resolve",
      `Marked feedback ${resolved ? "resolved" : "open"}`
    );
    res.json({ ok: true, resolved });
  })
);

router.delete(
  "/feedback/:id",
  h(async (req, res) => {
    await repo.adminDeleteFeedback(req.params.id);
    await repo.logAdminAction(req.userId, "feedback_delete", "Deleted a feedback item");
    res.status(204).end();
  })
);

router.get("/audit", h(async (_req, res) => res.json(await repo.adminListAudit())));

router.get("/reports", h(async (_req, res) => res.json(await repo.adminListReports())));

router.patch(
  "/reports/:id",
  h(async (req, res) => {
    const status = req.body && req.body.status;
    if (!(await repo.adminSetReportStatus(req.params.id, status)))
      return res.status(400).json({ error: "Invalid status." });
    await repo.logAdminAction(req.userId, "report_status", `Marked a report ${status}`);
    res.json({ ok: true, status });
  })
);

router.post(
  "/broadcast",
  h(async (req, res) => {
    const message = (req.body && req.body.message ? String(req.body.message) : "").trim();
    if (!message) return res.status(400).json({ error: "Message is required." });
    if (message.length > 280)
      return res.status(400).json({ error: "Keep announcements under 280 characters." });
    const count = await repo.broadcastAnnouncement(message);
    await repo.logAdminAction(req.userId, "broadcast", `Sent announcement to ${count} users: "${message.slice(0, 80)}"`);
    res.json({ ok: true, count });
  })
);

router.get("/flags", h(async (_req, res) => res.json(await repo.getFlags())));

router.patch(
  "/flags/:key",
  h(async (req, res) => {
    const key = req.params.key;
    if (!["maintenance_mode", "signups_enabled"].includes(key))
      return res.status(400).json({ error: "Unknown flag." });
    const enabled = !!(req.body && req.body.enabled);
    await repo.setFlag(key, enabled);
    await repo.logAdminAction(req.userId, "set_flag", `Set ${key} to ${enabled ? "ON" : "OFF"}`);
    res.json({ ok: true, key, enabled });
  })
);

// --- Waitlist funnel analytics --------------------------------------------
// submittedDb (from our own waitlist table) is the source of truth for actual
// submissions; submittedPosthog is informational only (PostHog can undercount
// due to ad blockers / consent declines).
router.get(
  "/analytics/funnel",
  h(async (_req, res) => {
    const [{ visits, started, submittedPosthog }, submittedDb] = await Promise.all([
      queryWaitlistFunnel(),
      repo.getWaitlistCount(),
    ]);
    const startedRate = visits > 0 ? Math.round((started / visits) * 100) : 0;
    const submittedRate = visits > 0 ? Math.round((submittedDb / visits) * 100) : 0;
    res.json({ visits, started, submittedDb, submittedPosthog, startedRate, submittedRate });
  })
);

export default router;
```

- [ ] **Step 4: Delete the moved code from `server/index.js`**

Delete lines ~880-1139 (the `requireAdmin` function and every `/api/admin/*` route — everything from `// --- Admin (role-enforced on the server, not just the UI) ---` through the `/api/admin/flags/:key` handler). Also delete the `GET /api/waitlist` handler at ~1447-1453 (`app.get("/api/waitlist", requireAuth, async (req, res) => {...})`) — confirmed unused by any frontend page; its job is superseded by `/api/admin/analytics/funnel`. Leave `POST /api/waitlist` untouched.

Also remove the now-unused `router.post("/seed-past-data", ...)`'s sibling in index.js if it still references `seedPastData` elsewhere — check with:

Run: `grep -n "requireAdmin\b" server/index.js`
Expected: no matches (confirms full removal)

- [ ] **Step 5: Run test to verify it passes, and confirm no regression**

Run: `npx vitest run tests/adminRoutes.test.js`
Expected: PASS (3 tests)

Run: `npm test`
Expected: all suites pass. `tests/api.test.js`'s "returns a JSON 404 for unknown /api routes" test and any other test that previously hit `/api/admin/*` on the main `app` must be checked — if any exist, they now correctly 404 (route removed from the consumer app), which is the intended behavior.

- [ ] **Step 6: Commit**

```bash
git add server/adminRoutes.js server/index.js tests/adminRoutes.test.js
git commit -m "refactor: move all /api/admin/* routes out of the consumer app into adminRoutes.js"
```

---

### Task 7: `server/admin-server.js` — standalone admin Express entry

**Files:**
- Create: `server/admin-server.js`
- Test: `tests/adminServer.test.js`

**Interfaces:**
- Consumes: `helmetOptions` from `server/security.js`, `adminApiLimiter` from `server/middleware/rateLimiters.js`, `signAdminToken`/`requireAdminAuth` from `server/adminAuth.js`, default export from `server/adminRoutes.js`, `repo.findUserByEmail` from `server/repo.js`.
- Produces: exported `app` (for tests) and a `start()` that's auto-invoked unless `NODE_ENV === "test"` (mirrors `server/index.js`'s pattern exactly).

- [ ] **Step 1: Write the failing test**

```js
// tests/adminServer.test.js
import { describe, it, expect, vi } from "vitest";
import request from "supertest";

vi.mock("../server/db.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, query: async () => ({ rows: [] }) };
});

const { app } = await import("../server/admin-server.js");

describe("admin-server (no DB access)", () => {
  it("protects /api/admin/* — 401 without a token", async () => {
    const res = await request(app).get("/api/admin/stats");
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/google redirects to Google's OAuth endpoint", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    const res = await request(app).get("/api/auth/google");
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/accounts\.google\.com/);
  });

  it("returns a JSON 404 for unknown /api routes", async () => {
    const res = await request(app).get("/api/this/route/does/not/exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/adminServer.test.js`
Expected: FAIL — `Cannot find module '../server/admin-server.js'`

- [ ] **Step 3: Create `server/admin-server.js`**

```js
// Standalone admin service — separate Railway deploy from the consumer app
// (server/index.js). Same repo, same Postgres, deliberately separate:
//   - own connection pool cap (set DB_POOL_MAX on this service in Railway)
//   - own JWT secret/audience (server/adminAuth.js) — a leaked consumer token
//     can never authenticate here
//   - own rate limiter (adminApiLimiter) — can't be starved by consumer traffic
//     because it isn't the same process
//   - own Google OAuth callback — LOOKUP ONLY, never creates a user. Signing
//     in here with a non-admin Google account is refused, not silently
//     turned into a new account (unlike the consumer app's Google flow).
import express from "express";
import helmet from "helmet";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { helmetOptions } from "./security.js";
import { adminApiLimiter } from "./middleware/rateLimiters.js";
import { signAdminToken } from "./adminAuth.js";
import adminRoutes from "./adminRoutes.js";
import { findUserByEmail } from "./repo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1);

app.use(helmet(helmetOptions));
app.use(express.json({ limit: "100kb" }));
app.use("/api", adminApiLimiter);

app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  const start = Date.now();
  res.on("finish", () => {
    console.log(`[admin-api] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// --- Admin Google OAuth (lookup-only, never creates a user) ---------------
const oauthStates = new Map();
const oauthCleanup = setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of oauthStates) if (now > exp) oauthStates.delete(k);
}, 60_000);
if (typeof oauthCleanup.unref === "function") oauthCleanup.unref();

app.get("/api/auth/google", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(503).json({ error: "Google login is not configured." });

  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  const state = crypto.randomBytes(16).toString("hex");
  oauthStates.set(state, Date.now() + 10 * 60 * 1000);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code, error, state } = req.query;
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;

  if (!state || !oauthStates.has(state) || Date.now() > oauthStates.get(state)) {
    oauthStates.delete(state);
    return res.redirect(`${appUrl}/?error=google_cancelled`);
  }
  oauthStates.delete(state);
  if (error || !code) return res.redirect(`${appUrl}/?error=google_cancelled`);

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${appUrl}/api/auth/google/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect(`${appUrl}/?error=google_failed`);

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser = await userRes.json();
    if (!googleUser.email) return res.redirect(`${appUrl}/?error=google_failed`);

    // Lookup only — an admin account must already exist with this email.
    // Signing in with Google never creates a new user from this service.
    const user = await findUserByEmail(googleUser.email);
    if (!user || (user.role || "user") !== "admin") {
      return res.redirect(`${appUrl}/?error=not_admin`);
    }
    if (user.suspended) return res.redirect(`${appUrl}/?error=suspended`);

    res.redirect(`${appUrl}/?token=${signAdminToken(user.id, user.token_version)}`);
  } catch (err) {
    console.error("[admin-api] google callback failed:", err);
    res.redirect(`${appUrl}/?error=google_failed`);
  }
});

app.use("/api/admin", adminRoutes);

// --- Serve the built admin frontend in production --------------------------
const distDir = path.join(__dirname, "..", "dist-admin");
if (fs.existsSync(path.join(distDir, "index.html"))) {
  app.use(express.static(distDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[admin-api] unhandled error:", err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

const PORT = process.env.PORT || 4100;

async function start() {
  // No initSchema()/seed — the consumer service (server/index.js) already
  // owns schema migrations. This service only ever reads/writes an
  // already-initialized database.
  app.listen(PORT, () => {
    console.log(`[admin-api] Coterie Admin listening on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== "test") {
  start().catch((err) => {
    console.error("[admin-api] failed to start:", err);
    process.exit(1);
  });
}

export { app };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/adminServer.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Add the local dev script and `.env.admin.example`**

In `package.json`, add:

```json
"dev:admin": "node --watch --env-file=.env.admin server/admin-server.js"
```

Create `.env.admin.example`:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/setmatch
DATABASE_SSL=false
DB_POOL_MAX=5
PORT=4100
APP_URL=http://localhost:5174
ADMIN_JWT_SECRET=replace-with-a-generated-secret
ADMIN_EMAILS=you@example.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
POSTHOG_PROJECT_ID=
POSTHOG_PERSONAL_API_KEY=
```

- [ ] **Step 6: Commit**

```bash
git add server/admin-server.js tests/adminServer.test.js package.json .env.admin.example
git commit -m "feat: standalone admin Express service (own auth, own OAuth callback, own rate limiter)"
```

---

### Task 8: Vite multi-build (admin bundle)

**Files:**
- Create: `admin.html`
- Create: `vite.admin.config.ts`
- Modify: `package.json` (`build` script)

**Interfaces:**
- Produces: `npm run build` emits both `dist/` (consumer, unchanged) and `dist-admin/` (new).

- [ ] **Step 1: Create `admin.html`** (repo root, sibling to the existing `index.html` — copy its structure, repoint the entry script)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Coterie Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/admin-main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `vite.admin.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Separate build for the admin app — deliberately NO VitePWA plugin (the
// admin dashboard has no offline/installable use case) and a distinct
// outDir so it never collides with the consumer app's dist/.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist-admin",
    rollupOptions: {
      input: "admin.html",
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:4100",
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 3: Update `package.json`'s `build` script**

Replace:

```json
"build": "tsc --noEmit && vite build",
```

with:

```json
"build": "tsc --noEmit && vite build && vite build --config vite.admin.config.ts",
```

Also add a `dev:admin:web` script:

```json
"dev:admin:web": "vite --config vite.admin.config.ts",
```

- [ ] **Step 4: Verify the build produces both bundles**

Run: `npm run build`
Expected: exits 0; `dist/index.html` and `dist-admin/index.html` both exist afterward.

(This step will fail at this point in the plan because `src/admin-main.tsx` doesn't exist yet — that's created in Task 10. Re-run this exact command again at the end of Task 10 to confirm.)

- [ ] **Step 5: Commit**

```bash
git add admin.html vite.admin.config.ts package.json
git commit -m "feat: add a second Vite build (dist-admin/) for the standalone admin app"
```

---

### Task 9: Admin frontend auth + API client

**Files:**
- Create: `src/admin/lib/adminApi.ts`
- Create: `src/admin/auth/AdminAuthContext.tsx`

**Interfaces:**
- Produces: `adminApi.get/post/patch/del` — same shape as `src/lib/api.ts`'s `api` object, but reads/writes the `admin.vb.token` localStorage key instead of `vb.token`.
- Produces: `AdminAuthProvider`, `useAdminAuth()` — `{ user, loading, logout }`. No signup/login-with-password path — the only way in is the Google OAuth redirect landing on `/?token=...`.

- [ ] **Step 1: Create `src/admin/lib/adminApi.ts`**

Mirrors `src/lib/api.ts` exactly, with one change: the token key.

```ts
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
```

- [ ] **Step 2: Create `src/admin/auth/AdminAuthContext.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getAdminToken, setAdminToken, adminApiClient } from "../lib/adminApi";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AdminAuthValue {
  user: AdminUser | null;
  loading: boolean;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Google OAuth lands back on "/?token=...". Consume it once, then clean
    // the URL so a refresh doesn't try to re-consume a stale query param.
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      setAdminToken(urlToken);
      window.history.replaceState({}, "", "/");
    }

    const token = getAdminToken();
    if (!token) {
      setLoading(false);
      return;
    }
    adminApiClient
      .get<AdminUser>("/admin/whoami")
      .then(setUser)
      .catch(() => setAdminToken(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = () => {
    setAdminToken(null);
    setUser(null);
  };

  return (
    <AdminAuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
```

- [ ] **Step 3: Add the `GET /api/admin/whoami` route it depends on**

`AdminAuthContext` calls `/admin/whoami` to validate the stored token on load — this route doesn't exist yet. Add it to `server/adminRoutes.js` (from Task 6), right after `router.use(requireAdminAuth);`:

```js
router.get(
  "/whoami",
  h(async (req, res) => {
    const user = await repo.findUserById(req.userId);
    res.json(repo.publicUser(user));
  })
);
```

Add a matching test to `tests/adminRoutes.test.js`:

```js
it("GET /api/admin/whoami returns the current admin's public profile", async () => {
  const repo = await import("../server/repo.js");
  repo.findUserById = vi.fn().mockResolvedValue({ id: "admin_1", name: "Ada", email: "ada@example.com", role: "admin" });
  repo.publicUser = vi.fn((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }));
  const res = await request(app).get("/api/admin/whoami");
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ id: "admin_1", name: "Ada", email: "ada@example.com", role: "admin" });
});
```

(This means the `vi.mock("../server/repo.js", ...)` block at the top of `tests/adminRoutes.test.js` needs `findUserById` and `publicUser` added to its mocked exports too.)

- [ ] **Step 4: Run the full backend test suite**

Run: `npm test`
Expected: all suites pass, including the new `whoami` test.

- [ ] **Step 5: Commit**

```bash
git add src/admin/lib/adminApi.ts src/admin/auth/AdminAuthContext.tsx server/adminRoutes.js tests/adminRoutes.test.js
git commit -m "feat: admin frontend auth context + API client + whoami endpoint"
```

---

### Task 10: Migrate the admin UI into `src/admin/`

**Files:**
- Create: `src/admin-main.tsx`
- Create: `src/admin/AdminApp.tsx` (moved from `src/pages/Admin.tsx`, imports repointed)
- Create: `src/admin/services/adminService.ts` (moved from `src/services/adminService.ts`, repointed at `adminApiClient`)
- Modify: `src/App.tsx` (remove the `/admin` route + its lazy import)
- Delete: `src/pages/Admin.tsx`
- Delete: `src/services/adminService.ts`

- [ ] **Step 1: Move `src/services/adminService.ts` to `src/admin/services/adminService.ts`**

Copy the file's content across unchanged except its two imports at the top:

```ts
import { adminApiClient as api } from "../lib/adminApi";
```

(replacing `import { api } from "../lib/api";`). The `import type { ... } from "../types"` line becomes `from "../../types"` (one directory deeper). Every call site in the file (`api.get(...)`, `api.patch(...)`, etc.) is unchanged — only the import lines move.

Delete the old `src/services/adminService.ts`.

- [ ] **Step 2: Move `src/pages/Admin.tsx` to `src/admin/AdminApp.tsx`**

Copy the file's content across unchanged except:
- Rename the default export function from `Admin` to `AdminApp`.
- Update `import { adminApi } from "../services/adminService";` to `import { adminApi } from "./services/adminService";`.
- Update `import { useAuth } from "../auth/AuthContext";` to `import { useAdminAuth as useAuth } from "./auth/AdminAuthContext";` (the aliasing keeps every other line in the 785-line file — which reads `user`, calls nothing else from auth — unchanged).
- Remove the `if (!isAdmin) { ... }` early-return block (and the `isAdmin` check itself) — the admin service's own `requireAdminAuth` on every API call plus `AdminAuthContext` already gate this at a higher level (see Step 3); a signed-in admin session on this service is by definition an admin.

Delete the old `src/pages/Admin.tsx`.

- [ ] **Step 3: Create `src/admin-main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AdminAuthProvider, useAdminAuth } from "./admin/auth/AdminAuthContext";
import AdminApp from "./admin/AdminApp";
import "./index.css";

function AdminGate() {
  const { user, loading } = useAdminAuth();

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-400">Loading…</p>;
  }
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-bold text-slate-900">Coterie Admin</h1>
        <p className="max-w-xs text-sm text-slate-500">Sign in with your admin Google account.</p>
        <a
          href="/api/auth/google"
          className="rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition active:scale-95"
        >
          Continue with Google
        </a>
      </div>
    );
  }
  return <AdminApp />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AdminAuthProvider>
      <AdminGate />
    </AdminAuthProvider>
  </StrictMode>
);
```

- [ ] **Step 4: Remove the `/admin` route from the consumer app**

In `src/App.tsx`, delete line 18 (`const Admin = lazy(() => import("./pages/Admin"));`) and delete the `<Route path="/admin" ... />` line (~74). The consumer app no longer serves `/admin` at all — it 404s via the SPA's normal not-found handling.

- [ ] **Step 5: Verify the build now succeeds end-to-end**

Run: `npx tsc --noEmit`
Expected: exits 0

Run: `npm run build`
Expected: exits 0; both `dist/index.html` and `dist-admin/index.html` exist (this re-confirms Task 8 Step 4, now that `src/admin-main.tsx` exists)

- [ ] **Step 6: Manual verification via the preview browser tools**

Start the admin dev server (`preview_start` against a `dev:admin:web` launch config) and the admin API (`npm run dev:admin` — requires a local `.env.admin` copied from `.env.admin.example`, pointing `DATABASE_URL` at a real Postgres since `whoami`/`stats` need one). Navigate to `http://localhost:5174`. Confirm:
- The "Continue with Google" screen renders when signed out.
- `preview_console_logs` shows no errors on load.

(A full sign-in can't be exercised without live Google OAuth credentials in this environment — note that limitation rather than skipping the check.)

- [ ] **Step 7: Commit**

```bash
git add src/admin-main.tsx src/admin/AdminApp.tsx src/admin/services/adminService.ts src/App.tsx
git rm src/pages/Admin.tsx src/services/adminService.ts
git commit -m "feat: migrate the admin UI into its own standalone app (src/admin/)"
```

---

### Task 11: Funnel tab

**Files:**
- Create: `src/admin/pages/Funnel.tsx`
- Modify: `src/admin/services/adminService.ts` (add the `funnel()` call)
- Modify: `src/admin/AdminApp.tsx` (add the "Funnel" tab to the existing tab bar)

**Interfaces:**
- Consumes: `GET /api/admin/analytics/funnel` → `{ visits, started, submittedDb, submittedPosthog, startedRate, submittedRate }` (from Task 6).

- [ ] **Step 1: Add `funnel()` to `src/admin/services/adminService.ts`**

```ts
interface WaitlistFunnel {
  visits: number;
  started: number;
  submittedDb: number;
  submittedPosthog: number;
  startedRate: number;
  submittedRate: number;
}

// add inside the exported `adminApi` object:
  funnel: () => api.get<WaitlistFunnel>("/admin/analytics/funnel"),
```

- [ ] **Step 2: Create `src/admin/pages/Funnel.tsx`**

```tsx
import { useEffect, useState } from "react";
import { adminApi } from "../services/adminService";

interface WaitlistFunnel {
  visits: number;
  started: number;
  submittedDb: number;
  submittedPosthog: number;
  startedRate: number;
  submittedRate: number;
}

export default function Funnel() {
  const [data, setData] = useState<WaitlistFunnel | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi
      .funnel()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load funnel data."));
  }, []);

  if (error) return <p className="p-4 text-sm text-rose-600">{error}</p>;
  if (!data) return <p className="p-4 text-sm text-slate-400">Loading…</p>;

  const stages = [
    { label: "Visited /waitlist", value: data.visits, rate: null },
    { label: "Started typing an email", value: data.started, rate: data.startedRate },
    { label: "Submitted", value: data.submittedDb, rate: data.submittedRate },
  ];

  return (
    <div className="space-y-3 p-4">
      <h2 className="text-sm font-semibold text-slate-900">Waitlist funnel (last 30 days)</h2>
      <div className="grid grid-cols-3 gap-3">
        {stages.map((s) => (
          <div key={s.label} className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-2xl font-semibold text-slate-900">{s.value}</p>
            {s.rate !== null && <p className="text-xs text-slate-400">{s.rate}% of visits</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        PostHog also recorded {data.submittedPosthog} client-side submit events (informational —
        the count above is the source of truth from our own database).
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Wire the tab into `src/admin/AdminApp.tsx`**

Add `"funnel"` to the `Tab` union type, add `{ key: "funnel", label: "Funnel" }` to the `tabs` array, import `Funnel from "./pages/Funnel"`, and render `{tab === "funnel" && <Funnel />}` alongside the existing tab-content conditionals.

- [ ] **Step 4: Manual verification**

Run: `npx tsc --noEmit`
Expected: exits 0

Via the preview browser tools (with the admin dev server + admin API running and a valid session — or by temporarily stubbing `adminApi.funnel` to resolve a fixed object for a visual check): confirm the Funnel tab renders three stat cards without console errors. `preview_inspect` the stat card values against whatever fixture/response was used.

- [ ] **Step 5: Commit**

```bash
git add src/admin/services/adminService.ts src/admin/pages/Funnel.tsx src/admin/AdminApp.tsx
git commit -m "feat: waitlist funnel tab in the admin dashboard"
```

---

### Task 12: PostHog client-side wiring on the waitlist page

**Files:**
- Create: `src/lib/posthog.ts`
- Modify: `src/pages/Waitlist.tsx`

**Interfaces:**
- Produces: `initPostHog()` (call once on mount), `captureEvent(name: string)`.

- [ ] **Step 1: Create `src/lib/posthog.ts`**

```ts
// Minimal PostHog wiring — no npm dependency. Injects the official inline
// snippet (client-side, public write-only project key) and exposes a tiny
// capture() wrapper. No-ops entirely if VITE_POSTHOG_KEY isn't set (e.g.
// local dev), so nothing breaks without it.
declare global {
  interface Window {
    posthog?: {
      init: (key: string, opts?: Record<string, unknown>) => void;
      capture: (event: string, props?: Record<string, unknown>) => void;
    };
  }
}

let initialized = false;

export function initPostHog() {
  if (initialized) return;
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key || typeof window === "undefined") return;
  initialized = true;

  // Official PostHog JS snippet (loads posthog-js from their CDN, then calls
  // init once loaded). Kept inline rather than an npm dependency to match
  // this repo's minimal client-dependency footprint.
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://us-assets.i.posthog.com/static/array.js";
  script.onload = () => {
    window.posthog?.init(key, {
      api_host: "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: true,
    });
  };
  document.head.appendChild(script);
}

export function captureEvent(name: string) {
  window.posthog?.capture(name);
}
```

- [ ] **Step 2: Wire it into `src/pages/Waitlist.tsx`**

Add the import:

```ts
import { initPostHog, captureEvent } from "../lib/posthog";
```

Add a mount effect near the existing canvas effect (after the `email`/`company`/`status`/`message` state declarations, around line 74-80):

```tsx
useEffect(() => {
  initPostHog();
}, []);
```

Change the email input's `onChange` (currently `onChange={(e) => setEmail(e.target.value)}` at line 447) to fire the "started" event exactly once, on the transition from empty to non-empty:

```tsx
onChange={(e) => {
  if (email === "" && e.target.value !== "") captureEvent("waitlist_email_started");
  setEmail(e.target.value);
}}
```

In `handleSubmit` (around line 193-216), add a capture call right after a successful response (inside the `else` branch that sets `status("success")`):

```tsx
} else {
  setMessage(data.message || "You're on the list. We'll be in touch before launch.");
  setStatus("success");
  captureEvent("waitlist_signup");
}
```

- [ ] **Step 3: Verify via the preview browser tools**

Start the consumer dev server, navigate to `/waitlist`. Since no `VITE_POSTHOG_KEY` exists locally, `initPostHog()` no-ops — confirm via `preview_console_logs` that there are no errors (the point of this check is confirming the no-op path is silent, not exercising real PostHog capture, which requires the production key).

Run: `npx tsc --noEmit`
Expected: exits 0

- [ ] **Step 4: Commit**

```bash
git add src/lib/posthog.ts src/pages/Waitlist.tsx
git commit -m "feat: PostHog client wiring on the waitlist page (pageview autocapture + started/submitted events)"
```

---

### Task 13: Test env, docs, and final regression pass

**Files:**
- Modify: `vitest.config.ts` (add `ADMIN_JWT_SECRET`)
- Modify: `CLAUDE.md` (document the new admin service)
- Modify: `.gitignore` (ensure `.env.admin` — not `.env.admin.example` — is ignored, matching the existing `.env` entry)

- [ ] **Step 1: Add `ADMIN_JWT_SECRET` to the test env**

In `vitest.config.ts`, add alongside the existing `JWT_SECRET` line:

```ts
ADMIN_JWT_SECRET: "test-admin-secret-not-for-production",
```

- [ ] **Step 2: Confirm `.env.admin` is gitignored**

Run: `grep -n "^\.env$\|^\.env\b" .gitignore`

If `.env.admin` isn't already covered by a broader `.env*` pattern, add a line `.env.admin` to `.gitignore` (do not ignore `.env.admin.example` — that one is meant to be committed, matching how `.env.example` is presumably already tracked).

- [ ] **Step 3: Update `CLAUDE.md`**

In the "Architecture" section's backend table, add a row:

```
| `admin-server.js` | Standalone admin API — separate Railway deploy, separate JWT (`ADMIN_JWT_SECRET`), own Google OAuth callback (lookup-only, never creates users), own rate limiter and DB pool cap. Mounts `adminRoutes.js`. |
```

Add a short new subsection after the existing backend table:

```markdown
### Admin app (`server/admin-server.js` + `src/admin/`)

The admin dashboard is a **separate deployment** from the consumer app — different Railway
service, different subdomain, different JWT secret/audience (`ADMIN_JWT_SECRET`, not
`JWT_SECRET`). It shares the same Postgres database via `server/db.js`, but with its own
capped connection pool (`DB_POOL_MAX`) so admin traffic can never starve the consumer app.

- `server/admin-server.js` — Express entry, mounts `server/adminRoutes.js` behind
  `server/adminAuth.js`'s `requireAdminAuth`. Serves `dist-admin/` in production.
- `src/admin/` — separate React app (`src/admin-main.tsx` entry, built via
  `vite.admin.config.ts` into `dist-admin/`). Sign-in is Google-OAuth-only, lookup-only
  (never creates a user — an admin account must already exist with `role = 'admin'`).
- Local dev: `npm run dev:admin` (API, port 4100) + `npm run dev:admin:web` (Vite, port
  5174) — copy `.env.admin.example` to `.env.admin` first.
- `npm run build` produces both `dist/` (consumer) and `dist-admin/` (admin) from one command.
```

- [ ] **Step 4: Run the full verification suite**

Run: `npm test`
Expected: all suites pass (no live DB — this repo has no local Postgres per existing convention)

Run: `npx tsc --noEmit`
Expected: exits 0

Run: `npm run lint`
Expected: 0 errors (pre-existing 2 warnings on `AuthContext.tsx`/`GameForm.tsx` fast-refresh are unrelated and unchanged)

Run: `npm run build`
Expected: exits 0; both `dist/` and `dist-admin/` produced

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts CLAUDE.md .gitignore
git commit -m "docs: document the standalone admin service; wire ADMIN_JWT_SECRET into the test env"
```

---

## After this plan lands (manual, on Aidan)

These cannot be done by an agent — no Railway/DNS/Google Cloud/PostHog dashboard access exists in this environment:

1. Create a new Railway service in the same project, same repo, **Start Command** override: `node server/admin-server.js` (build command stays the default `npm run build`, now produces `dist-admin/` too per Task 8).
2. Set env vars on that service: `DATABASE_URL` (copy from the main service), `DB_POOL_MAX=5`, `ADMIN_EMAILS` (copy), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (copy), `ADMIN_JWT_SECRET` (freshly generated, `openssl rand -hex 32`), `APP_URL=https://admin.coterie.com.de`, `POSTHOG_PROJECT_ID=494538`, `POSTHOG_PERSONAL_API_KEY` (the key created earlier).
3. Add the custom domain `admin.coterie.com.de` to that service in Railway; add the CNAME Railway gives you to wherever coterie.com.de's DNS is managed.
4. In Google Cloud Console, add `https://admin.coterie.com.de/api/auth/google/callback` to the existing OAuth client's authorized redirect URIs.
5. On the existing "coterie" (consumer) Railway service, add `VITE_POSTHOG_KEY` (the public Project token) as a build-time env var, then redeploy so the Waitlist page picks it up.
6. Visit `admin.coterie.com.de`, sign in with the admin Google account, confirm the dashboard and the new Funnel tab load real data.
