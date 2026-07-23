# PROJECT_STATE.md — living state of Vybe / Coterie

> **This file is the single source of truth for _where the project is right now_.**
> `CLAUDE.md` explains how the code works (stable). This file tracks what has been
> done, what is decided, and what is left (changes constantly).
>
> **Claude: read this at the start of every session. Update it in the SAME turn as
> any change** — code added/removed/changed, a decision made or reversed, a task
> finished, scope cut. Never commit a code change without updating this file.
> Update protocol and rationale at the bottom.

**Last updated:** 2026-07-23 · **Branch:** `main` · **Status:** deployed, in testing, not publicly launched

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
| **Main app IS Coterie now** — red/light preview frontend adopted wholesale; Vybe name retired everywhere (UI, PWA, emails, OG). Marketplace + highlight posting removed to match the preview exactly. Resolves the Vybe/Coterie naming split. | Aidan prefers the preview's UI; one look across both apps. | 2026-07-23 |
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
| 5 | **Upgrade `vite` 5→8 and `vitest` 2→4** | `npm audit` (2026-07-20) found 5 vulns — **all dev-only**, none reach production. But two matter locally on Windows: a vite dev-server path traversal and a `launch-editor` NTLM hash disclosure, both exploitable by a malicious website while `npm run dev` is running. Both fixes are **major version bumps**, so this needs a careful pass with build + tests verified, not a blind `audit fix --force`. | ~1–2 h | ⬜ Not started |
| 5b | **Decide on the 2 open Dependabot PRs** | PR #7 = production deps (8 updates) — merging auto-deploys to production. PR #6 = dev deps (10 updates). Needs Aidan's call. | ~30 min | ⬜ Awaiting Aidan |
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
| 15 | `README.md` drift — wrong demo password, stale Railway URL, wrong brand colour, claimed a local DB that doesn't exist. | ✅ Fixed 2026-07-20 |
| 16 | The rotated-and-dead `JWT_SECRET` still sits in git history (commit `321ed9c`). Value is dead; history purge judged not worth the disruption. Accepted risk. | ✅ Accepted |
| 17 | Stray local branch `main-aidan` — confirmed fully merged into `main`, no unique commits, deleted. | ✅ Fixed 2026-07-20 |
| 18 | **ESLint ignores `server/` and `tests/` entirely** — the whole backend has never been linted. `npm run lint` only covers `src/`. Worth widening the config. | ⬜ Not started |
| 19 | Stale remote branches on origin: `main-aidan`, `cleanup/phases-0-2-hygiene-reliability-a11y`, `worktree-admin-split-analytics`. Deleting remote branches needs Aidan's OK. | ⬜ Awaiting Aidan |

---

## 5. Completed — do not redo

**Customer discovery dashboard (2026-07-23):**
- ✅ `Coterie_Interview_Dashboard.xlsx` (30 interview writeups + live-formula
  dashboard + charts) moved from the OneDrive `Claude/` folder into this repo so it
  syncs across both machines. Dashboard sheet reflowed from one 132-row strip into
  a two-column layout (left A–D / right F–I, notes in their own column, full-width
  banners); chart data labels fixed — pies show percent-only, bars value-only (was
  "Series1; category; value; %" overlapping spam). Chart refs remapped to moved
  tables; all formulas recalc clean in Excel. Note: Excel COM crashes saving
  directly to the OneDrive path — edit via openpyxl or save through a temp copy.

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
- ✅ `optionalAuth` deduplicated (2026-07-20): there were two — a weak sync one
  exported from `auth.js` and a correct async one defined privately in `index.js`.
  The correct implementation now lives in `auth.js` and `index.js` imports it, so
  suspended and revoked sessions are treated as anonymous on public reads and there
  is no weaker copy to import by accident. Covered by `tests/auth.test.js`.
- ✅ `npm audit` run 2026-07-20: **no production dependencies are vulnerable**
  (express, pg, bcryptjs, jsonwebtoken, helmet, zod, react all clean). All 5
  findings are dev-only — see §4 #5.
