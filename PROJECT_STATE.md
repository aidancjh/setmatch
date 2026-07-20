# PROJECT_STATE.md — living state of Vybe / Coterie

> **This file is the single source of truth for _where the project is right now_.**
> `CLAUDE.md` explains how the code works (stable). This file tracks what has been
> done, what is decided, and what is left (changes constantly).
>
> **Claude: read this at the start of every session. Update it in the SAME turn as
> any change** — code added/removed/changed, a decision made or reversed, a task
> finished, scope cut. Never commit a code change without updating this file.
> Update protocol and rationale at the bottom.

**Last updated:** 2026-07-20 · **Branch:** `main` · **Head:** `dbedf8d`

---

## 1. Context — what this is and who's building it

**Vybe** (public domain: **coterie.com.de**) is a pickup-volleyball app. Hosts post a
game with a slot count; players browse and claim spots. Chat per game, in-app +
email notifications, profiles, host reviews, anonymous teammate ratings, highlights.

- **Owner:** Aidan. Solo, non-engineer, building via Claude Code. Windows PC +
  Windows laptop, switches between them. **No Mac.**
- **Stage:** feature-complete, deployed, in testing. Not yet publicly launched.
- **Goal:** publish to **both** Apple App Store and Google Play. Target window was
  ~1–3 months from 2026-06-23.
- **How Aidan tests:** on the **live** PWA on a real phone, not locally. So changes
  must be committed and pushed to deploy before they can be tested.

---

## 2. Architecture in one screen

```
Browser / PWA  ──HTTP──►  Express (Node 20)  ──SQL──►  PostgreSQL
   src/                      server/                    (Railway-hosted)
```

- **Frontend:** React 18 + TypeScript + Vite 6 + Tailwind 4, installable PWA.
- **Backend:** Node.js + Express 4 REST API. `server/index.js` (routes) →
  `server/repo.js` (all SQL) → `server/db.js` (pg Pool).
- **Database:** PostgreSQL on Railway. **Not in this repo, not on any local machine.**
  Reached only via `DATABASE_URL`. Schema is code: `initSchema()` in `server/db.js`
  runs on every boot.
- **Admin app:** separate Railway service (`server/admin-server.js` + `src/admin/`),
  separate JWT secret, own capped DB pool. Same database.
- **Host:** Railway. Auto-deploys on push to `main` (~2 min).
- **External services:** Sentry (errors), PostHog (analytics), Resend (email),
  Cloudinary (images/video), GitHub (source + Actions CI).

Full detail lives in `CLAUDE.md`. Ops/env vars in `OPERATIONS.md`. Deploy in `DEPLOY.md`.

---

## 3. Key decisions made (and why)

| Decision | Rationale | Date |
|---|---|---|
| **Keep the custom Express backend** — do NOT move to Supabase/Firebase | The client can never reach the DB, so a missed rule is one buggy route, not a world-readable table. Fails closed by default. | 2026-07-20 |
| **Do NOT add Postgres RLS** | RLS needs per-request DB roles; the app connects as one owner role for every request, and owners bypass RLS. High complexity in the hot path, defends a threat already closed structurally. | 2026-07-20 |
| **Do NOT move the database off Railway** | Not required for launch. | 2026-06-23 |
| **Ship to stores by wrapping the PWA with Capacitor** | One codebase, both stores. iOS shell = WKWebView, so the store app is ~95% identical to the installed PWA. | 2026-06-23 |
| **Buy developer accounts LAST** (Apple $99/yr, Google $25 once) | No reason to pay before the build is final. Neither is purchased yet. | 2026-06-23 |
| **Human code review over AI-only review** | Aidan is engaging software engineers / paying for a review. Claude's job is to prepare scope, not replace it. | 2026-07-20 |
| **Git — not OneDrive — is the cross-device sync mechanism** | OneDrive syncs on a delay and creates conflict copies (`.gitignore` already hides `*-aidan.*` artifacts). | 2026-07-20 |
| **Secrets live only in Railway Variables, never in the repo** | A committed `JWT_SECRET` persists in git history forever. | 2026-07-17 |

---

## 4. Open tasks — what's left

Ordered by priority. Update status inline as these move.

### Before letting strangers in

| # | Task | Why it matters | Est. | Status |
|---|---|---|---|---|
| 1 | **Staging environment** — `staging` branch + 2nd Railway service + throwaway DB | The only `DATABASE_URL` points at **production**. Testing writes to real user data; `LAUNCH_AUDIT.md` skipped its live smoke test for this reason. Biggest current risk. | ~2 h | ⬜ Not started |
| 2 | **Route authorization audit** (~55 routes in `server/index.js`) | IDOR risk: `requireAuth` proves *who you are*, not *that this is yours*. Checks exist but are inconsistently placed (some in `index.js`, some pushed into `repo.js`). Earmarked for the hired engineers. | ~2 h | ⬜ Not started |
| 3 | **Set `SEED_DEMO=false`** in Railway at launch + delete demo rows | `1@demo.test`…`5@demo.test` / `111111` are loginable in production today, and fake seed games/reviews are visible. Deliberate for now — keep live during testing. | 5 min | ⬜ Deferred to launch |
| 4 | **Verify Railway backups exist AND test a restore** | An untested backup is not a backup. Unverified. | ~1 h | ⬜ Not started |
| 5 | **`npm audit`** + clear the open Dependabot PRs | 5 Dependabot branches open on origin. | ~30 min | ⬜ Not started |
| 6 | **Remove dead `optionalAuth` from `server/auth.js:131`** | Dead export; a weaker duplicate of the live one at `index.js:223`. Nothing imports it, but a future import would silently skip suspension/revocation checks. | 10 min | ⬜ Not started |
| 7 | **Write a review-scope brief for the hired engineers** | So the paid review targets auth, ownership, and data exposure rather than generic feedback. | ~1 h | ⬜ Not started |

