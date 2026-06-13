# SetMatch — Volleyball Pickup Finder

Find players to fill out your volleyball games. Post a game, set your slot count
(12 by default), and let people claim the open spots before game day.

**Stack:** React + TypeScript + Vite + Tailwind (frontend) · Express + PostgreSQL
(backend) · JWT auth. Designed to scale: stateless API + managed Postgres +
static frontend.

## Run it locally

You need **Node** and a local **PostgreSQL** database.

1. Create a database called `setmatch` in your local Postgres.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to point at it
   (the default assumes user `postgres` / password `postgres` on port 5432).
3. Install and run:

   ```powershell
   npm install
   npm run dev
   ```

   This starts the **API** (port 4000) and the **web app** (port 5173) together.
   Open <http://localhost:5173>.

> On this machine, Node is at `C:\Program Files\nodejs` and may not be on PATH in
> a fresh shell. If `npm` isn't found, run
> `$env:Path = "$env:ProgramFiles\nodejs;$env:Path"` first. Or just double-click
> **`Start SetMatch.bat`**.

### Demo accounts
The database is seeded with demo games and hosts on first run. Log in as any of
them with password **`volleyball`** (e.g. `maria@demo.test`), or create your own.

## Deploy it

See **[DEPLOY.md](DEPLOY.md)** for step-by-step instructions (GitHub + Railway).
The whole app deploys as one service (the Node server serves the API *and* the
built frontend) plus a managed Postgres database.

## How it's built

```
server/                  ← Express + PostgreSQL backend
  index.js               ← routes, startup, serves frontend in production
  db.js                  ← pg connection pool + schema (from DATABASE_URL)
  repo.js                ← all SQL; returns frontend-shaped objects
  auth.js                ← password hashing + JWT + middleware
  seed.js                ← demo users & games on first run

src/                     ← React frontend
  lib/api.ts             ← fetch wrapper (attaches JWT, calls /api)
  auth/                  ← AuthContext (login/signup), RequireAuth guard
  services/gamesService.ts ← calls the API
  components/GameForm.tsx ← shared create/edit form
  pages/                 ← Browse, GameDetail, Create/EditGame, MyGames, Profile, Auth
```

### Environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `DATABASE_SSL` | `true` for cloud databases that require TLS, else `false` |
| `JWT_SECRET` | secret for signing login tokens (long random string in prod) |
| `PORT` | API port (host sets this automatically in production) |

### API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` · `/login` | — | Returns `{token, user}` |
| GET / PATCH | `/api/auth/me` | ✓ | Current user / update profile |
| GET | `/api/games` · `/api/games/:id` | — | List / one game |
| POST | `/api/games` | ✓ | Create (you become host) |
| PATCH | `/api/games/:id` | ✓ host | Edit game |
| DELETE | `/api/games/:id` | ✓ host | Delete game |
| POST | `/api/games/:id/join` · `/leave` · `/interested` | ✓ | Roster actions |

## Roadmap

- **Done:** local prototype → real backend + accounts → edit games →
  **Postgres + deployable** (here).
- **Next phases:** notifications, maps/location search, per-game chat.
- **Scaling:** add a CDN (Vercel/Cloudflare) for the frontend, upgrade the
  Postgres plan, and run multiple API instances (the API is stateless, so this
  "just works").
