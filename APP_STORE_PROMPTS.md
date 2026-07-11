# Vybe → App Store: phased Claude Code prompts

This is your step-by-step kit for getting **Vybe** from "live web app" to
**submitted on the Apple App Store and Google Play**. The app is already
feature-complete and runs as a polished PWA — the work below is hardening,
testing, and wrapping the existing web build with **Capacitor** (no rewrite).

## How to use this

1. **Run the phases in order.** Open a **fresh Claude Code session** for each
   phase, paste the prompt for that phase, and let it finish.
2. **Verify between phases.** Every code-touching phase ends by running
   `npx tsc --noEmit` + `npm run build`. Don't move on until those pass.
3. **Commit after each phase** (`git add -A && git commit`) so you can roll back.
4. **Know what only you can do.** Claude can write code, configs, and docs. It
   **cannot**: pay for developer accounts, hold/back up your signing keystore,
   run Xcode (needs a Mac), or click "Submit" in the store consoles. Those steps
   are called out explicitly and left to you.

### What's automatable vs. yours

| Phase | Claude does | You do |
|------|-------------|--------|
| 0 Verify | Builds, smoke test, writes audit | — |
| 1 Bug fixes | All code fixes | Review the diff |
| 2 Hardening | All code changes | Review |
| 3 Tests | Adds Vitest + tests | Review |
| 4 Store assets | Drafts copy, generates graphics/screenshots | Approve copy, final art choices |
| 5 Android wrap | Capacitor + Android config | Play account ($25), **keystore + backup**, upload `.aab` |
| 6 iOS wrap | Capacitor iOS + cloud-build config | Apple account ($99/yr), Codemagic signup, App Store Connect upload |

You're on **Windows**, so Android (Phase 5) is fully local. iOS (Phase 6) needs a
**Mac or a cloud build service** — the prompt sets up Codemagic so you don't need a Mac.

---

## Phase 0 — Baseline verification & issue inventory

> You are working in the Vybe repo (React 18 + TypeScript + Vite frontend in
> `src/`, Express + PostgreSQL backend in `server/`, deployed on Railway). Read
> `CLAUDE.md` first for architecture and conventions.
>
> **Goal: produce a punch list, change no code.** Do the following:
> 1. Run `npx tsc --noEmit` and `npm run build`. Report any errors verbatim.
> 2. Start the app with `npm run dev` and smoke-test every core user flow using
>    the demo accounts in `CLAUDE.md` (e.g. `1@demo.test` / `111111`). Cover:
>    signup, login, onboarding, browse + every filter, create game (incl. a
>    recurring/weekly one), edit game, join/leave/waitlist, mark interested,
>    game comments, members-only chat, post-game player ratings + host reviews,
>    highlights upload (photo + video), notifications + mark-all-read, profile
>    edit (avatar/banner/positions/privacy), settings (feedback, password reset,
>    account deletion), admin panel, the public `/waitlist` page, and the full
>    forgot-password → reset flow.
> 3. For each thing that's broken, confusing, visually off, or rough, write one
>    line with the **file:line** and a short description of the problem.
>
> Write the results to a new file `LAUNCH_AUDIT.md` grouped as **Blocker /
> Should-fix / Polish**. Do **not** fix anything yet — this is the checklist the
> next phases work from. Finish by printing the build/type-check result and the
> count of issues found in each group.

---

## Phase 1 — Bug fixes & correctness

> Read `CLAUDE.md` and `LAUNCH_AUDIT.md`. Fix every **Blocker** and **Should-fix**
> item in `LAUNCH_AUDIT.md`, then as many **Polish** items as you can do safely.
>
> Rules:
> - Smallest correct diff per issue. Match the surrounding code style.
> - Reuse existing helpers (`src/lib/format.ts`, `src/lib/api.ts`,
>   `src/services/gamesService.ts`, `server/repo.js`) instead of adding new code.
> - After each fix, re-run `npx tsc --noEmit`. After the batch, run `npm run build`.
> - Re-test the specific flows you touched (use `npm run dev` + the demo accounts).
>
> When done: update `LAUNCH_AUDIT.md` to check off what's fixed, list anything you
> intentionally deferred and why, and print the final type-check + build output.

---

## Phase 2 — Security & quality hardening

