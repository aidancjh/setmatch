# Coterie — Operations Runbook

Practical guide for running Coterie in production (Railway + PostgreSQL).

---

## Environment variables (set in Railway → app service → Variables)

| Var | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | ✅ |
| `DATABASE_SSL` | `true` for cloud DB (public URL), `false` for internal | ✅ |
| `JWT_SECRET` | signs login tokens — long random string | ✅ |
| `PORT` | set automatically by Railway | auto |
| `ADMIN_EMAILS` | comma-separated emails auto-granted admin on boot | optional |

---

## Granting yourself admin

**Option A — env var (preferred):** add `ADMIN_EMAILS=you@email.com` to the app
service variables and redeploy. On startup the server promotes those accounts to
`admin`. (You must already have signed up with that email.)

**Option B — direct SQL:** Railway → Postgres service → **Data** tab → run:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@email.com';
```

Then sign out and back in. The 🛠 **Admin dashboard** button appears on your
Profile, and `/admin` becomes accessible. Roles: `user`, `staff`, `admin`
(admin is enforced on the server, not just hidden in the UI).

---

## Database migrations

Schema changes are **idempotent** and run automatically on every server start
(`server/db.js → initSchema`): tables use `CREATE TABLE IF NOT EXISTS`, and
column additions use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. To add a
migration, append another idempotent statement there — it is safe to re-run.

There is no destructive migration tooling by design; never write a migration
that drops/renames a column without a backup first (see below).

---

## Backups

Railway Postgres includes automated backups on paid plans — check
**Postgres service → Backups** tab and confirm a schedule is enabled.

**Manual backup any time** (from your PC, using the *public* connection string
found in Postgres → Variables → `DATABASE_PUBLIC_URL`):

```bash
pg_dump "postgresql://USER:PASS@HOST:PORT/DB" > coterie-backup-YYYYMMDD.sql
```

Run this before any risky change. Store the file somewhere safe (not the repo).

## Restore

1. Create/choose a target database (a fresh Railway Postgres, or a local one).
2. Restore the dump:

   ```bash
   psql "postgresql://USER:PASS@HOST:PORT/DB" < coterie-backup-YYYYMMDD.sql
   ```

3. Point the app's `DATABASE_URL` at the restored database and redeploy.
4. Verify: open `/healthz` (should return `{"status":"ok"}`) and check the app.

---

## Monitoring & alerting

- **Uptime + health:** the app exposes **`/healthz`** (checks DB connectivity).
  Point a free monitor (e.g. UptimeRobot, Better Stack) at
  `https://<your-domain>/healthz` every 1–5 min; alert if it's not `200`.
- **Server errors:** all API errors are logged with `[api]` prefixes (viewable
  in Railway → app service → Deploy Logs). Requests are logged with method,
  path, status, and duration.
- **Crash/error tracking (recommended next):** add **Sentry**.
  - Backend: `npm i @sentry/node`, init at the top of `server/index.js` with
    `Sentry.init({ dsn: process.env.SENTRY_DSN })`, set `SENTRY_DSN` in Railway.
  - Frontend: `npm i @sentry/react`, init in `src/main.tsx` with a public DSN.
  - This requires a free Sentry account + DSN (not wired yet — placeholders only).
- **Performance:** Railway shows CPU/memory/HTTP metrics per service under the
  **Metrics** tab.

---

## Email (password reset & verification) — not yet enabled

These need an email provider **and a verified sending domain** to deliver to
arbitrary addresses. When ready:

1. Buy a domain and create a free **Resend** account; verify the domain.
2. `npm i resend`, set `RESEND_API_KEY` in Railway.
3. Add endpoints: request-reset (emails a signed, expiring token link),
   reset-confirm (validates token, sets new password), and verify-email on
   signup. The JWT/token plumbing mirrors the existing auth in `server/auth.js`.

Until then, the in-app account flow works without email; account recovery is
manual (admin can look up a user; a password reset needs the email step above).

---

## Routine checks

- After each deploy: open `/healthz`, then load the app and post/join a test game.
- Watch Deploy Logs for repeated `[api] ... 500` lines.
- Periodically confirm backups exist and a restore actually works (test it once).
