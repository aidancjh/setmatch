# Backend Split — Phase 0: Shared Infra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the cross-cutting pieces currently tangled into `server/index.js` — the 6 rate-limiter configs, the two HTML email templates + the Resend send calls, 3 shared formatting helpers (`esc`, `prettyTime`, `calDate`), and the `requireAdmin` middleware — into their own small modules, with zero behavior/URL/response change, as the foundation for the later per-domain route/repo split (Phases 1–6).

**Architecture:** New `server/middleware/rateLimiters.js` (rate limiter configs), new `server/email.js` (email templates/senders + the 3 formatting helpers), and `requireAdmin` relocated into `server/auth.js` (it's an auth concern, was previously defined inline in `index.js`). `index.js` imports all of these back in; every route's behavior is unchanged.

**Tech Stack:** Node.js, Express 4, `express-rate-limit`, `@sentry/node`, Vitest + Supertest (existing test stack — no new test tooling).

## Global Constraints

- Zero behavior change: same URLs, same response bodies, same error messages, same rate-limit thresholds. This is code relocation, not a rewrite.
- The full existing test suite (currently 53 passing, 1 DB-gated skip) must keep passing unchanged after every task — it hits `app` (exported from `server/index.js`) via supertest regardless of how `app` is internally composed, so it is the primary regression check.
- Every task ends with `npx tsc --noEmit` clean and `npx vitest run` green before committing.
- One task = one commit. After each commit, fast-forward `main` and push (Railway auto-deploys), then verify `https://coterie.com.de/healthz` returns `{"status":"ok"}` before starting the next task — mirrors the delivery rhythm used for the 2026-06-30 security hardening work.
- Do not touch any route's URL, HTTP method, or middleware ordering other than swapping a locally-defined function/const for an imported one.

---

### Task 1: Extract rate limiters into `server/middleware/rateLimiters.js`

**Files:**
- Create: `server/middleware/rateLimiters.js`
- Modify: `server/index.js` (import + delete the 5 limiter definitions in the "Rate limiters" block, delete the `waitlistLimiter` definition further down)
- Test: `tests/rateLimiters.test.js` (new)

**Interfaces:**
- Produces: `loginLimiter`, `signupLimiter`, `authLimiter`, `apiLimiter`, `contentLimiter`, `waitlistLimiter` — all named exports, each an Express middleware function (the return value of `rateLimit({...})`), used identically to how they're used today.

- [ ] **Step 1: Write the failing test**

Create `tests/rateLimiters.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  loginLimiter,
  signupLimiter,
  authLimiter,
  apiLimiter,
  contentLimiter,
  waitlistLimiter,
} from "../server/middleware/rateLimiters.js";

describe("rateLimiters", () => {
  it("exports all six limiters as middleware functions", () => {
    for (const limiter of [
      loginLimiter,
      signupLimiter,
      authLimiter,
      apiLimiter,
      contentLimiter,
      waitlistLimiter,
    ]) {
      expect(typeof limiter).toBe("function");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rateLimiters.test.js`
Expected: FAIL — `Cannot find module '../server/middleware/rateLimiters.js'`

- [ ] **Step 3: Create the module**

Create `server/middleware/rateLimiters.js`:

```js
// Central definitions for every express-rate-limit instance used across the
// API. Each future per-domain router imports exactly the limiters it needs
// (e.g. the auth router owns loginLimiter/signupLimiter). apiLimiter (global,
// applied to all of /api) and the maintenance-mode gate stay in index.js since
// they apply across every domain rather than belonging to one.
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// Login: only FAILED attempts count (skipSuccessfulRequests), so legitimate
// users — including several people behind one shared IP/NAT — are never blocked
// by simply signing in. Only repeated wrong-password attempts (the brute-force
// signature) trip it.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many failed login attempts — please wait 15 minutes and try again." },
});

// Signup: caps mass account creation per IP, but lenient enough for several
// people on the same network (e.g. testers on shared Wi-Fi).
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-ups from this network — please try again later." },
});

// Password reset / forgot: sensitive and rarely used legitimately, so kept
// strict to prevent reset-email spam and token guessing.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts — please wait 15 minutes and try again." },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — slow down." },
});

// Tighter per-user limiter for user-generated content (comments, chat) to
// curb spam. Keyed by the authenticated user id (these routes sit behind
// requireAuth), so it limits a person rather than a shared NAT/IP.
export const contentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
  message: { error: "You're posting too fast — please slow down." },
});

// Lenient per-IP cap: mobile carriers route many real users through a few
// shared IPs (CGNAT), so a strict limit would block genuine signups during a
// viral launch. The real bot defenses are the honeypot on the route itself
// (and a CAPTCHA if added) — this just stops one IP hammering the endpoint
// thousands of times.
export const waitlistLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many signups from this network — try again later." },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/rateLimiters.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Wire the import into `server/index.js`**

In `server/index.js`, change the `express-rate-limit` import line from:

```js
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
```

to:

```js
import {
  loginLimiter,
  signupLimiter,
  authLimiter,
  apiLimiter,
  contentLimiter,
  waitlistLimiter,
} from "./middleware/rateLimiters.js";
```

- [ ] **Step 6: Delete the old limiter definitions from `server/index.js`**

Delete this entire block (currently right after the `express.json` line, under the `// --- Rate limiters --------------------------------------------------------` comment) — from the comment through the last `const contentLimiter = rateLimit({...});` — leaving only the five `app.use(...)` mounting lines that reference the now-imported limiters:

```js
// --- Rate limiters --------------------------------------------------------
// Login: only FAILED attempts count (skipSuccessfulRequests), so legitimate
// users — including several people behind one shared IP/NAT — are never blocked
// by simply signing in. Only repeated wrong-password attempts (the brute-force
// signature) trip it.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many failed login attempts — please wait 15 minutes and try again." },
});
// Signup: caps mass account creation per IP, but lenient enough for several
// people on the same network (e.g. testers on shared Wi-Fi).
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-ups from this network — please try again later." },
});
// Password reset / forgot: sensitive and rarely used legitimately, so kept
// strict to prevent reset-email spam and token guessing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts — please wait 15 minutes and try again." },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — slow down." },
});
// Tighter per-user limiter for user-generated content (comments, chat) to
// curb spam. Keyed by the authenticated user id (these routes sit behind
// requireAuth), so it limits a person rather than a shared NAT/IP.
const contentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
  message: { error: "You're posting too fast — please slow down." },
});
```

Leave the five lines immediately after it untouched:

```js
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/signup", signupLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api", apiLimiter);
```

- [ ] **Step 7: Delete the `waitlistLimiter` local definition**

Find and delete (further down in `server/index.js`, in the "Waitlist" section, immediately before `app.post("/api/waitlist", ...)`):

```js
const waitlistLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many signups from this network — try again later." },
});

```

Leave the line right after it (`app.post("/api/waitlist", waitlistLimiter, async (req, res) => {`) untouched — it now resolves `waitlistLimiter` from the top-of-file import.

- [ ] **Step 8: Type-check and run the full test suite**

Run: `npx tsc --noEmit`
Expected: no output (clean)

Run: `npx vitest run`
Expected: `Test Files  5 passed | 1 skipped`, `Tests  54 passed | 1 skipped` (53 existing + the 1 new rate-limiter test)

- [ ] **Step 9: Commit**

```bash
git add server/middleware/rateLimiters.js server/index.js tests/rateLimiters.test.js
git commit -m "Architecture: extract rate limiters into middleware/rateLimiters.js"
```

- [ ] **Step 10: Deploy and verify**

```bash
git checkout main
git merge --ff-only harden/backend-security
git push origin main
git checkout harden/backend-security
```

Then fetch `https://coterie.com.de/healthz` and confirm it returns `{"status":"ok"}`.

---

### Task 2: Extract email templates + shared formatters into `server/email.js`

**Files:**
- Create: `server/email.js`
- Modify: `server/index.js` (import; delete `esc`, `prettyTime`, `calDate`, `MAIL_FROM` definitions; replace the inline Resend `fetch` blocks in the forgot-password and join routes with calls to the new functions)
- Test: `tests/email.test.js` (new)

**Interfaces:**
- Consumes (from `server/index.js`, unchanged): `process.env.RESEND_API_KEY`, `process.env.MAIL_FROM`.
- Produces:
  - `MAIL_FROM: string` — the sender address, same default as today.
  - `esc(s: string): string` — HTML-escapes `&"<>`.
  - `prettyTime(t: string): string` — `"18:30"` → `"6:30 PM"`.
  - `calDate(iso: string): string` — `"2026-06-20"` → `"Sat, Jun 20"`.
  - `async sendPasswordResetEmail(user: {name, email}, resetLink: string): Promise<void>` — no-ops (with a `console.warn`) if `RESEND_API_KEY` is unset; otherwise awaits the Resend send.
  - `sendJoinConfirmationEmail({ user, game, appUrl, calLink }): void` — fire-and-forget (matches today's behavior exactly: not awaited by the caller); no-ops (with a `console.warn`) if `RESEND_API_KEY` is unset.

- [ ] **Step 1: Write the failing test**

Create `tests/email.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { esc, prettyTime, calDate, sendPasswordResetEmail } from "../server/email.js";

describe("esc", () => {
  it("escapes HTML-significant characters", () => {
    expect(esc(`<b>"Tom" & Jerry</b>`)).toBe("&lt;b&gt;&quot;Tom&quot; &amp; Jerry&lt;/b&gt;");
  });
});

describe("prettyTime", () => {
  it("formats a 24h time as 12h with AM/PM", () => {
    expect(prettyTime("18:30")).toBe("6:30 PM");
    expect(prettyTime("00:05")).toBe("12:05 AM");
    expect(prettyTime("12:00")).toBe("12:00 PM");
  });
});

describe("calDate", () => {
  it("formats an ISO date as weekday + month + day", () => {
    expect(calDate("2026-06-20")).toBe("Sat, Jun 20");
  });
});

describe("sendPasswordResetEmail", () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

  it("sends via Resend when RESEND_API_KEY is set", async () => {
    await sendPasswordResetEmail({ name: "Maria", email: "maria@example.com" }, "https://x/reset");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(opts.body);
    expect(body.to).toEqual(["maria@example.com"]);
    expect(body.html).toContain("Maria");
  });

  it("no-ops when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    await sendPasswordResetEmail({ name: "Maria", email: "maria@example.com" }, "https://x/reset");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/email.test.js`
Expected: FAIL — `Cannot find module '../server/email.js'`

- [ ] **Step 3: Create the module**

Create `server/email.js`:

```js
// HTML email templates + Resend sends, plus the small formatting helpers they
// (and a couple of non-email routes) share. One-directional dependency: this
// module never imports from index.js.
import * as Sentry from "@sentry/node";

// Sender address for transactional email. Defaults to Resend's shared sandbox
// domain (works for testing but is spam-prone and rate-limited). Once you've
// verified your own domain in Resend, set MAIL_FROM, e.g.
//   MAIL_FROM="Coterie <hello@coterie.com.de>"
export const MAIL_FROM = process.env.MAIL_FROM || "Coterie <onboarding@resend.dev>";

export function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function prettyTime(t) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function calDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${days[date.getUTCDay()]}, ${months[m - 1]} ${d}`;
}

/** Send the password-reset email. No-ops (logged) if RESEND_API_KEY is unset. */
export async function sendPasswordResetEmail(user, resetLink) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("[auth] RESEND_API_KEY not set — skipping reset email");
    return;
  }
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [user.email],
      subject: "Reset your Coterie password",
      html: `<p>Hi ${esc(user.name)},</p>
             <p>You requested a password reset.</p>
             <p><a href="${resetLink}" style="background:#E8734A;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-family:sans-serif;">Reset password</a></p>
             <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
             <p>— The Coterie team</p>`,
    }),
  });
}