> Read `CLAUDE.md`, `server/index.js`, `server/auth.js`, `OPERATIONS.md`, and
> `.env.example`. Apply these hardening changes (locate the current line; numbers
> may have shifted):
>
> 1. **Password policy:** raise the signup minimum from 6 to **10 characters**
>    (search `validSignup`/the length check in `server/index.js`). Surface a clear
>    message on the client (`src/pages/Auth.tsx`) and server.
> 2. **JWT TTL:** reduce token lifetime from 30 days to **14 days** in
>    `server/auth.js` (`signToken`/`expiresIn`).
> 3. **Email validation:** replace the `includes("@")` check in `server/index.js`
>    with a proper email regex (RFC-ish) and a length cap. Apply to signup,
>    forgot-password, and waitlist.
> 4. **Rate-limit user content:** add per-user/IP rate limiting to the game
>    comments endpoint and the chat messages endpoint (reuse the existing
>    `express-rate-limit` setup in `server/index.js`; mirror the auth limiter).
> 5. **Account deletion:** require password re-entry before `DELETE /api/auth/me`
>    succeeds (verify with the existing `verifyPassword`); update the Settings UI
>    (`src/pages/Settings.tsx`) to collect it.
> 6. **Email failures:** ensure the fire-and-forget join/confirmation emails report
>    failures to Sentry (not just `console`), so silent delivery failures are visible.
> 7. **Env checklist:** confirm `.env.example` and `OPERATIONS.md` list every var the
>    code reads (`JWT_SECRET`, `DATABASE_URL`, `DATABASE_SSL`, `RESEND_API_KEY`,
>    `GOOGLE_CLIENT_ID/SECRET`, `APP_URL`, `ADMIN_EMAILS`, `SENTRY_DSN`,
>    `VITE_SENTRY_DSN`, `VITE_CLOUDINARY_*`). Add any that are missing.
>
> Don't weaken existing protections (parameterized SQL, bcrypt, Helmet/CSP, CORS).
> After changes: `npx tsc --noEmit` + `npm run build`, then test signup with a short
> password (should reject), account deletion (should require password), and posting
> many comments quickly (should rate-limit). Report a summary of each change with
> file:line and the verification results.

---

## Phase 3 — Automated tests

> The repo currently has **no automated tests** — this is the biggest quality gap.
> Add a lightweight but meaningful test suite.
>
> 1. Add **Vitest** (`npm i -D vitest`) and a `"test": "vitest run"` script in
>    `package.json`. Configure it to work with the existing Vite/TS setup.
> 2. Write **server unit tests** for the security-critical, pure-ish logic:
>    - `server/auth.js`: `hashPassword`/`verifyPassword` round-trip, `signToken` +
>      verify, rejection of tampered/expired tokens.
>    - The input validators in `server/index.js` (e.g. `validGameInput`, email +
>      password checks): boundary cases — too-short title, bad date/time format,
>      out-of-range slot counts, invalid skill/type enums, short password, bad email.
>    - Refactor a validator into an importable function if needed to test it
>      (keep behavior identical).
> 3. Add a couple of **API integration tests** with `supertest` against the Express
>    app for happy + sad paths (e.g. signup → login → `GET /api/auth/me`; rejecting
>    a protected route without a token). Use a test DB or mock the `pg` pool —
>    don't touch production data.
> 4. Add a `vitest`-based **frontend smoke test** for one critical component (e.g.
>    that `Auth.tsx` renders and shows a validation error on a short password).
>
> Aim for solid coverage of **auth + validation**, not 100% overall. After: run
> `npm test` (all green), `npx tsc --noEmit`, `npm run build`. Report coverage of
> what you tested and how to run the suite.

---

## Phase 4 — Store assets & listing metadata

> Prepare everything the app stores require for the listing. Read `STORE.md`
> (it already has a draft description and an assets checklist) and reuse it.
>
> 1. **Screenshots:** using `npm run dev` and browser devtools device emulation
>    (or Playwright if available), capture clean screenshots of the games feed, a
>    game detail with roster, the create-game form, and the chat — at **iPhone
>    6.7" (1290×2796)** and **6.5" (1242×2688)** and a common **Android phone**
>    size. Save them under `store-assets/screenshots/`. Log into a demo account so
>    the screens show realistic data (run `POST /api/admin/seed-past-data` as an
>    admin first if more content helps).
> 2. **Play feature graphic:** generate a 1024×500 PNG in the brand coral
>    (`#f4634e`) with the Vybe name/tagline. Save to `store-assets/`.
> 3. **Listing copy:** finalize a short description (≤80 chars), a full description,
>    keywords, and a support URL/email. Start from the draft in `STORE.md`. Save to
>    `store-assets/listing.md`.
> 4. **Privacy answers:** in `store-assets/listing.md`, write out the answers for
>    Google Play **Data safety** and Apple **App Privacy** based on what the code
>    actually collects: account name, email, user-generated content (games,
>    comments, chat, highlights); **not shared** with third parties; **encrypted in
>    transit**; used for app functionality, not tracking. Note the privacy policy
>    URL is `https://coterie.com.de/privacy` (confirm the `/privacy` page renders).
> 5. **Icons:** confirm `public/` has the required icons (`pwa-192x192.png`,
>    `pwa-512x512.png`, `maskable-512x512.png`, `apple-touch-icon.png`); if a store
>    needs a size that's missing (e.g. iOS 1024×1024 marketing icon), generate it
>    with `sharp` (already a dependency) into `store-assets/icons/`.
>
> Report the full list of generated files and flag anything that needs a human
> decision (final wording, brand art).

---

## Phase 5 — Capacitor wrapper: Android (Google Play)

