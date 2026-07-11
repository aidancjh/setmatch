# Launch audit — Vybe (Phase 0)

Date: 2026-06-22 · Branch: `app-store-prep`

## Method & scope

- **Build/type-check:** `npm run build` (= `tsc --noEmit && vite build`) → **passes clean**, PWA service worker generated, bundle sizes reasonable (~205 KB main / 65 KB gzip).
- **Code-level audit:** read `server/index.js`, `server/repo.js`, `server/auth.js`, `src/lib/api.ts`, and pages.
- **Live smoke test:** **deferred.** The only `DATABASE_URL` in `.env` points at the production Railway Postgres (CLAUDE.md confirms there is no local DB). Running mutating flows locally would write to production data, so interactive create/join/delete testing was not done. Recommend a throwaway/staging DB to enable safe end-to-end testing (also unblocks the Phase 3 integration tests).

Overall: the app is **in good shape** — feature-complete, builds clean, sound data layer (parameterized SQL, case-insensitive email, correct authorization checks, N+1-free serialization). No functional blockers found. Findings below are launch hygiene, hardening, correctness edge cases, and cleanup.

---

## Blocker

_None._ Core functionality builds and the logic is sound.

---

## Should-fix (before a public / app-store launch)

1. **Known-credential demo accounts + fake data are seeded into production on every startup.**
   `start()` calls `syncDemoPasswords()` and `seedPastData()` on each boot (`server/index.js:1312-1313`, logic in `server/seed.js`). That means `1@demo.test … 5@demo.test` are loginable in production with password `111111`, and fake past games/reviews appear in the live app. App-store reviewers (and anyone) could log into these. **Decision needed:** gate seeding + demo-password-sync behind an env flag so production launches clean. _(Phase 2 will add the flag; defaulting to current behavior so nothing changes unless you set it.)_

2. **Password minimum is only 6 chars, in two places.** Signup (`server/index.js:212`) and reset (`server/index.js:357`). Phase 2 raises both to 10 — fix **both** for consistency.

3. **Inconsistent / weak email validation.** Signup uses `String(email).includes("@")` (`server/index.js:208`); `forgot-password` does **no** format check at all (`server/index.js:314-315`); waitlist uses a proper regex (`server/index.js:1238`). Phase 2 standardizes on one validator.

4. **Account deletion needs no re-authentication.** `DELETE /api/auth/me` (`server/index.js:260`) immediately hard-deletes via `repo.deleteAccount` (`server/repo.js:856`) with no password confirmation and no recovery. Phase 2 requires password re-entry.

5. **No per-user rate limiting on user-generated content.** Comments (`server/index.js:737`) and chat messages (`server/index.js:787`) are only covered by the global 120/min limiter — a single user can spam. Phase 2 adds a tighter per-user/IP limiter.

6. **Invalid rating returns 500 instead of 400 (correctness).** `ratePlayer` (`server/repo.js:889-891`) and `createReview` (`server/repo.js:803`) receive `Number(rating)` from the route; a missing/non-numeric value becomes `NaN`, which passes `rating < 1 || rating > 5` (both comparisons are false for `NaN`), then fails at the integer DB insert → 500. Add an explicit `Number.isInteger` 1–5 check. _(Fix in Phase 1.)_

---

## Polish / cleanup

7. **Dead code (~110 lines).** `buildConfirmEmail` (`server/index.js:1085-1144`) duplicates the join-confirmation email that is actually built **inline** at `server/index.js:594-621`, and is never called. `buildICS` / `icsTime` / `icsEscape` (`server/index.js:1148-1193`) are an unused cluster. Not flagged by `tsc` because `server/*.js` isn't type-checked. Remove. _(Fix in Phase 1.)_ `buildGCalUrl` **is** used — keep it.

8. **JWT TTL is 30 days** (`server/auth.js:19`). Phase 2 → 14 days.

9. **Email failures are console-only.** The fire-and-forget join email logs errors to `console.error` but not Sentry (`server/index.js:632-638`), so delivery failures are invisible in monitoring. Phase 2 reports to Sentry.

10. **Timezone simplification in review timing.** `pendingReviews` casts the stored local game time as UTC: `CAST(g.date || 'T' || g.time || ':00+00' AS TIMESTAMPTZ)` (`server/repo.js:787-788`). For a Singapore (UTC+8) audience this skews the ">2h after end / <7 days" window by the local offset, so the post-game review prompt can fire at the wrong time. Low severity; note for a later timezone pass.

11. **Possible over-fill race in `joinGame`.** `playerCount()` is read, then a row inserted (`server/repo.js:472-486`); two simultaneous joins on the last slot could both become players. Low risk at current scale; a DB-level constraint or transaction would close it.