- ✅ Cloudinary uploads switched from unsigned preset to server-signed.
- ✅ Committed `JWT_SECRET` scrubbed from `DEPLOY.md`; **live secret already rotated.**
- ✅ `.env` is gitignored and untracked — only `.env.example` / `.env.admin.example`
  are committed.

**Admin suite — all 3 phases done, deployed 2026-06-24:**
- ✅ Phase 1: expanded analytics (new 7d/30d, suspended, highlights, comments, 8-week
  signups chart), user management (search, suspend/unsuspend, remove), content
  moderation. `users.suspended` blocks login / `/auth/me` / Google callback. Admin
  accounts protected from self-lockout.
- ✅ Phase 2: feedback inbox (`feedback.resolved`) + append-only audit log
  (`admin_audit` + `logAdminAction`) recording every admin mutation with actor.
- ✅ Phase 3: reports queue (`reports` table, `ReportButton` on highlights/comments/
  games) + feature flags (`feature_flags`: `maintenance_mode`, `signups_enabled`;
  `GET /api/config` + `useAppConfig` 30 s poll; maintenance middleware 503s non-admins).
- Admin sign-in is a single shared bcrypt password (`ADMIN_PASSWORD_HASH` +
  `ADMIN_LOGIN_EMAIL=aidan.chongjh@gmail.com`), rate-limited 5 fails/15 min/IP. It
  unlocks a session for that existing user row, so suspension/roles/audit still apply.
  Google OAuth for admin was deliberately dropped 2026-07-07.
- Deferred / possible next: broadcast announcements, 2FA, granular roles.

**Infrastructure:**
- ✅ Idle pg pool-client errors handled — a dropped DB connection no longer crashes
  the process (`db.js:49`).
- ✅ GitHub Actions CI: type-check, tests, build.
- ✅ 14 test files in `tests/`.
- ✅ Sentry (front + back), PostHog analytics, Resend email, Cloudinary media.
- ✅ Admin app split into its own Railway service with its own JWT + capped DB pool.
- ✅ Build SHA exposed at `/healthz`; UptimeRobot pings it to reduce cold starts.

**Loader ball seams made symmetric (2026-07-23, BOTH apps):**
- The volleyball's six seam paths all radiated from a hub at (70,58) toward
  the LEFT side only — one pinwheel arm was effectively missing (Aidan
  spotted it). Rebuilt as ONE arm (2 paths) in `<defs>` reused via
  `<use transform="rotate(120/240 60 60)">`, so 3-fold symmetry is
  structural, not hand-drawn. Applied in `index.html` splash +
  `FullScreenLoader.tsx` in both apps; design verified by rendering to PNG
  with sharp before shipping.

**Loader ball squash removed (2026-07-23, BOTH apps + admin.css):**
- The bouncing-ball loader's impact squash (`scaleX(1.18) scaleY(0.82)`)
  read as a broken oval ball in stills — Aidan flagged it. Keyframes in
  `index.html` (splash), `src/index.css` (ball-bounce), and the frozen
  `src/admin/admin.css` now animate translateY only; the ball stays a
  perfect circle. Mirrored to the preview fork and deployed.

**Main app rebranded to Coterie — preview frontend adopted (2026-07-23):**
- Copied the preview fork's entire frontend into the main app: red brand
  `#d92632`, light theme (slate-scale inversion in `src/index.css`), BrandMark
  logo (red tile + white C), desktop header nav + 2-col browse grid, neutral
  badges, white splash/manifest, Chats bottom tab.
