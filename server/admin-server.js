// Standalone admin service — separate Railway deploy from the consumer app
// (server/index.js). Same repo, same Postgres, deliberately separate:
//   - own connection pool cap (set DB_POOL_MAX on this service in Railway)
//   - own JWT secret/audience (server/adminAuth.js) — a leaked consumer token
//     can never authenticate here
//   - own rate limiter (adminApiLimiter) — can't be starved by consumer traffic
//     because it isn't the same process
//   - own Google OAuth callback — LOOKUP ONLY, never creates a user. Signing
//     in here with a non-admin Google account is refused, not silently
//     turned into a new account (unlike the consumer app's Google flow).
import express from "express";
import helmet from "helmet";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { helmetOptions } from "./security.js";
import { adminApiLimiter } from "./middleware/rateLimiters.js";
import { signAdminToken } from "./adminAuth.js";
import adminRoutes from "./adminRoutes.js";
import { findUserByEmail } from "./repo.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1);

app.use(helmet(helmetOptions));
app.use(express.json({ limit: "100kb" }));
app.use("/api", adminApiLimiter);

app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  const start = Date.now();
  res.on("finish", () => {
    console.log(`[admin-api] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

// --- Admin Google OAuth (lookup-only, never creates a user) ---------------
const oauthStates = new Map();
const oauthCleanup = setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of oauthStates) if (now > exp) oauthStates.delete(k);
}, 60_000);
if (typeof oauthCleanup.unref === "function") oauthCleanup.unref();

app.get("/api/auth/google", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(503).json({ error: "Google login is not configured." });

  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  const state = crypto.randomBytes(16).toString("hex");
  oauthStates.set(state, Date.now() + 10 * 60 * 1000);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code, error, state } = req.query;
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;

  if (!state || !oauthStates.has(state) || Date.now() > oauthStates.get(state)) {
    oauthStates.delete(state);
    return res.redirect(`${appUrl}/?error=google_cancelled`);
  }
  oauthStates.delete(state);
  if (error || !code) return res.redirect(`${appUrl}/?error=google_cancelled`);

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${appUrl}/api/auth/google/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.redirect(`${appUrl}/?error=google_failed`);

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser = await userRes.json();
    if (!googleUser.email) return res.redirect(`${appUrl}/?error=google_failed`);

    // Lookup only — an admin account must already exist with this email.
    // Signing in with Google never creates a new user from this service.
    const user = await findUserByEmail(googleUser.email);
    if (!user || (user.role || "user") !== "admin") {
      return res.redirect(`${appUrl}/?error=not_admin`);
    }
    if (user.suspended) return res.redirect(`${appUrl}/?error=suspended`);

    res.redirect(`${appUrl}/?token=${signAdminToken(user.id, user.token_version)}`);
  } catch (err) {
    console.error("[admin-api] google callback failed:", err);
    res.redirect(`${appUrl}/?error=google_failed`);
  }
});

app.use("/api/admin", adminRoutes);

// --- Serve the built admin frontend in production --------------------------
const distDir = path.join(__dirname, "..", "dist-admin");
if (fs.existsSync(path.join(distDir, "admin.html"))) {
  app.use(express.static(distDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distDir, "admin.html"));
  });
}

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[admin-api] unhandled error:", err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

const PORT = process.env.PORT || 4100;

async function start() {
  // No initSchema()/seed — the consumer service (server/index.js) already
  // owns schema migrations. This service only ever reads/writes an
  // already-initialized database.
  app.listen(PORT, () => {
    console.log(`[admin-api] Coterie Admin listening on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== "test") {
  start().catch((err) => {
    console.error("[admin-api] failed to start:", err);
    process.exit(1);
  });
}

export { app };
