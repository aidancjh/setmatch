# Developer setup & cross-device workflow

This project is developed across two machines (a Windows PC and a laptop). **Sync the
code with Git, not OneDrive.** OneDrive is fine for documents, but it is the wrong
tool for an active source repo with a `node_modules` folder and a live `.git`
directory — OneDrive's background sync races Git's index writes and produces
`unable to map index file` corruption plus "cloud file provider is not running"
read failures. Git already syncs this project (Railway auto-deploys from `main`),
so use it.

## Recommended: Git-based cross-device workflow

1. **Clone outside OneDrive on each device.** Pick a path that OneDrive does *not*
   sync, e.g.:

   ```bash
   git clone <repo-url> C:/dev/Volleyball-Claude
   cd C:/dev/Volleyball-Claude
   npm install
   ```

2. **Per session:**
   - `git pull` when you sit down.
   - work, commit.
   - `git push` before you switch devices.

3. `node_modules` is installed per-device with `npm install` and is **never synced**
   (it's in `.gitignore`). The same goes for `dist/` and `.env`.

4. Once both devices are cloned and verified (`npm run dev` works), delete the old
   OneDrive copy of the repo so there's a single source of truth.

5. Keep secrets out of Git. `.env` is ignored; copy `.env.example` to `.env` on each
   device and fill in the values (see **Environment** below).

## Fallback (only if the code must stay inside OneDrive)

This is strictly worse and still risks `.git` corruption — prefer the Git workflow.

- Right-click the project folder → **Always keep on this device** (stops the
  cloud-placeholder read failures).
- Move `node_modules` out of the synced tree to cut sync thrash.
- Never leave a Git operation running while OneDrive is mid-sync.

## Environment

Copy `.env.example` → `.env` and set at least:

- `DATABASE_URL` — Postgres connection string (Railway provides this in prod).
- `ADMIN_EMAILS` — comma-separated emails granted admin on startup. **Admin is no
  longer hardcoded in source**; add your own account's email here (and in the
  Railway service variables for production) or you will have no admin.
- Optional: `RESEND_API_KEY`, `SENTRY_DSN`, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

## Ports

- API: **4000** (`npm run dev:api`)
- Vite dev server: **5173** (`npm run dev:web`), proxies `/api` → 4000.