12. **Doc drift in `CLAUDE.md`** (fix in Phase 1): startup order is documented as `initSchema → syncDemoPasswords → seedIfEmpty` but is actually `initSchema → seedIfEmpty → syncDemoPasswords → seedPastData → promoteAdminsFromEnv` (`server/index.js:1310-1314`); the localStorage token key is documented as `token` but is `vb.token` (`src/lib/api.ts:10`); the schema table list says `comments` but the tables are `game_comments` / `messages`.

13. **Minor inconsistency:** `GET /api/waitlist` does a manual admin check (`server/index.js:1245-1247`) instead of reusing the `requireAdmin` middleware. Works; just inconsistent.

---

## Verification baseline (re-run after each later phase)

```
npx tsc --noEmit     # must stay clean
npm run build        # must stay green
npm test             # (added in Phase 3)
```

Phase 1 addresses items **6, 7, 12**. Phase 2 addresses **1, 2, 3, 4, 5, 8, 9**. Items 10, 11, 13 are noted for a later pass (not launch-blocking).

### Phase 1 — DONE ✅ (commit on branch `app-store-prep`)
- **6 fixed** — `ratePlayer` + `createReview` now reject non-integer/NaN ratings with a 400 (`server/repo.js`, added `Number.isInteger` guard).
- **7 fixed** — removed dead `buildConfirmEmail` + `buildICS`/`icsTime`/`icsEscape` (~110 lines) from `server/index.js`; kept the in-use `buildGCalUrl`/`esc`/`prettyTime`/`calDate`/`injectMeta`.
- **12 fixed** — corrected `CLAUDE.md` startup order, localStorage key (`vb.token`), and schema table list.
- Verified: `node --check` on all server files, `tsc --noEmit`, `npm run build` all clean.

### Phase 2 — DONE ✅
- **1 (demo data)** — `start()` now gates `seedIfEmpty`/`syncDemoPasswords`/`seedPastData` behind `SEED_DEMO` (defaults on; set `SEED_DEMO=false` for a clean prod launch). Documented in `.env.example` + `OPERATIONS.md`. **Note:** the "Sign in with a demo account" hint in `Auth.tsx` and demo rows already in the prod DB are a separate manual cleanup if you flip the flag.
- **2 (password min)** — raised 6→10 via `PASSWORD_MIN` in `server/index.js` (signup + reset) and matching client checks/placeholders in `Auth.tsx`.
- **3 (email validation)** — added `isValidEmail()` (`server/index.js`); applied to signup + forgot-password (was unvalidated). Waitlist already used a regex.
- **4 (account deletion)** — `DELETE /api/auth/me` now requires password re-entry for password accounts; OAuth-only accounts fall back to client confirm. Wired through `api.del(body)`, `deleteAccount(password)`, and a password field in `Settings.tsx`.
- **5 (content rate limit)** — added `contentLimiter` (20/min per user) on game comments, chat messages, and highlight comments POST routes.
- **8 (JWT TTL)** — 30d → 14d (`server/auth.js`).
- **9 (email failures)** — join-email failures now reported to Sentry (`captureMessage`/`captureException`), not just console.
- **7 (env checklist)** — `.env.example` and `OPERATIONS.md` updated with `APP_URL`, `ADMIN_EMAILS`, `RESEND_API_KEY`, `GOOGLE_*`, `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SEED_DEMO`.
- Verified: `node --check`, `tsc --noEmit`, `npm run build` all clean.

### Phase 3 — DONE ✅
- Added **Vitest** + **supertest** (devDeps) and a `"test": "vitest run"` script; standalone `vitest.config.ts` (Node env, dummy `DATABASE_URL` so tests never touch a real DB).
- Made `server/index.js` import-safe for tests: `start()` is skipped under `NODE_ENV=test`, the OAuth-cleanup timer is `unref()`'d, and the pure helpers (`validGameInput`, `gameInputFrom`, `isValidEmail`, `isCloudinaryUrl`, `addWeeksISO`, `PASSWORD_MIN`) + `app` are exported.
- **48 tests across 4 files, all green:**
  - `tests/auth.test.js` — bcrypt round-trip, salting, timing sentinel, JWT subject/secret, `requireAuth`/`optionalAuth` behavior.
  - `tests/validators.test.js` — `isValidEmail`, `isCloudinaryUrl`, `validGameInput` boundaries, `addWeeksISO`, `PASSWORD_MIN`.
  - `tests/api.test.js` — supertest on DB-safe paths (signup validation 400s, 401s without token, invalid-game-body 400, JSON 404).
  - `tests/format.test.ts` — frontend date utils (`relativeDay`, `isPast`, `todayISO`).
- Run with `npm test`. Verified: `npm test` (48 passed), `tsc --noEmit`, `npm run build` all clean.

> **Test-coverage limitation:** integration tests intentionally stop before any DB call (no local/staging DB exists — see "Method & scope"). To test full request→DB→response flows (joins, waitlist promotion, ratings), stand up a throwaway Postgres and add a `TEST_DATABASE_URL`; the app is now import-safe, so that's straightforward.
