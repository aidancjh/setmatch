# Vybe — App Store & Google Play distribution

**Honest status:** the actual *publishing* steps can't be fully automated — they
require **your paid developer accounts**, and iOS specifically requires a **Mac**.
This doc is the complete checklist + what's already prepared, so the remaining
work is mechanical.

## What's already done ✅
- **Installable PWA** today (Add to Home Screen) — no store needed.
- App **icons** generated in brand coral (`public/pwa-*.png`, `apple-touch-icon.png`,
  `maskable-512x512.png`) and a social **share image** (`public/og-image.png`).
- **Privacy policy** hosted publicly at `https://<your-domain>/privacy` (stores
  require a privacy policy URL — this satisfies it).
- A clean web build that's wrappable into native apps.

## The approach: Capacitor (reuse this exact web app)
[Capacitor](https://capacitorjs.com) wraps the existing React build into native
iOS/Android apps that point at your built frontend — no rewrite. The app already
talks to the live API over HTTPS, so it works as-is inside the wrapper.

### One-time setup (do on your machine)
```bash
npm i -D @capacitor/cli
npm i @capacitor/core @capacitor/android @capacitor/ios
npx cap init Vybe com.coterie.app --web-dir=dist
npm run build && npx cap add android && npx cap add ios
```
Each time you change the app: `npm run build && npx cap sync`.

> Tip: instead of bundling the web files, you can point the native app at your
> live Railway URL (set `server.url` in `capacitor.config`) so app-store builds
> always show the latest deploy without re-submitting. (Note: some reviewers
> prefer bundled assets — bundling is the safer choice for approval.)

---

## Google Play  (≈ US$25 one-time — doable from Windows)
1. Create a **Google Play Console** account ($25 once).
2. Install **Android Studio**; open the `android/` folder from Capacitor.
3. Set app id `com.coterie.app`, version, and the coral icons.
4. **Build → Generate Signed Bundle (.aab)**; create & **safely store a keystore**
   (losing it means you can't update the app again).
5. In Play Console: create the app, upload the `.aab`, fill the **store listing**
   (title, short/full description, screenshots, feature graphic), set the
   **Privacy Policy URL** (`/privacy`), and complete the **Data safety** form
   (collects: name, email, user content; not shared; encrypted in transit).
6. Submit for review (hours–days).

## Apple App Store  (US$99/yr — needs a Mac OR a cloud-Mac service)
1. Enroll in the **Apple Developer Program** ($99/yr).
2. Build the `ios/` project — requires **Xcode on macOS**. No Mac? Use a cloud
   build service (Ionic **Appflow**, **Codemagic**, or **EAS Build**) to compile
   and sign without owning a Mac.
3. In **App Store Connect**: create the app, upload the build via Xcode/Transporter.
4. Fill **App Privacy "nutrition labels"** (Contact Info: name, email; User
   Content: messages — used for app functionality, not tracking).
5. Add screenshots (per device size), description, keywords, support URL, and the
   **Privacy Policy URL** (`/privacy`).
6. Submit for review (typically 1–3 days).

---

## Assets checklist
- [x] App icons (coral) — generated
- [x] Privacy policy URL — `/privacy`
- [ ] **Screenshots** — capture from a phone or browser devtools (iPhone 6.7"/6.5"
      and Android phone sizes). Good shots: the games feed, a game detail with
      roster, posting a game, the chat.
- [ ] **Feature graphic** (Play, 1024×500) — can reuse the brand style
- [ ] Short + full **descriptions** (draft below)
- [ ] **Keystore** (Android) / signing certs (iOS) — create & back up

### Draft store description
> **Vybe — find your players, fill your games.**
> Never play short again. Post a pickup volleyball game, set how many slots you
> need, and let players claim the open spots. Browse games near you, join with one
> tap, chat with your group, get notified when spots fill, and add games to your
> calendar. Free to use.

---

## Release pipeline (recommended)
- **Web (now):** `git push` → Railway auto-builds & deploys. The PWA updates
  automatically (network-first service worker).
- **Native (after setup):** `npm run build && npx cap sync`, bump the version,
  rebuild signed binaries, upload to Play Console / App Store Connect. Consider
  Appflow/Codemagic to automate the build+sign step on each tagged release.
- Keep `/healthz` monitored (see OPERATIONS.md) so you know the backend the apps
  depend on is up.