/**
 * Fire-and-forget: send the "you're in" confirmation email for a joined game.
 * Not awaited by the caller — matches the route's existing behavior exactly.
 * calLink is precomputed by the caller (buildGCalUrl stays in index.js until
 * the games domain moves in Phase 2) and passed straight through.
 */
export function sendJoinConfirmationEmail({ user, game, appUrl, calLink }) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping join confirmation email");
    return;
  }
  const timeDisplay = game.endTime
    ? `${prettyTime(game.time)} – ${prettyTime(game.endTime)}`
    : prettyTime(game.time);
  const brand = "#E8734A";
  const row = (label, value) =>
    `<tr><td style="padding:6px 0;font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:#9ca3af;">${label}</td>` +
    `<td style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${value}</td></tr>`;
  const emailHtml = [
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>`,
    `<body style="margin:0;padding:24px 16px;background:#f5ede3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">`,
    `<div style="max-width:460px;margin:0 auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">`,
    `<div style="text-align:center;padding:28px 32px 0;">`,
    `<div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:${brand};border-radius:50%;font-size:26px;color:#fff;">&#10003;</div>`,
    `</div>`,
    `<div style="text-align:center;padding:12px 32px 0;">`,
    `<h1 style="margin:0;font-size:32px;font-weight:800;color:#111827;">You're In!</h1>`,
    `<p style="margin:8px 0 0;font-size:14px;color:#6b7280;">Hi ${esc(user.name)}, your spot for <strong style="color:#374151;">${esc(game.title)}</strong> is confirmed.</p>`,
    `</div>`,
    `<div style="margin:20px 32px 0;height:1px;background:#f3f4f6;"></div>`,
    `<div style="padding:16px 32px 0;"><table style="width:100%;border-collapse:collapse;">`,
    row("Date", calDate(game.date)),
    row("Time", timeDisplay),
    row("Location", esc(game.location)),
    game.costPerPerson > 0 ? row("Cost", `$${game.costPerPerson} per person`) : "",
    `</table></div>`,
    game.notes ? `<div style="margin:12px 32px 0;background:#f9fafb;border-radius:12px;padding:12px 16px;font-size:13px;color:#4b5563;line-height:1.6;">${esc(game.notes)}</div>` : "",
    `<div style="padding:20px 32px 8px;">`,
    `<a href="${calLink}" style="display:block;background:${brand};color:#fff;text-decoration:none;text-align:center;padding:15px;border-radius:12px;font-size:15px;font-weight:700;">Add to Google Calendar</a>`,
    `</div>`,
    `<div style="padding:0 32px 24px;">`,
    `<a href="${appUrl}/game/${game.id}" style="display:block;border:1.5px solid #e5e7eb;color:#374151;text-decoration:none;text-align:center;padding:13px;border-radius:12px;font-size:14px;font-weight:500;">View Game Details</a>`,
    `</div>`,
    `<p style="text-align:center;padding:0 0 20px;margin:0;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#d1d5db;">COTERIE</p>`,
    `</div></body></html>`,
  ].join("");
  console.log(`[email] sending join confirmation to ${user.email} for "${game.title}"`);
  fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [user.email],
      subject: `You're in: ${game.title}`,
      html: emailHtml,
    }),
  }).then((r) => {
    if (r.ok) {
      console.log(`[email] delivered OK to ${user.email}`);
    } else {
      r.text().then((t) => {
        console.error(`[email] Resend error ${r.status}:`, t);
        Sentry.captureMessage(`Resend join-email failed (${r.status}): ${t}`, "error");
      });
    }
  }).catch((e) => {
    console.error("[email] network error:", e);
    Sentry.captureException(e);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/email.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Wire the import into `server/index.js`**

Add to the import block near the top of `server/index.js` (alongside the existing `./validation.js` import):

```js
import { MAIL_FROM, esc, prettyTime, calDate, sendPasswordResetEmail, sendJoinConfirmationEmail } from "./email.js";
```

- [ ] **Step 6: Delete the old helper definitions from `server/index.js`**

Delete this line (in the constants block near the top):

```js
const MAIL_FROM = process.env.MAIL_FROM || "Coterie <onboarding@resend.dev>";
```

Delete these three function definitions (near the bottom of the file, right after the final error-handling middleware):

```js
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function prettyTime(t) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

function calDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${days[date.getUTCDay()]}, ${months[m - 1]} ${d}`;
}
```

- [ ] **Step 7: Replace the forgot-password route's inline send with the new function**

In the `POST /api/auth/forgot-password` handler, replace:

```js
    const token = await repo.createPasswordResetToken(user.id);
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const resetLink = `${appUrl}/auth?reset=${token}`;
    const resendKey = process.env.RESEND_API_KEY;

    if (!resendKey) {
      console.warn("[auth] RESEND_API_KEY not set — skipping reset email");
      return res.json({ ok: true });
    }

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [user.email],
        subject: "Reset your Coterie password",
        html: `<p>Hi ${esc(user.name)},</p>
               <p>You requested a password reset.</p>
               <p><a href="${resetLink}" style="background:#E8734A;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-family:sans-serif;">Reset password</a></p>
               <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
               <p>— The Coterie team</p>`,
      }),
    });

    res.json({ ok: true });
