# Coterie — Store listing (paste-ready)

Everything you copy into Google Play Console and App Store Connect. Copy verbatim;
tweak voice to taste. Character limits are noted so nothing gets truncated.

---

## 1. App identity

| Field | Value |
|-------|-------|
| App name | **Coterie** |
| Bundle / App ID | `com.coterie.app` |
| Category | **Sports** (secondary: Social) |
| Content rating | Everyone / 4+ |
| Website | https://coterie.com.de |
| Privacy Policy URL | https://coterie.com.de/privacy |
| Support email | support@coterie.com.de |
| Price | Free |

---

## 2. Google Play listing

**App title** (≤30 chars) — *26*
```
Coterie: Pickup Volleyball
```

**Short description** (≤80 chars) — *73*
```
Find pickup volleyball games near you, fill your roster, never play short.
```

**Full description** (≤4000 chars)
```
Short a player? Can't find a game? Coterie is the easiest way to organise and
join pickup volleyball.

Post a game, set how many spots you need, and let players claim the open slots.
Browse games happening near you, join with one tap, and coordinate everything in
one place — no more chasing people across group chats.

WHY COTERIE
• Never play short — see exactly how many slots are open before you commit.
• One place for everything — the roster, the chat, the time, the location.
• Find your level — games are tagged Beginner, Intermediate, Advanced, or All
  Levels, so you turn up to the right match.
• Hosting made simple — post a one-off or a weekly recurring game in seconds.

WHAT YOU CAN DO
• Browse and filter games by type, skill level, and date
• Join a game with one tap, or hop on the waitlist when it's full
• Post indoor or beach games — single or recurring
• Chat with your group and leave comments on each game
• Get notified the moment spots fill or details change
• Add games straight to your calendar
• Rate teammates and review hosts after you play
• Build a profile with your skill level and playing history
• Share post-game highlights with the community

HOW IT WORKS
1. Create your account and set your skill level.
2. Browse games near you — or post your own and set the slots.
3. Join, chat, play. Coterie keeps your group sorted.

Coterie is free to use. Find your players, fill your games.
```

---

## 3. Apple App Store listing

**App name** (≤30 chars) — *26*
```
Coterie: Pickup Volleyball
```

**Subtitle** (≤30 chars) — *29*
```
Find players, fill your games
```

**Promotional text** (≤170 chars) — *editable anytime without review*
```
Short a player? Post a pickup game, set your slots, and let players claim the
open spots. Browse games near you, join with one tap, and chat with your group.
```

**Keywords** (≤100 chars, comma-separated, no spaces) — *93*
```
volleyball,pickup,beach,indoor,sports,games,players,roster,teams,matchmaking,league,scrimmage
```

**Description** (≤4000 chars) — *use the Google Play full description above; it works as-is for Apple.*

**Support URL:** https://coterie.com.de
**Marketing URL (optional):** https://coterie.com.de

---

## 4. Privacy answers — derived from your actual code

These match what the app really does (`server/repo.js`, `server/index.js`, the
`/privacy` page, Cloudinary uploads, Resend email, Sentry monitoring). Answer the
store forms exactly like this.

### Google Play — Data safety form

**Does your app collect or share user data?** Yes, collects. **Does NOT share** with
third parties (the services below are processors acting on your behalf, not data
sharing/selling).

| Data type | Collected | Purpose | Linked to user | Optional? |
|-----------|-----------|---------|----------------|-----------|
| Name | Yes | Account management, app functionality | Yes | Required |
| Email address | Yes | Account management, app functionality | Yes | Required |
| Photos | Yes | App functionality (highlights you upload) | Yes | Optional |
| Messages (in-game chat) | Yes | App functionality | Yes | Optional |
| Other user content (games, comments, ratings) | Yes | App functionality | Yes | Optional |
| App activity / in-app actions | Yes | App functionality | Yes | — |
| Crash logs & diagnostics | Yes | Monitoring & stability (via Sentry) | No | — |

- **Precise or approximate device location: NO.** "Home area" is free text the user
  types — the app never requests device GPS/location permission.
- **Advertising / no ad identifiers, no third-party ads, no tracking for ads.**
- **Is all data encrypted in transit?** **Yes** (HTTPS/TLS).
- **Can users request data deletion?** **Yes** — in-app (Settings → Delete account)
  and by emailing support. Deletion URL: https://coterie.com.de/settings

**Processors / service providers to mention if asked (not "sharing"):**
Railway/PostgreSQL (hosting + database), Cloudinary (image hosting), Resend
(transactional email), Google (optional "Sign in with Google"), Sentry (crash
monitoring).

### Apple — App Privacy ("nutrition labels")

**Data Used to Track You:** None.

| Apple category | Data | Purpose | Linked to identity |
|----------------|------|---------|--------------------|
| Contact Info | Name, Email Address | App Functionality | Yes |
| User Content | Photos or Videos; Other User Content (messages, posts) | App Functionality | Yes |
| Diagnostics | Crash Data, Performance Data | App Functionality / Analytics | No |

- No Identifiers collected for tracking; no Location; no advertising data.

---

## 5. Screenshots — shot list + exact sizes

You don't own a Mac, but you don't need one for screenshots — capture them from the
**live site in Chrome** (logged in as a demo account so the screens have real
content) and the same PNGs work for both stores.

### Required sizes
| Store | Size (px, portrait) | How many |
|-------|--------------------|----------|
| **Apple** iPhone 6.7"/6.9" | **1290 × 2796** | 2–10 (this one size covers App Store) |
| **Google Play** phone | **1080 × 2400** (or 1080 × 1920) | 2–8 |
| Google Play icon | 512 × 512 | already have `public/pwa-512x512.png` |
| Google Play feature graphic | 1024 × 500 | ✅ `store-assets/play-feature-graphic-1024x500.png` |

### The 6 shots to capture (in this order)
1. **Browse games feed** — the core "games near you" view
2. **Game detail with roster + Join button** — shows slots filling
3. **Create a game** — shows how easy hosting is
4. **Group chat** — coordination in one place
5. **Profile** — skill level + ratings/history
6. **Highlights** — community feel

### Easiest capture method (Chrome DevTools, no phone needed)
1. Open `https://coterie.com.de` in Chrome, log in as a demo account
   (`1@demo.test` / `111111`).
2. Press **F12** → click the **device toolbar** icon (or `Ctrl+Shift+M`).
3. Choose **"Responsive"** and set the size:
   - For **Apple (1290 × 2796):** set viewport **430 × 932**, DPR **3**.
   - For **Play (1080 × 2400):** set viewport **360 × 800**, DPR **3**.
4. Navigate to each screen above, then in the device-toolbar **⋮ menu → "Capture
   screenshot"** (this exports at full device resolution).
5. Save into `store-assets/screenshots/`.

> Or just take normal screenshots on your phone — modern phones already shoot at
> these resolutions, and real content looks best.

---

## 6. Status checklist

- [x] App name, IDs, category, URLs
- [x] Short + full descriptions (Play + Apple)
- [x] Keywords (Apple)
- [x] Privacy / Data-safety answers (both stores)
- [x] App icon 512 (`public/pwa-512x512.png`)
- [x] Feature graphic 1024×500 (`store-assets/`)
- [x] Privacy Policy URL live (`/privacy`)
- [ ] **Screenshots** — capture the 6 shots above (your step)
- [ ] Paid accounts: Google Play ($25 once) / Apple ($99/yr) — needed only to submit
```
