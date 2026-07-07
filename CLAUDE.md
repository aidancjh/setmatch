# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start both API (port 4000) and Vite dev server (port 5173) concurrently
npm run dev:api      # API only — node --watch with .env
npm run dev:web      # Vite only
npm run build        # TypeScript check + Vite production build
npm run start        # Production server (Railway uses this)
npx tsc --noEmit     # Type-check without building
```

Local dev requires a `DATABASE_URL` in `.env`. The Railway-hosted Postgres is production-only; there is no local DB instance. You can still run `npm run dev:web` to test the frontend UI without the API.

## Architecture

**Full-stack monorepo**: React 18 + TypeScript + Vite 6 (frontend) served by Express 4 + PostgreSQL (backend). In production, Express serves the Vite build as static files and handles `/api/*` routes.

### Backend (`server/`)

| File | Purpose |
|------|---------|
| `index.js` | Express app — all API routes, auth middleware, email via Resend |
| `db.js` | `pg.Pool` connection, `initSchema()` (idempotent, runs on startup), `uid(prefix)` for IDs |
| `repo.js` | All SQL queries — single data-access layer |
| `auth.js` | `hashPassword`, `verifyPassword`, `signToken`, `requireAuth` middleware (JWT in `Authorization: Bearer`) |
| `seed.js` | `seedIfEmpty()` (once, empty DB), `syncDemoPasswords()` (every startup), `seedPastData()` (idempotent; runs on every startup **and** via the admin endpoint) |
| `admin-server.js` | Standalone admin API — separate Railway deploy, separate JWT (`ADMIN_JWT_SECRET`), own Google OAuth callback (lookup-only, never creates users), own rate limiter and DB pool cap. Mounts `adminRoutes.js`. |

Schema tables: `users`, `games`, `game_members`, `game_interest`, `game_comments`, `messages`, `game_reviews`, `player_ratings`, `notifications`, `feedback`, `highlights`, `highlight_likes`, `highlight_comments`, `password_reset_tokens`, `idempotency_keys`, `waitlist`.

**Two separate rating systems:**
- `game_reviews` — reviewer rates the HOST after a game they played in (not hosted). `UNIQUE(game_id, reviewer_id)`. Exposed as host star rating on profiles.
- `player_ratings` — player rates individual teammates. `UNIQUE(game_id, rater_id, rated_id)`. Anonymous, averaged as `playerRating` on profiles.

`pendingReviews(userId)` returns games the user played (not hosted), ended >2 h ago, <7 days ago, not yet reviewed. The `ReviewPrompt` component polls this 3 s after mount and shows a modal.

### Admin app (`server/admin-server.js` + `src/admin/`)

The admin dashboard is a **separate deployment** from the consumer app — different Railway
service, different subdomain, different JWT secret/audience (`ADMIN_JWT_SECRET`, not
`JWT_SECRET`). It shares the same Postgres database via `server/db.js`, but with its own
capped connection pool (`DB_POOL_MAX`) so admin traffic can never starve the consumer app.

- `server/admin-server.js` — Express entry, mounts `server/adminRoutes.js` behind
  `server/adminAuth.js`'s `requireAdminAuth`. Serves `dist-admin/` in production.
- `src/admin/` — separate React app (`src/admin-main.tsx` entry, built via
  `vite.admin.config.ts` into `dist-admin/`). Sign-in is a single shared password
  (`POST /api/auth/login`, bcrypt-hashed via `ADMIN_PASSWORD_HASH`, rate-limited via
  `adminLoginLimiter`) that logs into the existing admin user identified by
  `ADMIN_LOGIN_EMAIL` — that account must already exist with `role = 'admin'`.
- Local dev: `npm run dev:admin` (API, port 4100) + `npm run dev:admin:web` (Vite, port
  5174) — copy `.env.admin.example` to `.env.admin` first.
- `npm run build` produces both `dist/` (consumer) and `dist-admin/` (admin) from one command.

### Frontend (`src/`)

| Layer | Details |
|-------|---------|
| `lib/api.ts` | `api.get/post/patch/del` wrappers — reads JWT from `localStorage`, base URL from `VITE_API_URL` env var |
| `services/gamesService.ts` | All game mutations + reads; calls `notify()` after mutations so subscribers re-fetch |
| `auth/AuthContext.tsx` | React context for current user; `useAuth()` hook |
| `hooks/useProfile.ts` | Returns profile of logged-in user from context |
| `lib/format.ts` | `formatDate`, `formatTime`, `formatTimeRange`, `isPast`, `relativeDay` |

Pages: `BrowseGames`, `GameDetail`, `CreateGame`, `EditGame`, `MyGames`, `UserProfile`, `Profile`, `Settings`, `Admin`, `Auth`, `Onboarding`, `Highlights`, `Privacy`.

`GameDetail.tsx` fetches `/api/games/:id/ratables` when the game is in the past and the user was a player — renders inline star pickers to rate teammates using `api.post` directly (not via gamesService).

## Demo credentials

| Email | Password | Name | Role |
|-------|----------|------|------|
| 1@demo.test | 111111 | Maria L. | Intermediate |
| 2@demo.test | 111111 | Theo R. | Advanced |
| 3@demo.test | 111111 | Grace P. | Beginner |
| 4@demo.test | 111111 | Dre M. | Advanced |
| 5@demo.test | 111111 | Nina K. | All Levels |

`syncDemoPasswords()` resets all `@demo.test` passwords to `111111` on every server startup.

To seed past games + fake reviews/ratings into an already-populated DB: log in as an admin and call `POST /api/admin/seed-past-data`.

## Deployment

Railway auto-deploys on every push to `main` on GitHub. No manual steps needed — just `git push`. Deploy takes ~2 min. Production URL: `https://coterie.com.de`.

On startup the server calls, in order: `initSchema()` → `seedIfEmpty()` → `syncDemoPasswords()` → `seedPastData()` → `promoteAdminsFromEnv()` (see `start()` in `server/index.js`).

## Key conventions

- **IDs**: `uid(prefix)` generates `prefix_<random>`. Demo/seed records use static IDs (e.g. `game_past_1`, `user_maria`) for idempotency.
- **Auth**: JWT stored in `localStorage` as `vb.token` (see `TOKEN_KEY` in `src/lib/api.ts`). `requireAuth` middleware sets `req.userId`. `requireAdmin` checks `users.role = 'admin'`.
- **Roles**: `user` (default) | `staff` | `admin`. Only admins can access `/api/admin/*`.
- **Game time logic**: `date` is ISO date string (`2026-06-20`), `time`/`endTime` are 24h strings (`"18:30"`). `isPast(date)` checks if date < today.
- **Tailwind**: Using Tailwind CSS 4.0 (Vite plugin, not PostCSS). Brand color is `text-brand` / `bg-brand` (coral `#FF6B6B` defined as CSS variable `--color-brand`).