```

with:

```js
    const token = await repo.createPasswordResetToken(user.id);
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const resetLink = `${appUrl}/auth?reset=${token}`;

    await sendPasswordResetEmail(user, resetLink);

    res.json({ ok: true });
```

Note: this preserves behavior exactly — `sendPasswordResetEmail` internally checks `RESEND_API_KEY` and no-ops (with the same `console.warn`) when unset, so the route always responds `{ ok: true }` either way, same as before.

- [ ] **Step 8: Replace the join route's inline send with the new function**

In the `POST /api/games/:id/join` handler, replace:

```js
    // Fire-and-forget: send confirmation email when user gets a confirmed spot.
    const user = await repo.findUserById(req.userId);
    const isPlayer = game.players.some((p) => p.id === req.userId);
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.warn("[email] RESEND_API_KEY not set — skipping join confirmation email");
    } else if (user && isPlayer && !user.email.endsWith("@demo.test")) {
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const calLink = buildGCalUrl(game, appUrl);
      const timeDisplay = game.endTime
        ? `${prettyTime(game.time)} – ${prettyTime(game.endTime)}`
        : prettyTime(game.time);
      const brand = "#E8734A";
      const row = (label, value) =>
        `<tr><td style="padding:6px 0;font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:#9ca3af;">${label}</td>` +
        `<td style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${value}</td></tr>`;
      const emailHtml = [
        `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>`,
        `<body style="margin:0;padding:24px 16px;background:#f5ede3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">`,
        `<div style="max-width:460px;margin:0 auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">`,
        `<div style="text-align:center;padding:28px 32px 0;">`,
        `<div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:${brand};border-radius:50%;font-size:26px;color:#fff;">&#10003;</div>`,
        `</div>`,
        `<div style="text-align:center;padding:12px 32px 0;">`,
        `<h1 style="margin:0;font-size:32px;font-weight:800;color:#111827;">You're In!</h1>`,
        `<p style="margin:8px 0 0;font-size:14px;color:#6b7280;">Hi ${esc(user.name)}, your spot for <strong style="color:#374151;">${esc(game.title)}</strong> is confirmed.</p>`,
        `</div>`,
        `<div style="margin:20px 32px 0;height:1px;background:#f3f4f6;"></div>`,
        `<div style="padding:16px 32px 0;"><table style="width:100%;border-collapse:collapse;">`,
        row("Date", calDate(game.date)),
        row("Time", timeDisplay),
        row("Location", esc(game.location)),
        game.costPerPerson > 0 ? row("Cost", `$${game.costPerPerson} per person`) : "",
        `</table></div>`,
        game.notes ? `<div style="margin:12px 32px 0;background:#f9fafb;border-radius:12px;padding:12px 16px;font-size:13px;color:#4b5563;line-height:1.6;">${esc(game.notes)}</div>` : "",
        `<div style="padding:20px 32px 8px;">`,
        `<a href="${calLink}" style="display:block;background:${brand};color:#fff;text-decoration:none;text-align:center;padding:15px;border-radius:12px;font-size:15px;font-weight:700;">Add to Google Calendar</a>`,
        `</div>`,
        `<div style="padding:0 32px 24px;">`,
        `<a href="${appUrl}/game/${game.id}" style="display:block;border:1.5px solid #e5e7eb;color:#374151;text-decoration:none;text-align:center;padding:13px;border-radius:12px;font-size:14px;font-weight:500;">View Game Details</a>`,
        `</div>`,
        `<p style="text-align:center;padding:0 0 20px;margin:0;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#d1d5db;">COTERIE</p>`,
        `</div></body></html>`,
      ].join("");
      console.log(`[email] sending join confirmation to ${user.email} for "${game.title}"`);
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: MAIL_FROM,
          to: [user.email],
          subject: `You're in: ${game.title}`,
          html: emailHtml,
        }),
      }).then((r) => {
        if (r.ok) {
          console.log(`[email] delivered OK to ${user.email}`);
        } else {
          r.text().then((t) => {
            console.error(`[email] Resend error ${r.status}:`, t);
            Sentry.captureMessage(`Resend join-email failed (${r.status}): ${t}`, "error");
          });
        }
      }).catch((e) => {
        console.error("[email] network error:", e);
        Sentry.captureException(e);
      });
    }

    res.json(game);