> Wrap the existing web build as a native Android app with **Capacitor** — no
> rewrite. Read `STORE.md` (the Capacitor approach is documented there). I'm on
> **Windows**, so do everything that's local and clearly mark the steps that need
> me (Play account, keystore, uploads).
>
> 1. Install: `npm i -D @capacitor/cli` and `npm i @capacitor/core @capacitor/android`.
> 2. Init: `npx cap init Vybe com.coterie.app --web-dir=dist`. Commit the
>    generated `capacitor.config.ts`.
> 3. **Bundled vs. live URL:** default to **bundled assets** (`npm run build` then
>    `npx cap sync`) — it's the safer choice for store review per `STORE.md`. Add a
>    commented `server.url` option explaining the live-Railway alternative.
> 4. `npm run build && npx cap add android && npx cap sync`.
> 5. Native polish so it feels like an app, not a webview:
>    - Set the status-bar color / style to match the coral theme.
>    - Wire a splash screen using the existing brand icons.
>    - Handle the **Android hardware back button** (use Capacitor's App plugin to
>      pop the router / exit on the root route).
>    - Verify safe-area insets still work inside the wrapper.
>    - Add `@capacitor/app` (and only the plugins actually needed) and document any
>      `AndroidManifest.xml` changes.
> 6. Add the release flow to `STORE.md`: on each release, `npm run build &&
>    npx cap sync`, bump version, rebuild.
> 7. Update `.gitignore` for the generated `android/` build artifacts as appropriate.
>
> **My manual steps — write these as a numbered checklist in `STORE.md`:** create
> the Play Console account ($25), open `android/` in Android Studio, set version +
> icons, **Build → Generate Signed Bundle (.aab)**, create and **back up the
> keystore** (losing it = can't update the app), then upload the `.aab` and fill the
> listing using `store-assets/`.
>
> After code changes: `npx tsc --noEmit` + `npm run build` + `npx cap sync` must all
> succeed. Report what you configured and the exact Android Studio steps left for me.

---

## Phase 6 — Capacitor wrapper: iOS (Apple App Store)

> Add the iOS target to the Capacitor setup from Phase 5. I'm on **Windows with no
> Mac**, so set up a **cloud build service (Codemagic)** to compile and sign the iOS
> app, and clearly separate code/config (you) from account/signing/upload (me).
>
> 1. `npm i @capacitor/ios`, then `npx cap add ios && npx cap sync`.
> 2. Configure iOS specifics: status-bar style, splash screen, safe-area handling,
>    and add any required `Info.plist` usage strings **only** for native plugins you
>    actually added in Phase 5 (don't request permissions the app doesn't use).
> 3. Create a **Codemagic** config (`codemagic.yaml`) that: installs deps, runs
>    `npm run build && npx cap sync`, builds the iOS app, and is set up for
>    automatic code signing via App Store Connect API key. Leave placeholders for my
>    signing credentials and document exactly which secrets I paste into Codemagic.
> 4. Document the bundle id (`com.coterie.app`), version/build numbering, and the
>    `npm run build && npx cap sync` step before every iOS build.
>
> **My manual steps — write as a checklist in `STORE.md`:** enroll in the Apple
> Developer Program ($99/yr), create the App Store Connect app + API key, paste the
> signing secrets into Codemagic, run the cloud build, upload via Codemagic/
> Transporter, fill the **App Privacy** labels and per-device screenshots (from
> `store-assets/`), and submit for review.
>
> After changes: `npx tsc --noEmit` + `npm run build` + `npx cap sync` succeed.
> Report the Codemagic setup and the exact App Store Connect steps left for me.

---

## Final pre-submission checklist

Before you hit "Submit" in either console:

- [ ] `npm test`, `npx tsc --noEmit`, and `npm run build` all pass.
- [ ] `LAUNCH_AUDIT.md` blockers + should-fixes all resolved.
- [ ] Production env vars set on Railway (`JWT_SECRET` is long/random, `APP_URL` is
      the real domain, `DATABASE_SSL=true`, Resend + Sentry + Google + Cloudinary keys set).
- [ ] `/healthz` returns OK and `/privacy` renders (stores require the privacy URL).
- [ ] App tested **inside the native wrapper** on a real Android device and (via
      Codemagic build / TestFlight) on iOS — login, create/join a game, chat, upload.
- [ ] Android **keystore backed up** somewhere safe (you cannot recover it).
- [ ] Store listings filled from `store-assets/` (screenshots, descriptions,
      feature graphic, privacy answers).
- [ ] Version/build numbers bumped.

**Reality check on timelines:** Android via Capacitor is doable this week on
Windows. iOS adds the $99/yr account + Codemagic setup, and Apple review typically
takes 1–3 days. Both stores reject "thin" webview apps that add nothing over the
website — the native back button, splash, status bar, and installable feel from
Phases 5–6 are there to clear that bar, but a few app-like touches (push
notifications, native share) make approval smoother if reviewers push back.
