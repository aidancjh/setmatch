# Vybe — find your players, fill your games

Vybe is a pickup-volleyball app: post a game, set how many slots you need, and
let players find and claim the open spots. Browse games, join with one tap, chat
per game, get in-app notifications, follow player profiles, and add games to your
calendar.

**Live:** https://coterie.com.de

> **Start here:** [PROJECT_STATE.md](PROJECT_STATE.md) — current status, decisions,
> open tasks, and what's already done.

## Stack
React + TypeScript + Vite + Tailwind (frontend, installable PWA) · Express +
PostgreSQL (backend) · JWT auth with roles · deployed on Railway. Brand: blue
`#0b6ecd` (`--color-brand` in `src/index.css`), Inter typeface.

## Run locally
Requires Node 20+ and a `DATABASE_URL`. **There is no local database** — the only
one is the production Postgres on Railway, so running the API locally writes to
live user data. Use `npm run dev:web` to work on the frontend alone until a
staging database exists (see [PROJECT_STATE.md](PROJECT_STATE.md) §4).
```bash
cp .env.example .env       # set DATABASE_URL
npm install
npm run dev                # API :4000 + web :5173
npm run dev:web            # frontend only — safe, no DB writes
```
(On this machine Node is at `C:\Program Files\nodejs`; if `npm` isn't found run
`$env:Path = "$env:ProgramFiles\nodejs;$env:Path"`, or double-click `Start Vybe.bat`.)

Demo accounts: `1@demo.test` … `5@demo.test`, password `111111`.

## Features
- Browse / search / filter games; post one-time **or recurring (weekly ×4/×8)** games
- Join, leave, **waitlist** with auto-promotion
- Per-game **chat**, **interested** marker, **share** with rich link previews
- **In-app notifications** (join/leave/waitlist/edit/cancel/comment)
- **Player profiles** with hosted/joined stats; **add to calendar** (.ics + reminder)
- **Edit/delete** games (host); **admin dashboard** (role-gated)
- Installable PWA, always-latest-when-online

## Docs
| File | What |
|---|---|
| [PROJECT_STATE.md](PROJECT_STATE.md) | **Current status, decisions, open tasks — read first** |
| [docs/architecture-workflow.svg](docs/architecture-workflow.svg) | Diagram of the whole system |
| [DEPLOY.md](DEPLOY.md) | First-time deploy to GitHub + Railway |
| [OPERATIONS.md](OPERATIONS.md) | Env vars, admin access, migrations, **backups/restore**, monitoring, email |
| [STORE.md](STORE.md) | App Store / Google Play distribution checklist (Capacitor) |

## Project layout
```
server/   Express API: index.js (routes/health/errors), db.js (schema+migrations),
          repo.js (all SQL), auth.js (JWT/bcrypt), seed.js (demo data),
          admin-server.js + adminRoutes.js (separate admin deploy)
src/      React app: pages/, components/, services/ (api calls), auth/ (context+guard),
          lib/api.ts (fetch w/ timeout+retry+idempotency), hooks/
```

## Updating
`git push` → Railway auto-deploys in ~2 min. The PWA picks up changes on next open.