```

with:

```js
    // Fire-and-forget: send confirmation email when user gets a confirmed spot.
    const user = await repo.findUserById(req.userId);
    const isPlayer = game.players.some((p) => p.id === req.userId);
    if (user && isPlayer && !user.email.endsWith("@demo.test")) {
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const calLink = buildGCalUrl(game, appUrl);
      sendJoinConfirmationEmail({ user, game, appUrl, calLink });
    }

    res.json(game);
```

**Known, harmless behavior note:** previously, if `RESEND_API_KEY` was unset, a `console.warn` fired on every join attempt regardless of whether the joiner was a real confirmed non-demo player. After this change, that warn only fires when we'd actually attempt to send (i.e. `user && isPlayer && !demo`). This is a log-cadence-only difference during local dev without a Resend key configured — no response, URL, or user-facing behavior changes, and no test asserts on it (confirmed: `grep -r "skipping join" tests/` finds nothing).

- [ ] **Step 9: Update the two remaining `MAIL_FROM` usage sites**

The `/api/debug/email-test` route (admin-only) also references `MAIL_FROM` directly — it already resolves correctly via the Step 5 import, so no change needed there. Confirm by searching:

Run: `grep -n "MAIL_FROM" server/index.js`
Expected: only the import line (Step 5) and the one usage inside `/api/debug/email-test` — no local definition remains.

- [ ] **Step 10: Type-check and run the full test suite**

Run: `npx tsc --noEmit`
Expected: no output (clean)

Run: `npx vitest run`
Expected: `Test Files  6 passed | 1 skipped`, `Tests  59 passed | 1 skipped` (54 from Task 1 + the 5 new email tests)

- [ ] **Step 11: Commit**

```bash
git add server/email.js server/index.js tests/email.test.js
git commit -m "Architecture: extract email templates + formatters into email.js"
```

- [ ] **Step 12: Deploy and verify**

```bash
git checkout main
git merge --ff-only harden/backend-security
git push origin main
git checkout harden/backend-security
```

Then fetch `https://coterie.com.de/healthz` and confirm it returns `{"status":"ok"}`.