- **Removed to match the preview exactly** (Aidan's explicit choice):
  Marketplace (pages + mock catalog + art), highlight *posting*
  (HighlightUploadModal, "+ Add", post-sheet entry — viewing stays), Settings'
  Help & Support forms and Sounds & haptics toggles. Note: in-app
  feedback/bug-report submission is gone with Help & Support; the admin
  feedback inbox still works for old rows.
- **Vybe → Coterie everywhere**: UI strings, index.html/meta, PWA manifest
  (name "Coterie — Find your players", white theme), emails (`server/email.js`
  incl. MAIL_FROM default), maintenance message, ICS PRODID/UID, share/OG
  text, admin heading. ⚠️ Railway env `MAIL_FROM` may still say "Vybe" —
  Aidan must update it in Railway Variables.
- **All PNG icons regenerated red** via rewritten `scripts/generate-icons.mjs`
  (BrandMark-based: pwa-192/512, maskable, apple-touch, favicon-32, og-image).
  The preview fork still has the old blue PNGs — regenerate there if wanted.
- **Admin app keeps its dark/blue theme**: old `index.css` preserved as
  `src/admin/admin.css`, `src/admin-main.tsx` imports it. Admin is otherwise
  untouched (build passes).
- Verified: `npm run build` (consumer + admin) clean, 101 tests pass, local
  Vite smoke test shows white/red Coterie auth page.

**Demo data localized to Singapore (2026-07-23, BOTH main app and preview fork):**
- All seed data moved from LA to Singapore: SG names (mostly Chinese, some
  Malay/Indian — main 5 are now Jia Min T. / Wei Jie L. / Nur Aisyah B. /
  Arjun N. / Hui Wen O., same 1–5@demo.test logins), real venues (ActiveSG
  sports halls, OCBC Arena, Siloso/Tanjong Beach Sentosa, West/East Coast
  Park), SG neighborhoods as home areas, realistic titles ("Friday Night 6s
  @ Bedok"). Touched: `server/seed.js`, `src/pages/Auth.tsx` (demo login
  list), `src/lib/marketplace.ts` (sellers + court listings, SG-ish prices),
  `src/components/GameForm.tsx` placeholder, `store-assets/*.mjs`, CLAUDE.md.
- **New `syncDemoData()` in seed.js, runs every startup** (wired in
  `start()`): UPDATEs existing demo rows (users + demo games by static id)
  in place, since `seedIfEmpty` never re-runs on a populated DB.
  `seedPastData` games/reviews became upserts for the same reason. p0–p23
  demo emails migrate too (e.g. jordan@ → junwei@demo.test); password sync
  is unchanged. Note: only game_demo_1–5 still exist in prod (6–10 were
  deleted at some point) — the sync respects deletions, updates only.
- Six older screenshot-script games (random ids, US venues) were patched
  live via the API as their demo hosts after deploy. Live data on BOTH apps
  verified clean of US references 2026-07-23.
- Preview fork mirrored (seed.js ported with its shiftDate kept, index.js
  wiring, Auth demo list, placeholder, types comment) and deployed via
  `railway up --service web --ci`.

**Game-form changes (2026-07-22, in BOTH main app and preview fork):**
- Gender options: "Mixed" removed from the form (server still accepts it so old
  games stay editable). Net height "Recreational (2.35m)" renamed to
  "Mixed (2.35m)" (server accepts both).
- New skill scale, All Levels first: All Levels, Low Beginner, High Beginner,
  Low Intermediate, High Intermediate. Legacy Beginner/Intermediate/Advanced
  remain in types + server allowlist for existing data. Applied to GameForm,
  Profile editor, Browse filters, Onboarding cards, Badges/SKILL_INFO maps.
- Date validated end-to-end: client min/max (+366 d) + submit check; zod refine
  rejects unparseable dates and anything outside ~1 year ahead (kills "22222").
- Positions: "Any" moved first and selected by default.
- "Area / neighborhood" field removed from the form; area falls back to the
  venue string server-side, and cards/detail hide area when it repeats location.

- Follow-up 3 (2026-07-22): bottom-tab highlight now persists on deep routes in
  BOTH apps (/game/* lights Browse, /user/* lights Profile) — main app included.
  PREVIEW-ONLY: Settings loses Help & Support + Sounds & haptics (re-addable
  later); new crisp BrandMark logo (red tile + white C) in header and
  favicon.svg; splash/loader ball flattened (gradient + highlight smudge
  removed). Main app Settings/branding untouched.
- Follow-up 2 (2026-07-22, both apps): filter panel loses the "Venue standard"
  net-height chip and the entire Region (N/S/E/W) section. Host form keeps Venue
  standard as its default net height.
- Follow-up (2026-07-22, both apps): host kick removed — roster/waitlist X buttons
  gone and the /members/:id/remove endpoint deleted (promote kept). "Advanced"
  restored as the top skill grade (after High Intermediate). Filter panel now
  mirrors the host form: same net-height values (Rec -> "Mixed (2.35m)", matches
  legacy Recreational too), same position list (full names, no DS), gender
  ("Who it's for") filter removed, dual-range time slider replaced with From/To
  time inputs. New /interested page (games you starred) + star button in the
  header next to Settings.

**Coterie Preview prototype (2026-07-22) — now a FULL-APP FORK:**
- ✅ Rebuilt same day at Aidan's request: the minimal prototype was replaced with a
  **near-exact copy of the main app** (auth + demo one-tap login, browse tabs,
  search/filters, full GameForm, game detail, chats, notifications, profiles,
  ratings, settings). Removed: **Marketplace**, **highlight posting**, admin app.
- Theme flipped to light/white with **red** brand (#d92632) centrally in
  `src/index.css`: slate color scale inverted via `@theme` + `.text-white` remap —
  component classNames untouched, so main-app changes can be re-merged easily.
- Fork deltas: seed demo-game dates shift relative to today (`shiftDate` in
  seed.js); Market tab → Chats tab; post sheet has only "Post a game"; light
  splash/PWA manifest; blue hexes recolored red.
- 2026-07-22 later-3: preview renamed Vybe -> Coterie everywhere user-facing; desktop header nav enlarged (18px); Browse/Upcoming/Hosting/Past switcher reverted to compact.
- 2026-07-22 later-2: browse desktop polish — games-count moved out of the grid (was eating a card slot), Host button moved from header to the page heading row, view tabs enlarged on lg.
- 2026-07-22 later: desktop layout added (header nav + 2-col browse grid on lg,
  bottom tabs mobile-only); type/skill badges neutralized (color only for spots
  status + brand). Custom domain **preview.coterie.com.de** created on the Railway
  service; waiting on Aidan to add the CNAME + TXT records at **Porkbun** (DNS host
  for coterie.com.de) — records are in the coterie-prototype README… see chat.
- Same live URL + repo as below. Local dev `.env` points DATABASE_URL at the
  preview project's Railway Postgres public URL (no local DB).

**(Superseded same day — original minimal prototype:)**
- ✅ Built a standalone no-login demo of the core loop (browse → detail → host →
  join/leave) in a **separate sibling repo**: `../coterie-prototype` (own git repo,
  not part of this one). Purpose: something simple Aidan can show/demo on the web.
- Design: light mode / white bg, **red** brand `#d92632` replacing blue, **green**
  `#16a34a` for success states only. Mobile-first (FAB on phones), responsive
  multi-column on desktop. Branded "coterie PREVIEW".
- Identity: display name asked on post/join, kept in localStorage; "Continue as
  demo player" one-tap fallback. No accounts, deliberately no edit/delete endpoints.
- Stack mirrors main app (React 18 + TS + Vite 6 + Tailwind 4 + Express 4).
  `server/db.js` runs on Postgres when `DATABASE_URL` is set, in-memory otherwise
  (local dev needs no DB). Server-side validation, strict id regex, per-IP rate
  limits (20 writes/10 min), 10 kB body cap, security headers, transactional
  capacity check. Verified end-to-end in browser + curl probes 2026-07-22.
- ✅ Deployed 2026-07-22: GitHub repo `aidancjh/coterie-prototype` (private),
  Railway project `coterie-preview` (service `web` + Postgres),
  **live at https://web-production-e0326.up.railway.app**. Railway CLI now
  installed + authed on the PC. GitHub repo is NOT connected to Railway
  (app lacked repo access) — deploys go via `railway up --service web --ci`
  from the prototype folder, pushes do not auto-deploy.
- Emoji icons replaced with stroke-only SVG line icons (2026-07-22).
- Side change in THIS repo: `.claude/launch.json` gained `coterie-preview-api` /
  `coterie-preview-web` entries for local preview.

---

## 6. How Aidan works — standing preferences

These apply on **both** machines and to every session. (Claude Code's per-machine
memory lives in `C:\Users\aidan\.claude\` and does **not** sync between devices —
it holds credentials and ~145 MB of session data, so it must not be put in OneDrive.
This section is the portable copy. Keep it current.)

- **Always commit and push to `main` after a change, without being asked.** Railway
  auto-deploys on push (~2 min) and that is the only way Aidan can test — he uses the
  production PWA at coterie.com.de installed on his phone, not a local dev server.
  A fix that lives only locally reads as "still broken" to him.
- **After a PWA change, remind him to fully close and reopen the app** (with network)
  so the service worker picks up the new version.
- **Claude has no access to Railway.** Anything involving env vars, services, or the
  database dashboard is Aidan's step — give him an exact, copy-pasteable checklist.
- **Never ask for, store, or use his account password.** He has offered it before; it
  was declined and must stay declined.
- **Cold starts** are currently mitigated by an UptimeRobot ping to `/healthz` every
  ~5 min (Aidan configured it). Replace with paid always-on Railway at launch — §4 #8.
- **He is a non-engineer.** Explain the why, not just the what. He is hiring software
  engineers for the code review — prepare scope for them rather than doing it unasked.
- **Keep the business overview doc current — unprompted, on either machine.** It lives at
  `C:\Users\aidan\OneDrive - Soul ways\Claude\Coterie-Business-Overview.docx` (one level above
  this repo; OneDrive syncs it between machines). Whenever the product, plans, traction, or
  context change, update the docx in the same session. Fully rewritten 2026-07-22; renamed
  from Vybe-Business-Overview.docx and rebranded 2026-07-23 to match the app-wide Coterie
  rebrand (doc accent color now Coterie red; marketplace-preview and highlights-feed
  references removed to match the adopted frontend). Standing content decisions: product
  name is Coterie everywhere; Singapore-only, volleyball-only (SEA
  years out, only if very successful locally); **no Financials section** (removed at Aidan's
  request); future features (marketplace, in-app payments, live scorecard, coaching) are
  explicitly gated behind perfecting the host/join core loop; waitlist is ~73 —
  62 Reddit / 7 Telegram / 4 Instagram, founder-reported 2026-07-22, driven by two
  r/SGVolleyball problem-posts with 50k+ combined views; the doc has a
  "Singapore scene on the ground" market section (founder interview 2026-07-22:
  40–60 games/wk, Telegram listing vignette, ~half of games see no-shows, ~90% pay
  after, $5–$10/player, age-segregated crews; verified: 24 ActiveSG volleyball venues,
  14-day ballot mechanics, OCBC ~S$15/hr, Haikyu growth effect, no volleyball-native
  SG competitor as of Jul 2026); the doc ends with a "What's Missing — Three
  Lenses" (engineer / business / investor) section that should be kept current as items
  get resolved.

---

## 7. How to work on this project

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

**The repo currently lives inside OneDrive**, which works but carries three risks:
1. Conflict copies of edited source files (hence the `*-aidan.*` rule in `.gitignore`).
2. `node_modules` — hundreds of MB of machine-specific compiled binaries (`sharp`,
   `esbuild`) that OneDrive syncs pointlessly and can corrupt across machines.
3. **`.git` itself** — if OneDrive syncs it mid-write, or reconciles two machines'
   versions, the repo can be corrupted. This is the one that loses work.

Rules while it stays in OneDrive: never open the project on both machines at once;
wait for OneDrive to show "Up to date" before switching; exclude `node_modules`,
`dist`, `dist-admin`, and `.vite` from sync.

**Clean fix (do this when setting up staging):** move the repo out of OneDrive (e.g.
`C:\dev\Volleyball-Claude`) and clone from GitHub on each machine — git handles sync
entirely and the whole risk class disappears. One-time cost: copy `.env` to each
machine by hand, since it isn't in git.

**Update triggers — update this file whenever anything is:**
added · removed · changed · decided · reversed · completed · deferred · discovered.

Pure Q&A sessions with no change to the project do **not** need an update. The file
must stay trustworthy; noise makes it ignorable.
