# SetMatch — Volleyball Pickup Finder (Phase 2)

Find players to fill out your volleyball games. Post a game, set your slot count
(12 by default), and let people claim the open spots before game day.

> **Phase 2 = real backend + accounts.** Games now live in a SQLite database
> served by an Express API, and people sign up / log in with real accounts (JWT).
> Data is shared across anyone hitting the same server — no longer browser-only.

## Run it

```bash
npm install
npm run dev
```

This starts **both** the API (port 4000) and the web app (port 5173)
together. Open the web URL Vite prints (usually http://localhost:5173).

> On this machine, Node is installed at `C:\Program Files\nodejs` but may not be
> on PATH in a fresh shell. If `npm` isn't found, run:
> `$env:Path = "$env:ProgramFiles\nodejs;$env:Path"` first (PowerShell).

To test on your phone on the same Wi-Fi: `npm run dev:web -- --host` (and run
`npm run dev:api` in another terminal).

### Demo accounts

The database is seeded with demo games and hosts. Log in as any of them with
password **`volleyball`** — e.g. `maria@demo.test`, `dre@demo.test`. Or just
create your own account.

## What you can do

- **Browse** open games (public — no login needed), filter by type/skill/area
- **Sign up / log in** with email + password
- **Game detail** — see the roster, **Join** a game (or the waitlist if full),
  mark interest, share an invite
- **Post a game** — you take the first slot as host
- **My games** — upcoming / hosting / past
- **Profile** — edit your display name, skill, home area; sign out

## How it's built

| | |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind v4 |
| Routing | React Router |
| API | Express |
| Database | SQLite via Node's built-in `node:sqlite` (no native build) |
| Auth | JWT (`jsonwebtoken`) + password hashing (`bcryptjs`) |

```
server/                      ← the backend
  index.js                   ← Express app + routes
  db.js                      ← SQLite connection + schema
  repo.js                    ← all SQL; returns frontend-shaped objects
  auth.js                    ← password hashing + JWT + middleware
  seed.js                    ← demo users & games on first run
  data.sqlite                ← the database file (git-ignored)

src/                         ← the frontend
  lib/api.ts                 ← fetch wrapper (attaches JWT, hits /api)
  auth/AuthContext.tsx       ← current user, login/signup/logout
  auth/RequireAuth.tsx       ← gates /create, /my-games, /profile
  services/gamesService.ts   ← calls the API (same signatures as Phase 1)
  pages/                     ← Browse, GameDetail, CreateGame, MyGames, Profile, Auth
  components/                ← Layout, GameCard, Badges
  hooks/                     ← useGames, useProfile
```

### API endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` | — | Create account, returns `{token, user}` |
| POST | `/api/auth/login` | — | Log in, returns `{token, user}` |
| GET | `/api/auth/me` | ✓ | Current user |
| PATCH | `/api/auth/me` | ✓ | Update name/skill/home area |
| GET | `/api/games` | — | List all games |
| GET | `/api/games/:id` | — | One game |
| POST | `/api/games` | ✓ | Create a game (you become host) |
| POST | `/api/games/:id/join` | ✓ | Join (or waitlist if full) |
| POST | `/api/games/:id/leave` | ✓ | Leave; promotes next waitlister |
| POST | `/api/games/:id/interested` | ✓ | Toggle interest |
| DELETE | `/api/games/:id` | ✓ (host) | Delete a game |

### Reset the database

Stop the server, delete the DB file, restart — it re-seeds:

```bash
# from the project root, with the API stopped
rm server/data.sqlite*       # PowerShell: Remove-Item server\data.sqlite*
npm run dev
```

## Notes & next steps

- The JWT secret is hardcoded in `server/auth.js` for local dev. Move it to an
  env var (`JWT_SECRET`) before deploying anywhere real.
- Styling still uses inline Tailwind classes — when you share your design
  preferences, the plan is to pull colors/spacing/type into a central theme so a
  re-skin is a one-file change.
- **Later** — deploy (host the API + a managed DB), notifications, in-game chat,
  maps, recurring games, password reset.