---

### Task 3: Move `requireAdmin` into `server/auth.js`

**Files:**
- Modify: `server/auth.js` (add `requireAdmin`)
- Modify: `server/index.js` (import `requireAdmin` from `./auth.js`; delete the local definition)
- Test: `tests/auth.test.js` (add coverage)

**Interfaces:**
- Consumes: `repo.getRole(userId): Promise<string|null>` (existing, unchanged, from `server/repo.js`).
- Produces: `requireAdmin(req, res, next)` — Express middleware, identical behavior to today (403 if not admin, 500 on internal error), now living in `auth.js` alongside `requireAuth`/`optionalAuth` since it's an auth/authorization concern.

- [ ] **Step 1: Write the failing test**

`tests/auth.test.js` currently has this structure (from the earlier security-hardening work):

```js
vi.mock("../server/db.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    query: async () => ({ rows: [{ suspended: false, token_version: 0 }] }),
  };
});

const {
  hashPassword,
  verifyPassword,
  signToken,
  requireAuth,
  optionalAuth,
  TIMING_HASH,
} = await import("../server/auth.js");
```

Add a second `vi.mock` for `repo.js` right after the existing `db.js` mock (both must be declared before the `await import(...)` below them), and add `requireAdmin` to the existing destructured import:

```js
vi.mock("../server/repo.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRole: vi.fn(async (userId) => (userId === "user_admin" ? "admin" : "user")),
  };
});

const {
  hashPassword,
  verifyPassword,
  signToken,
  requireAuth,
  requireAdmin,
  optionalAuth,
  TIMING_HASH,
} = await import("../server/auth.js");
```