### At launch

| # | Task | Why | Status |
|---|---|---|---|
| 8 | Paid / always-on Railway | Kills cold starts. UptimeRobot pings `/healthz` as a stopgap today. | ⬜ |
| 9 | Lock down demo accounts (see #3) | | ⬜ |

### When wrapping for stores (Capacitor)

| # | Task | Why | Status |
|---|---|---|---|
| 10 | Add native origins to CORS — `capacitor://localhost` (iOS), Android app origin | `server/index.js:72` allows only the web origin. **Every API call from the wrapped app fails until this ships.** ~5 min change. | ⬜ |
| 11 | Android: build on Windows → Google Play internal testing | Fully doable on Windows. | ⬜ |
| 12 | iOS: rent a cloud Mac (MacinCloud ~$20–30/mo) → TestFlight | **Xcode is macOS-only; Aidan has no Mac.** Needed for this step only. | ⬜ |
| 13 | Buy Apple ($99/yr) + Google Play ($25) developer accounts | Last step. | ⬜ |
| 14 | Native push (APNs/FCM) | Optional — email + in-app notifications already work. | ⬜ Optional |

### Known issues / doc drift

| # | Issue | Status |
|---|---|---|
| 15 | `README.md` says demo password is `volleyball`; `CLAUDE.md` says `111111`. Also lists the old `*.up.railway.app` URL, not `coterie.com.de`. | ⬜ Needs fixing |
| 16 | The rotated-and-dead `JWT_SECRET` still sits in git history (commit `321ed9c`). Value is dead; history purge judged not worth the disruption. Accepted risk. | ✅ Accepted |
| 17 | Stray local branch `main-aidan` (OneDrive artifact). | ⬜ Verify + delete |

---

## 5. Completed — do not redo

**Security hardening (verified in code, 2026-07-20):**
- ✅ SQL injection closed — every query in `repo.js` is parameterized (`$1`, `$2`).
- ✅ Server **refuses to boot** on a missing/placeholder `JWT_SECRET` (`auth.js:26`),
  and fails closed unless `NODE_ENV` is explicitly `development`/`test`.
- ✅ `trust proxy` set to `1`, not `true` (`index.js:58`) — prevents IP spoofing that
  would bypass every rate limiter.
- ✅ Token revocation via `token_version` — password reset / suspension kills live
  sessions immediately (`auth.js:78`).
- ✅ Constant-time login (`TIMING_HASH`, `auth.js:11`) — blocks user enumeration.
- ✅ Helmet CSP + HSTS, shared by both apps (`server/security.js`).
- ✅ Rate limiting on login, signup, password reset, and all `/api`.
- ✅ 100 KB JSON body cap; bcrypt password hashing.
- ✅ Join race condition fixed with `SELECT … FOR UPDATE` in a transaction
  (`repo.js:851`) — covered by `tests/join-race.test.js`.
- ✅ Ownership checks confirmed present on `updateGame` (`repo.js:1009`),
  `deleteGame` (`repo.js:1091`), `cancel-series` (`index.js:681`).
- ✅ The live `optionalAuth` (`index.js:223`) uses `verifyActiveToken`, so suspended
  and revoked sessions are treated as anonymous on public reads.
- ✅ Cloudinary uploads switched from unsigned preset to server-signed.
- ✅ Committed `JWT_SECRET` scrubbed from `DEPLOY.md`; **live secret already rotated.**
- ✅ `.env` is gitignored and untracked — only `.env.example` / `.env.admin.example`
  are committed.

**Infrastructure:**
- ✅ Idle pg pool-client errors handled — a dropped DB connection no longer crashes
  the process (`db.js:49`).
- ✅ GitHub Actions CI: type-check, tests, build.
- ✅ 14 test files in `tests/`.
- ✅ Sentry (front + back), PostHog analytics, Resend email, Cloudinary media.
- ✅ Admin app split into its own Railway service with its own JWT + capped DB pool.
- ✅ Build SHA exposed at `/healthz`; UptimeRobot pings it to reduce cold starts.

---

## 6. How to work on this project

**Every session, on either machine:**

1. `git pull` **before** starting work.
2. Read this file. It is loaded automatically via `CLAUDE.md`.
3. Do the work.
4. **Update this file in the same turn** — move tasks between §4 and §5, add
   decisions to §3, refresh the header date/branch/head.
5. Commit code + this file **together**, then `git push` (deploys in ~2 min).

**Why git and not OneDrive:** OneDrive syncs on a delay and can create conflict
copies of files being edited on two machines. Git is deterministic and gives an
audit trail. Pull first, push last — that is the whole protocol.

**Update triggers — update this file whenever anything is:**
added · removed · changed · decided · reversed · completed · deferred · discovered.

Pure Q&A sessions with no change to the project do **not** need an update. The file
must stay trustworthy; noise makes it ignorable.
