# Deploying SetMatch (GitHub + Railway)

This puts your app online at a public link you can share. You'll do the clicking
in the browser; I'll give you the exact commands and values to paste.

There are three accounts, all free to start: **GitHub** (code + backup),
**Railway** (runs the app + database). You already have/are making GitHub.

---

## Part 1 — Put the code on GitHub

1. Go to <https://github.com> and sign in (or sign up).
2. Click the **+** (top-right) → **New repository**.
   - **Repository name:** `setmatch` (or anything)
   - **Private** is fine (only you need it).
   - **Do NOT** check "Add a README" / .gitignore / license — the project
     already has them.
   - Click **Create repository**.
3. GitHub shows a page with commands. Ignore them — use **these** instead.
   In the project folder, run (in PowerShell), replacing `YOUR-USERNAME`:

   ```powershell
   cd "C:\Users\ebonwhale\OneDrive\Documents\Volleyball-Claude"
   git remote add origin https://github.com/YOUR-USERNAME/setmatch.git
   git push -u origin main
   ```

   The first push opens a browser window to log in to GitHub — approve it.
   When it finishes, refresh the GitHub page; your code is there. ✅

> Tell me once this is done and I can help with any hiccup.

---

## Part 2 — Create the database + app on Railway

1. Go to <https://railway.app> → **Login** → **"Login with GitHub"** (easiest).
2. Click **New Project** → **Deploy from GitHub repo** → pick your `setmatch`
   repo. (You may need to click "Configure GitHub App" once to grant access.)
3. Railway starts building. It will likely succeed at building but the app
   won't work yet — it needs a database and secrets. That's the next steps.

### Add the database
4. In your project, click **+ New** (or **Create**) → **Database** →
   **Add PostgreSQL**. Railway creates a Postgres service next to your app.

### Add the settings (environment variables)
5. Click your **app service** (not the database) → **Variables** tab → add
   these three (use **New Variable** / **Raw Editor**):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` *(type it exactly — Railway links it to the database)* |
   | `JWT_SECRET` | `Ln_0qPbf1inrdeNw2Kb1g0RnGGBmQmBL5JygWigeLXMPdX0Sl7L7LN4CMVLf2xc3` |
   | `DATABASE_SSL` | `false` |

   (`PORT` is set automatically by Railway — don't add it.)

6. Railway redeploys automatically after you save variables. Wait for the
   deploy to go green.

### Get your public link
7. Click the app service → **Settings** tab → **Networking** →
   **Generate Domain**. Railway gives you a URL like
   `https://setmatch-production.up.railway.app`.
8. Open that URL — your app is live! It seeds the demo games on first run, and
   you (and your family) can sign up and post real games.

---

## Updating the app later

Whenever we change the code, you just push and Railway auto-deploys:

```powershell
git add -A
git commit -m "describe the change"
git push
```

Railway sees the push and redeploys in ~1–2 minutes.

---

## Notes
- The `JWT_SECRET` above is a one-time random value generated for your
  deployment. Keep it private (it's what keeps logins secure). It's already in
  this file, which is private to your repo — that's fine.
- Your **local** app (the `Start SetMatch.bat` workflow) still uses your **local**
  Postgres and is completely separate from the live one — experiment freely.
- Free Railway has trial credits; after that it's a few dollars/month for
  always-on. See the chat for the scaling plan to all of Singapore.