Then add a new describe block anywhere after the existing ones:

```js
describe("requireAdmin middleware", () => {
  it("403s a non-admin user", async () => {
    const req = { userId: "user_regular" };
    const res = mockRes();
    let nexted = false;
    await requireAdmin(req, res, () => {
      nexted = true;
    });
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it("calls next() for an admin user", async () => {
    const req = { userId: "user_admin" };
    const res = mockRes();
    let nexted = false;
    await requireAdmin(req, res, () => {
      nexted = true;
    });
    expect(nexted).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth.test.js`
Expected: FAIL — `requireAdmin` is not exported from `../server/auth.js`

- [ ] **Step 3: Add `requireAdmin` to `server/auth.js`**

Add this import to the top of `server/auth.js` (alongside the existing `./db.js` import):

```js
import * as repo from "./repo.js";
```

Add this function at the end of `server/auth.js` (after `optionalAuth`):

```js
/**
 * Express middleware: requires the caller (already authenticated by
 * requireAuth) to have the "admin" role. Enforced server-side — not just
 * hidden in the UI — since every /api/admin/* route sits behind this.
 */
export async function requireAdmin(req, res, next) {
  try {
    const role = await repo.getRole(req.userId);
    if (role !== "admin")
      return res.status(403).json({ error: "Admin access required." });
    next();
  } catch (err) {
    console.error("[api] admin check error:", err);
    res.status(500).json({ error: "Something went wrong on the server." });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth.test.js`
