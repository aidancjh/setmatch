# Backend architecture split — design

Date: 2026-07-01
Status: approved, pending implementation plan

## Problem

`server/index.js` is 1,746 lines holding ~93 routes across roughly 14 unrelated
domains (auth, games, roster management, notifications, comments, chat, admin,
users/profile, reviews, feedback, highlights, waitlist, config/health, debug),
plus cross-cutting concerns (security headers, CORS, rate limiters, the
maintenance-mode gate, HTML email templates) all interleaved together.
`server/repo.js` is 1,690 lines / ~100 functions, mirroring the same domains as
a flat list.

This makes it easy to lose track of what a change touches, and harder to
confirm — at a glance — that a new route has the right auth/ownership checks
(the codebase's security posture is otherwise strong; see the 2026-06-30
security hardening work). The goal is **navigability and safety when changing
the backend**, not new capability — this is a pure restructuring, no behavior
or URL changes.

## Goals

- Split both files into per-domain modules with a 1:1 mirrored boundary (a
  "games" change only ever touches `routes/games.js` + `repo/games.js`).
- `index.js` becomes a thin composition root (target: under ~150 lines).
- Zero behavior change: same URLs, same response shapes, same error messages.
  The existing test suite (53 tests, `tests/*.test.js`) must keep passing
  unchanged throughout, since it hits `app` via supertest regardless of how
  `app` is composed internally.
- Delivered in phases, each one extracted, tested, and deployed to production
  before starting the next — mirroring how the 2026-06-30 security hardening
  was shipped (one focused commit → fast-forward `main` → push → verify
  `/healthz` live).

## Non-goals

- No service layer between routes and repo (rejected as unneeded abstraction —
  see "Approaches considered" below).
- No change to `repo.js`'s data-access patterns, transactions, or SQL.
- No new features, no UI changes, no route/URL renaming.
- No change to `auth.js`, `db.js`, or `validation.js`'s existing structure
  beyond `requireAdmin` relocating into `auth.js` (see Phase 1).

## Approaches considered

1. **Mirrored router + repo split by domain (chosen).** Both files split into
   matching per-domain pairs; cross-cutting infra (email templates, rate
   limiters) extracted into their own small modules. Most files created, but
   each is small, single-purpose, and the boundary is identical on both the
   route and data-access side.
2. **Add a service layer** (routes → services → repo). Rejected: most of
   `repo.js`'s functions already *are* the business logic (ownership checks,
   transactions) — a service layer would mostly duplicate that for no benefit
   at this app's current scale.
3. **Split only `index.js`, leave `repo.js` as one file.** Rejected as the
   final target (though it's effectively what earlier phases look like
   mid-flight): `repo.js`, while long, is already a flat list of clearly-named
   functions, so it's less confusing than `index.js`'s tangle of routing +
   business logic + email HTML + security config. Splitting only one side also
   breaks the "same boundary on both sides" property that's the main win here.

## Target structure

```
server/
  index.js               # composition root: app setup, global middleware,
                          # mount routers, listen. Target <150 lines.
  auth.js                 # unchanged, + requireAdmin relocated here (Phase 1)
  db.js                   # unchanged
  validation.js            # unchanged (already extracted in the security work)
  seed.js                  # unchanged
  email.js                 # NEW: HTML templates (join confirmation, password
                          # reset) + the Resend fetch wrapper
  middleware/
    rateLimiters.js         # NEW: the 6 limiter configs; each router imports
                          # the ones it needs (loginLimiter/signupLimiter in
                          # auth.js's router, contentLimiter in
                          # comments/chat/highlights routers). apiLimiter
                          # (global) and the maintenance-mode gate stay in
                          # index.js since they apply across every domain.
  routes/
    auth.js
    games.js               # + roster (members remove/promote/paid)
    notifications.js
    comments.js
    chat.js
    admin.js
    users.js               # profile, block/unblock, ratings
    reviews.js
    highlights.js
    feedback.js
    waitlist.js             # public marketing pre-launch waitlist (POST/GET
                          # /api/waitlist) — NOT the same thing as a game's
                          # roster waitlist (players waiting for an open spot),
                          # which lives in games.js/repo/games.js (Phase 2)
    misc.js                # /api/config, /healthz, /api/debug/email-test
  repo/
    index.js               # barrel: `export * from "./users.js"` etc., so
                          # every existing `import * as repo from "./repo.js"`
                          # call site needs only its import path updated
                          # (mechanical, not risky) — no call-site logic changes
    users.js
    games.js
    notifications.js
    comments.js
    messages.js
    admin.js
    highlights.js
    reviews.js
    feedback.js
    waitlist.js
    blocks.js
```

**No URL changes.** Every router is mounted as `app.use("/api", domainRouter)`
(or bare-root for `/healthz`) and internally declares its exact existing full
path (e.g. `/games/:id/join`) — this is pure code relocation.

## Phases

Each phase: extract files → wire router into `index.js` → delete the
now-dead inline code from `index.js`/`repo.js` → `tsc --noEmit` + full test
suite → commit → fast-forward `main` → push (Railway auto-deploys) → verify
`/healthz` live before starting the next phase.

| Phase | Domain | New files | Notes |
|-------|--------|-----------|-------|
| 0 | Shared infra | `email.js`, `middleware/rateLimiters.js` | No route changes — declutters `index.js` first. `requireAdmin` moves into `auth.js` (it's an auth concern, was defined inline in `index.js`). |
| 1 | Auth | `routes/auth.js`, `repo/users.js` | Signup/login/me/forgot/reset/Google OAuth. |
| 2 | Games + roster | `routes/games.js`, `repo/games.js` | CRUD, join/leave/interested, series, ratables/rate, `.ics` export, roster remove/promote/paid. Largest single domain. |
| 3 | Social | `routes/notifications.js`, `routes/comments.js`, `routes/chat.js` + matching `repo/*` | Notifications, game comments, chat/messages. |
| 4 | Admin | `routes/admin.js`, `repo/admin.js` | Stats, user/game/highlight/comment moderation, feedback inbox, audit log, reports, broadcast, flags, seed-past-data trigger. Large but self-contained. |
| 5 | Users + reviews + blocks | `routes/users.js`, `routes/reviews.js` + matching `repo/*` | Public profile, block/unblock, ratings, reviews. |
| 6 | Highlights + feedback + waitlist + misc | `routes/highlights.js`, `routes/feedback.js`, `routes/waitlist.js`, `routes/misc.js` | Smaller tail-end domains + `/api/config`, `/healthz`, the debug email-test route. "Waitlist" here is the public marketing pre-launch page, distinct from a game's roster waitlist (Phase 2). |

## Testing & safety net

The existing suite imports `{ app }` from `server/index.js` via supertest —
since `index.js` still exports the same composed `app`, **all 53 tests keep
passing unchanged** as a regression check on every single phase. Each phase
adds a small number of route-existence smoke assertions (hitting the relocated
route through supertest) to catch wiring mistakes — wrong prefix, forgotten
middleware, missed rate limiter — before it reaches production.

## What doesn't change

- `h()` (async route error wrapper) and the final error-handling middleware.
- `requireAuth`/`optionalAuth` (stay in `auth.js`).
- All URLs, response shapes, and error messages.
- `repo.js`'s SQL, transactions, and data-access logic — only its file
  location changes.