Expected: PASS (13 tests — 11 existing + 2 new)

- [ ] **Step 5: Wire the import into `server/index.js`**

Change the `./auth.js` import line in `server/index.js` from:

```js
import { hashPassword, verifyPassword, signToken, requireAuth, verifyToken, TIMING_HASH } from "./auth.js";
```

to:

```js
import { hashPassword, verifyPassword, signToken, requireAuth, requireAdmin, verifyToken, TIMING_HASH } from "./auth.js";
```

- [ ] **Step 6: Delete the local `requireAdmin` definition from `server/index.js`**

Delete (in the "Admin" section):

```js
async function requireAdmin(req, res, next) {
  try {
    const role = await repo.getRole(req.userId);
    if (role !== "admin")
      return res.status(403).json({ error: "Admin access required." });
    next();
  } catch (err) {
    console.error("[api] admin check error:", err);
    res.status(500).json({ error: "Something went wrong on the server." });
  }
}
```

Leave the `// --- Admin (role-enforced on the server, not just the UI) ---` comment above it and every `requireAdmin` usage in route middleware chains untouched — they now resolve from the import.

- [ ] **Step 7: Type-check and run the full test suite**

Run: `npx tsc --noEmit`
Expected: no output (clean)

Run: `npx vitest run`
Expected: `Test Files  6 passed | 1 skipped`, `Tests  61 passed | 1 skipped` (59 from Task 2 + 2 new requireAdmin tests)

- [ ] **Step 8: Commit**

```bash
git add server/auth.js server/index.js tests/auth.test.js
git commit -m "Architecture: move requireAdmin into auth.js"
```

- [ ] **Step 9: Deploy and verify**

```bash
git checkout main
git merge --ff-only harden/backend-security
git push origin main
git checkout harden/backend-security
```

Then fetch `https://coterie.com.de/healthz` and confirm it returns `{"status":"ok"}`.

---

### Task 4: Confirm `index.js` line-count reduction and full regression pass

**Files:**
- None modified — verification only.

- [ ] **Step 1: Confirm the extracted code is gone from `index.js`**

Run: `grep -c "rateLimit(" server/index.js`
Expected: `0` (no more inline `rateLimit({...})` calls — all six now live in `middleware/rateLimiters.js`)

Run: `grep -cE "^function (esc|prettyTime|calDate)\(|^async function requireAdmin\(" server/index.js`
Expected: `0`

- [ ] **Step 2: Confirm the file shrank**

Run: `wc -l server/index.js`
Expected: fewer lines than the pre-Phase-0 baseline of 1746 (exact number depends on comment/whitespace deltas — the check is "meaningfully smaller," not an exact figure)

- [ ] **Step 3: Full production build + test suite**

Run: `npm run build`
Expected: completes with no errors, `dist/` regenerated

Run: `npx vitest run`
Expected: `Test Files  6 passed | 1 skipped`, `Tests  61 passed | 1 skipped`

- [ ] **Step 4: Final live verification**

Fetch `https://coterie.com.de/healthz` — confirm `{"status":"ok"}`.

Manually exercise (via the live app or `curl`) one endpoint from each touched area to confirm no regression:
- `POST /api/auth/forgot-password` with a real registered email — confirm `{"ok":true}` response (email delivery itself is best-effort; the response contract is what matters here).
- Any `GET /api/admin/*` endpoint as a non-admin token — confirm `403 {"error":"Admin access required."}`.
- Hit `/api/config` a few times — confirm `RateLimit-*` response headers are present (proves `apiLimiter` is still mounted correctly).

- [ ] **Step 5: Update the design spec status**

In `docs/superpowers/specs/2026-07-01-backend-architecture-split-design.md`, change the header line:

```
Status: approved, pending implementation plan
```

to:

```
Status: Phase 0 complete. Phases 1-6 remain — see docs/superpowers/plans/ for phase-specific plans as they're written.
```

Commit:

```bash
git add docs/superpowers/specs/2026-07-01-backend-architecture-split-design.md
git commit -m "docs: mark backend architecture split Phase 0 complete"
git checkout main
git merge --ff-only harden/backend-security
git push origin main
git checkout harden/backend-security
```
