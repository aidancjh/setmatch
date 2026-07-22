// Vybe API server — Express + PostgreSQL.
// Local dev:  node --env-file=.env server/index.js   (see package.json scripts)
// Production: node server/index.js                    (host provides env vars)
import * as Sentry from "@sentry/node";

// DSN comes from the SENTRY_DSN env var. When unset (e.g. local dev), Sentry
// silently disables itself — start() logs a warning so it's visible in the logs.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "production",
});

import express from "express";
import cors from "cors";
import helmet from "helmet";
import {
  loginLimiter,
  signupLimiter,
  authLimiter,
  apiLimiter,
  contentLimiter,
  waitlistLimiter,
} from "./middleware/rateLimiters.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { hashPassword, verifyPassword, signToken, requireAuth, optionalAuth, verifyToken, TIMING_HASH } from "./auth.js";
import * as repo from "./repo.js";
import { initSchema, query } from "./db.js";
import { seedIfEmpty, syncDemoPasswords, seedPastData } from "./seed.js";
import {
  validateBody,
  signupSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  gameInputSchema,
  profileUpdateSchema,
  isCloudinaryUrl,
  SKILLS,
  TYPES,
  GENDERS,
  NET_HEIGHTS,
  POSITIONS,
  ROTATION_TYPES,
  REGIONS,
} from "./validation.js";
import { MAIL_FROM, esc, prettyTime, calDate, sendPasswordResetEmail, sendJoinConfirmationEmail } from "./email.js";
import { h } from "./lib/asyncHandler.js";
import { helmetOptions } from "./security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Trust exactly ONE proxy hop (Railway's edge). Do NOT use `true` here: that
// trusts the whole X-Forwarded-For chain, letting a client spoof their IP and
// completely bypass every express-rate-limit limiter below. With `1`, req.ip is
// the real client IP set by Railway's proxy, which clients can't forge.
app.set("trust proxy", 1);

// --- Security headers (helmet) --------------------------------------------
// Content-Security-Policy is relaxed enough for Cloudinary uploads + Sentry.
app.use(helmet(helmetOptions));

// --- CORS (lock to the app's own origin in production) --------------------
const appOrigin = process.env.APP_URL || null;
// Railway auto-sets RAILWAY_PUBLIC_DOMAIN (e.g. "xxx.up.railway.app"). Allow that
// origin too, so requests from the Railway URL aren't rejected when APP_URL points
// at a custom domain (or has a trailing-slash / scheme mismatch).
const railwayOrigin = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : null;
app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin requests (origin is undefined for same-origin / server-to-server)
      if (!origin) return callback(null, true);
      // In development allow any localhost
      if (!appOrigin || origin.startsWith("http://localhost")) return callback(null, true);
      // In production only allow our own domain(s)
      const normalizedApp = appOrigin.replace(/\/$/, "");
      if (origin === appOrigin || origin === normalizedApp || origin === railwayOrigin)
        return callback(null, true);
      // Reject gracefully: omit CORS headers (the browser blocks cross-origin reads)
      // rather than throwing. A thrown error becomes a 500 "Something went wrong on
      // the server" that hits every POST from a mismatched origin (incl. logins) and
      // spams Sentry. Safe here because auth uses Bearer tokens, not cookies.
      console.warn(`[cors] origin not allowed: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "100kb" })); // prevent giant JSON payloads

// --- Rate limiters --------------------------------------------------------
// All rate limiter definitions have been extracted to middleware/rateLimiters.js
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/signup", signupLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api", apiLimiter);

const PORT = process.env.PORT || 4000;

// Concise request logging for API calls (method, path, status, duration).
app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  const start = Date.now();
  res.on("finish", () => {
    console.log(
      `[api] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`
    );
  });
  next();
});

// Maintenance mode: when the flag is on, block normal /api traffic with a 503
// so the frontend can show a maintenance screen. Auth, config, admin routes,
// and admins themselves stay open so an admin can sign in and turn it back off.
app.use("/api", async (req, res, next) => {
  try {
    const p = req.path; // mount-relative, e.g. "/games", "/config"
    if (p === "/config" || p.startsWith("/auth") || p.startsWith("/admin")) return next();
    if (!(await repo.getFlag("maintenance_mode"))) return next();
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    const userId = token ? verifyToken(token) : null;
    if (userId && (await repo.getRole(userId)) === "admin") return next();
    return res
      .status(503)
      .json({ error: "Vybe is down for maintenance. We'll be back shortly.", maintenance: true });
  } catch {
    next(); // never let the gate take the whole API down
  }
});

// Public app config — flags the client needs (no auth required).
app.get("/api/config", async (_req, res) => {
  try {
    const flags = await repo.getFlags();
    res.json({
      maintenanceMode: flags.maintenance_mode === true,
      signupsEnabled: flags.signups_enabled !== false,
    });
  } catch {
    res.json({ maintenanceMode: false, signupsEnabled: true });
  }
});

// Build identifier so we can tell exactly which commit is live. Railway sets
// RAILWAY_GIT_COMMIT_SHA automatically on every deploy; falls back to "dev".
const BUILD_SHA = (process.env.RAILWAY_GIT_COMMIT_SHA || "dev").slice(0, 7);

// Health check for uptime monitors — verifies the DB is reachable. Also returns
// the running build's commit so a deploy can be confirmed live from outside.
app.get("/healthz", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.json({ status: "ok", version: BUILD_SHA });
  } catch (err) {
    console.error("[health] db check failed:", err);
    res.status(503).json({ status: "db_unavailable", version: BUILD_SHA });
  }
});

// --- Shared validation helpers --------------------------------------------
// isCloudinaryUrl, SKILLS/TYPES/GENDERS/etc. now live in ./validation.js
// (imported above) so the zod schemas and this module share one source of truth.

/** Basic but real email format check, length-capped (RFC max 254). */
function isValidEmail(email) {
  const s = String(email || "").trim();
  return s.length > 0 && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Minimum password length (signup + reset). Raised from 6 → 10 for launch.
const PASSWORD_MIN = 10;

// Thin wrapper over gameInputSchema (validation.js) kept for the direct-call
// test suite and any non-HTTP callers; the routes below use validateBody(
// gameInputSchema) as middleware instead of calling this directly.
function validGameInput(b) {
  if (!b || typeof b !== "object") return "Invalid request body.";
  const result = gameInputSchema.safeParse(b);
  if (result.success) return null;
  return result.error.issues[0]?.message || "Invalid request body.";
}

function gameInputFrom(body) {
  const rawPositions = Array.isArray(body.positionsNeeded) ? body.positionsNeeded : [];
  return {
    title: String(body.title).trim(),
    type: body.type,
    skill: body.skill,
    gender: GENDERS.includes(body.gender) ? body.gender : "Open",
    netHeight: NET_HEIGHTS.includes(body.netHeight) ? body.netHeight : "Venue Standard",
    positionsNeeded: rawPositions.filter((p) => POSITIONS.includes(p)),
    rotationType: ROTATION_TYPES.includes(body.rotationType) ? body.rotationType : "Standard",
    costPerPerson: Math.max(0, Math.min(Number(body.costPerPerson) || 0, 100000)),
    region: REGIONS.includes(body.region) ? body.region : "",
    date: body.date,
    time: body.time,
    endTime: body.endTime ? String(body.endTime) : "",
    location: String(body.location).trim(),
    area: String(body.area || body.location).trim().slice(0, 150),
    totalSlots: Number(body.totalSlots),
    preFilled: Math.max(0, Math.min(Number(body.preFilled) || 0, Number(body.totalSlots) - 1)),
    notes: String(body.notes || "").trim().slice(0, 2000),
  };
}

// --- Auth routes ----------------------------------------------------------

app.post(
  "/api/auth/signup",
  validateBody(signupSchema),
  h(async (req, res) => {
    // Input shape/limits are enforced by signupSchema (validateBody) above; the
    // handler only does checks that need the database.
    const { email, password, name } = req.body || {};
    if (!(await repo.getFlag("signups_enabled")))
      return res.status(403).json({ error: "New sign-ups are temporarily closed." });

    if (await repo.findUserByEmail(email))
      return res
        .status(409)
        .json({ error: "An account with that email already exists." });

    const user = await repo.createUser({
      email,
      passwordHash: hashPassword(password),
      name: String(name).trim(),
    });
    res.status(201).json({ token: signToken(user.id, user.token_version), user: repo.publicUser(user) });
  })
);

app.post(
  "/api/auth/login",
  h(async (req, res) => {
    const { email, password } = req.body || {};
    const user = email ? await repo.findUserByEmail(email) : null;
    // Always run bcrypt (against real hash or dummy) to prevent timing attacks
    // that could reveal which emails are registered.
    const passwordOk = verifyPassword(password || "", user ? user.password_hash : TIMING_HASH);
    if (!user || !passwordOk)
      return res.status(401).json({ error: "Incorrect email or password." });
    if (user.suspended)
      return res.status(403).json({ error: "This account has been suspended." });
    res.json({ token: signToken(user.id, user.token_version), user: repo.publicUser(user) });
  })
);

app.get(
  "/api/auth/me",
  requireAuth,
  h(async (req, res) => {
    const user = await repo.findUserById(req.userId);
    if (!user) return res.status(401).json({ error: "Account not found." });
    if (user.suspended)
      return res.status(403).json({ error: "This account has been suspended." });
    const playerRating = await repo.getPlayerRating(req.userId);
    res.json({ user: { ...repo.publicUser(user), playerRating } });
  })
);

app.delete(
  "/api/auth/me",
  requireAuth,
  h(async (req, res) => {
    const user = await repo.findUserById(req.userId);
    if (!user) return res.status(401).json({ error: "Account not found." });
    // Password accounts must re-enter their password to confirm deletion.
    // OAuth-only accounts (no password set) rely on the explicit client confirm.
    if (user.password_hash) {
      const { password } = req.body || {};
      if (!password || !verifyPassword(String(password), user.password_hash))
        return res.status(403).json({ error: "Incorrect password." });
    }
    await repo.deleteAccount(req.userId);
    res.status(204).end();
  })
);

app.patch(
  "/api/auth/me",
  requireAuth,
  validateBody(profileUpdateSchema),
  h(async (req, res) => {
    const { name, skill, homeArea, bio, avatarUrl, birthdate, userGender, showAge, showGender, favoritePositions, bannerColor, bannerImage } = req.body || {};
    const user = await repo.updateUser(req.userId, {
      name: name != null ? String(name).trim() || undefined : undefined,
      skill,
      homeArea,
      bio: bio != null ? String(bio).trim().slice(0, 300) : undefined,
      avatarUrl: avatarUrl != null ? String(avatarUrl) : undefined,
      birthdate: birthdate !== undefined ? (birthdate ? String(birthdate) : null) : undefined,
      userGender: userGender !== undefined ? String(userGender) : undefined,
      showAge: showAge !== undefined ? Boolean(showAge) : undefined,
      showGender: showGender !== undefined ? Boolean(showGender) : undefined,
      favoritePositions: Array.isArray(favoritePositions)
        ? favoritePositions.filter((p) => POSITIONS.includes(p))
        : undefined,
      bannerColor: bannerColor !== undefined ? String(bannerColor) : undefined,
      bannerImage: bannerImage !== undefined ? String(bannerImage) : undefined,
    });
    res.json({ user: repo.publicUser(user) });
  })
);

// --- Password reset -------------------------------------------------------

app.post(
  "/api/auth/forgot-password",
  validateBody(forgotPasswordSchema),
  h(async (req, res) => {
    const { email } = req.body || {};
    const user = await repo.findUserByEmail(email);
    // Always return OK — never reveal whether an email exists.
    if (!user) return res.json({ ok: true });

    const token = await repo.createPasswordResetToken(user.id);
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const resetLink = `${appUrl}/auth?reset=${token}`;

    await sendPasswordResetEmail(user, resetLink);

    res.json({ ok: true });
  })
);

app.post(
  "/api/auth/reset-password",
  validateBody(resetPasswordSchema),
  h(async (req, res) => {
    const { token, password } = req.body || {};
    const record = await repo.verifyPasswordResetToken(token);
    if (!record)
      return res.status(400).json({ error: "This reset link has expired or already been used." });

    await repo.updateUserPassword(record.user_id, hashPassword(password));
    await repo.consumePasswordResetToken(token);

    const user = await repo.findUserById(record.user_id);
    res.json({ token: signToken(user.id, user.token_version), user: repo.publicUser(user) });
  })
);

// --- Google OAuth ----------------------------------------------------------

// In-memory store for OAuth state tokens (TTL 10 min; cleared on use or expiry).
// Fine for a single-process server. If you ever run multiple replicas, move
// this to Redis or Postgres.
const oauthStates = new Map(); // state -> expiry timestamp
const oauthCleanup = setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of oauthStates) if (now > exp) oauthStates.delete(k);
}, 60_000);
// Don't let this timer keep the process alive (matters for tests / CLI imports).
if (typeof oauthCleanup.unref === "function") oauthCleanup.unref();

app.get("/api/auth/google", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId)
    return res.status(503).json({ error: "Google login is not configured." });

  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  const state = crypto.randomBytes(16).toString("hex");
  oauthStates.set(state, Date.now() + 10 * 60 * 1000); // expires in 10 min
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

app.get(
  "/api/auth/google/callback",
  h(async (req, res) => {
    const { code, error, state } = req.query;
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;

    // Validate CSRF state token before doing anything with the code.
    if (!state || !oauthStates.has(state) || Date.now() > oauthStates.get(state)) {
      oauthStates.delete(state);
      return res.redirect(`${appUrl}/auth?error=google_cancelled`);
    }
    oauthStates.delete(state); // one-time use

    if (error || !code)
      return res.redirect(`${appUrl}/auth?error=google_cancelled`);

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
    if (!tokenData.access_token)
      return res.redirect(`${appUrl}/auth?error=google_failed`);

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser = await userRes.json();
    if (!googleUser.email)
      return res.redirect(`${appUrl}/auth?error=google_failed`);

    if (!(await repo.getFlag("signups_enabled"))) {
      const existing = await repo.findUserByEmail(googleUser.email);
      if (!existing) return res.redirect(`${appUrl}/auth?error=signups_closed`);
    }
    const user = await repo.findOrCreateGoogleUser(
      googleUser.id,
      googleUser.email,
      googleUser.name || googleUser.email.split("@")[0]
    );
    if (user.suspended)
      return res.redirect(`${appUrl}/auth?error=suspended`);
    res.redirect(`${appUrl}/auth?token=${signToken(user.id, user.token_version)}`);
  })
);

// --- Cloudinary uploads (signed) ------------------------------------------
// Signed uploads replace the old unsigned upload_preset flow: the preset's
// name lives in the client bundle, so anyone could extract it and upload
// arbitrary files to this Cloudinary account directly, bypassing the app
// entirely (storage/bandwidth cost abuse). A signature is single-request and
// requires CLOUDINARY_API_SECRET, which never leaves the server — only an
// authenticated user can obtain one, and each is scoped to one timestamp.

app.post(
  "/api/uploads/sign",
  requireAuth,
  h(async (req, res) => {
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!apiKey || !apiSecret)
      return res.status(503).json({ error: "Uploads are not configured." });

    const timestamp = Math.floor(Date.now() / 1000);
    // Cloudinary's signing algorithm: sign every upload parameter EXCEPT
    // file/cloud_name/resource_type/api_key, sorted alphabetically as
    // "key=value&key2=value2", with the api_secret appended (no separator),
    // then SHA-1 hex digest. `timestamp` is the only parameter we send.
    const signature = crypto
      .createHash("sha1")
      .update(`timestamp=${timestamp}${apiSecret}`)
      .digest("hex");

    res.json({ signature, timestamp, apiKey });
  })
);

// --- Email debug (authenticated) -----------------------------------------

app.get(
  "/api/debug/email-test",
  requireAuth,
  h(async (req, res) => {
    const user = await repo.findUserById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if ((user.role || "user") !== "admin")
      return res.status(403).json({ error: "Admin access required." });

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return res.json({ ok: false, stage: "no_key", error: "RESEND_API_KEY is not set in Railway Variables." });
    }

    let r, body;
    try {
      r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: MAIL_FROM,
          to: [user.email],
          subject: "Vybe — email test",
          html: "<p>If you see this, email delivery is working!</p>",
        }),
      });
      body = await r.text();
    } catch (e) {
      return res.json({ ok: false, stage: "network", error: String(e) });
    }

    return res.json({
      ok: r.ok,
      stage: r.ok ? "sent" : "resend_error",
      status: r.status,
      to: user.email,
      resend_response: body,
    });
  })
);

// --- Game routes ----------------------------------------------------------

app.get(
  "/api/games",
  h(async (_req, res) => {
    res.json(await repo.listGames());
  })
);

app.get(
  "/api/games/:id",
  h(async (req, res) => {
    const game = await repo.getGame(req.params.id);
    if (!game) return res.status(404).json({ error: "Game not found." });
    res.json(game);
  })
);

// Downloadable calendar event (.ics) for a game — public, like the game page.
app.get(
  "/api/games/:id/ics",
  h(async (req, res) => {
    const game = await repo.getGame(req.params.id);
    if (!game) return res.status(404).json({ error: "Game not found." });
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const safeName = String(game.title).replace(/[^a-z0-9]+/gi, "-").slice(0, 40) || "game";
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.ics"`);
    res.send(buildICS(game, appUrl));
  })
);

app.post(
  "/api/games",
  requireAuth,
  validateBody(gameInputSchema),
  h(async (req, res) => {
    // Idempotency: a retried request with the same key returns the first result
    // instead of creating duplicate games.
    const idemKey = req.get("Idempotency-Key");
    if (idemKey && idemKey.length > 128)
      return res.status(400).json({ error: "Idempotency-Key must be 128 characters or fewer." });
    const existing = await repo.getIdempotentGame(idemKey);
    if (existing) return res.status(201).json(existing);

    const input = gameInputFrom(req.body);
    // Recurring: create N weekly occurrences (capped). Return the first one.
    // A shared series_id links them so the host can cancel all future ones.
    const repeat = Math.min(Math.max(Number(req.body.repeat) || 1, 1), 12);
    const seriesId = repeat > 1 ? `series_${crypto.randomBytes(8).toString("hex")}` : null;
    let first = null;
    for (let i = 0; i < repeat; i++) {
      const game = await repo.createGame(req.userId, {
        ...input,
        date: addWeeksISO(input.date, i),
        seriesId,
      });
      if (i === 0) first = game;
    }
    if (idemKey && first) await repo.saveIdempotentKey(idemKey, first.id);
    res.status(201).json(first);
  })
);

function addWeeksISO(iso, weeks) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + weeks * 7));
  return date.toISOString().slice(0, 10);
}

app.patch(
  "/api/games/:id",
  requireAuth,
  validateBody(gameInputSchema),
  h(async (req, res) => {
    const result = await repo.updateGame(
      req.params.id,
      req.userId,
      gameInputFrom(req.body)
    );
    if (result.ok) return res.json(result.game);
    res.status(result.code).json({ error: result.error });
  })
);

app.post(
  "/api/games/:id/join",
  requireAuth,
  h(async (req, res) => {
    const existing = await repo.getGame(req.params.id);
    if (!existing) return res.status(404).json({ error: "Game not found." });
    // Can't join a game whose date has already passed (ISO date string compare).
    if (existing.date < new Date().toISOString().slice(0, 10))
      return res.status(400).json({ error: "This game has already taken place." });

    const game = await repo.joinGame(req.params.id, req.userId);
    if (!game) return res.status(404).json({ error: "Game not found." });

    // Fire-and-forget: send confirmation email when user gets a confirmed spot.
    const user = await repo.findUserById(req.userId);
    const isPlayer = game.players.some((p) => p.id === req.userId);
    if (user && isPlayer && !user.email.endsWith("@demo.test")) {
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const calLink = buildGCalUrl(game, appUrl);
      sendJoinConfirmationEmail({ user, game, appUrl, calLink });
    }

    res.json(game);
  })
);

app.post(
  "/api/games/:id/leave",
  requireAuth,
  h(async (req, res) => {
    const game = await repo.leaveGame(req.params.id, req.userId);
    if (!game) return res.status(404).json({ error: "Game not found." });
    res.json(game);
  })
);

app.post(
  "/api/games/:id/interested",
  requireAuth,
  h(async (req, res) => {
    const game = await repo.toggleInterest(req.params.id, req.userId);
    if (!game) return res.status(404).json({ error: "Game not found." });
    res.json(game);
  })
);

app.delete(
  "/api/games/:id",
  requireAuth,
  h(async (req, res) => {
    const result = await repo.deleteGame(req.params.id, req.userId);
    if (result.ok) return res.status(204).end();
    if (result.code === 404)
      return res.status(404).json({ error: "Game not found." });
    res.status(403).json({ error: "Only the host can delete this game." });
  })
);

// Cancel this and all later occurrences of a recurring series (host only).
app.post(
  "/api/games/:id/cancel-series",
  requireAuth,
  h(async (req, res) => {
    const game = await repo.getGame(req.params.id);
    if (!game) return res.status(404).json({ error: "Game not found." });
    if (game.hostId !== req.userId)
      return res.status(403).json({ error: "Only the host can cancel this series." });
    if (!game.seriesId)
      return res.status(400).json({ error: "This game isn't part of a series." });
    const result = await repo.cancelSeries(game.seriesId, req.userId, game.date);
    if (!result.ok) return res.status(result.code).json({ error: result.error });
    res.json({ ok: true, count: result.count });
  })
);

// --- Player ratings -------------------------------------------------------

app.get(
  "/api/games/:id/ratables",
  requireAuth,
  h(async (req, res) => {
    const ratables = await repo.getRatables(req.params.id, req.userId);
    if (ratables === null) return res.status(404).json({ error: "Game not found." });
    res.json(ratables);
  })
);

app.post(
  "/api/games/:id/rate/:playerId",
  requireAuth,
  h(async (req, res) => {
    const { rating } = req.body || {};
    const result = await repo.ratePlayer(
      req.params.id,
      req.userId,
      req.params.playerId,
      Number(rating)
    );
    if (result.ok) return res.status(201).json({ ok: true });
    res.status(result.code).json({ error: result.error });
  })
);

// --- Notifications --------------------------------------------------------

app.get(
  "/api/notifications",
  requireAuth,
  h(async (req, res) => {
    const [items, unread] = await Promise.all([
      repo.listNotifications(req.userId),
      repo.unreadCount(req.userId),
    ]);
    res.json({ items, unreadCount: unread });
  })
);

app.post(
  "/api/notifications/read-all",
  requireAuth,
  h(async (req, res) => {
    await repo.markAllRead(req.userId);
    res.status(204).end();
  })
);

app.post(
  "/api/notifications/:id/read",
  requireAuth,
  h(async (req, res) => {
    const unreadCount = await repo.markNotificationRead(req.userId, req.params.id);
    res.json({ ok: true, unreadCount });
  })
);

// --- Comments -------------------------------------------------------------

app.get(
  "/api/games/:id/comments",
  optionalAuth,
  h(async (req, res) => {
    res.json(await repo.listComments(req.params.id, req.userId || null));
  })
);

app.post(
  "/api/games/:id/comments",
  requireAuth,
  contentLimiter,
  h(async (req, res) => {
    const body = String((req.body && req.body.body) || "").trim();
    if (!body) return res.status(400).json({ error: "Comment can't be empty." });
    if (body.length > 1000)
      return res.status(400).json({ error: "Comment is too long (max 1000 characters)." });
    const result = await repo.addComment(req.params.id, req.userId, body);
    if (result.ok) return res.status(201).json(result.comments);
    res.status(result.code).json({ error: result.error });
  })
);

app.delete(
  "/api/games/:id/comments/:commentId",
  requireAuth,
  h(async (req, res) => {
    const result = await repo.deleteComment(
      req.params.id,
      req.params.commentId,
      req.userId
    );
    if (result.ok) return res.json(result.comments);
    res.status(result.code).json({ error: result.error });
  })
);

// --- Chat (members-only group messages per game) --------------------------

app.get(
  "/api/chats",
  requireAuth,
  h(async (req, res) => {
    res.json(await repo.listChatsForUser(req.userId));
  })
);

app.get(
  "/api/games/:id/messages",
  requireAuth,
  h(async (req, res) => {
    if (!(await repo.canAccessChat(req.params.id, req.userId)))
      return res
        .status(403)
        .json({ error: "Only players in this game can see the chat." });
    res.json(await repo.listMessages(req.params.id));
  })
);

app.post(
  "/api/games/:id/messages",
  requireAuth,
  contentLimiter,
  h(async (req, res) => {
    if (!(await repo.canAccessChat(req.params.id, req.userId)))
      return res
        .status(403)
        .json({ error: "Only players in this game can post in the chat." });
    const body = String((req.body && req.body.body) || "").trim();
    if (!body) return res.status(400).json({ error: "Message can't be empty." });
    if (body.length > 1000)
      return res
        .status(400)
        .json({ error: "Message is too long (max 1000 characters)." });
    const msg = await repo.addMessage(req.params.id, req.userId, body);
    res.status(201).json(msg);
  })
);

app.delete(
  "/api/games/:id/messages/:messageId",
  requireAuth,
  h(async (req, res) => {
    const result = await repo.deleteMessage(
      req.params.id,
      req.params.messageId,
      req.userId
    );
    if (result.ok) return res.status(204).end();
    res.status(result.code).json({ error: result.error });
  })
);

// --- Cost splitting -------------------------------------------------------

// Host roster management. Kicking players was removed (2026-07-22): hosts can
// promote waitlisters into the game, but can no longer remove anyone.
app.post(
  "/api/games/:id/members/:memberId/promote",
  requireAuth,
  h(async (req, res) => {
    const result = await repo.promoteMember(req.params.id, req.userId, req.params.memberId);
    if (result.ok) return res.json(result.game);
    res.status(result.code).json({ error: result.error });
  })
);

app.post(
  "/api/games/:id/members/:memberId/paid",
  requireAuth,
  h(async (req, res) => {
    const paid = !!(req.body && req.body.paid);
    const result = await repo.setMemberPaid(
      req.params.id,
      req.userId,
      req.params.memberId,
      paid
    );
    if (result.ok) return res.json(result.game);
    res.status(result.code).json({ error: result.error });
  })
);

// --- Reports (users flag content; admins review) ---------------------------

app.post(
  "/api/reports",
  requireAuth,
  contentLimiter,
  h(async (req, res) => {
    const { targetType, targetId, reason } = req.body || {};
    const result = await repo.createReport(req.userId, targetType, targetId, reason);
    if (!result.ok) return res.status(result.code || 400).json({ error: result.error });
    res.status(201).json({ ok: true });
  })
);

// --- User profiles --------------------------------------------------------

app.get(
  "/api/users/:id/profile",
  requireAuth,
  h(async (req, res) => {
    const profile = await repo.getUserProfile(req.params.id);
    if (!profile) return res.status(404).json({ error: "Player not found." });
    const blocked = await repo.isBlocked(req.userId, req.params.id);
    res.json({ ...profile, blocked });
  })
);

// --- User blocking --------------------------------------------------------

app.get(
  "/api/blocks",
  requireAuth,
  h(async (req, res) => res.json(await repo.listBlocked(req.userId)))
);

app.post(
  "/api/users/:id/block",
  requireAuth,
  h(async (req, res) => {
    const result = await repo.blockUser(req.userId, req.params.id);
    if (result.ok) return res.status(201).json({ ok: true });
    res.status(result.code).json({ error: result.error });
  })
);

app.delete(
  "/api/users/:id/block",
  requireAuth,
  h(async (req, res) => {
    await repo.unblockUser(req.userId, req.params.id);
    res.status(204).end();
  })
);

// --- Reviews --------------------------------------------------------------

app.get(
  "/api/reviews/pending",
  requireAuth,
  h(async (req, res) => {
    res.json(await repo.pendingReviews(req.userId));
  })
);

app.post(
  "/api/reviews",
  requireAuth,
  h(async (req, res) => {
    const { gameId, rating, comment } = req.body || {};
    if (!gameId) return res.status(400).json({ error: "gameId is required." });
    if (comment && String(comment).length > 500)
      return res.status(400).json({ error: "Review comment must be 500 characters or fewer." });
    const result = await repo.createReview(gameId, req.userId, {
      rating: Number(rating),
      comment,
    });
    if (result.ok) return res.status(201).json({ ok: true });
    res.status(result.code).json({ error: result.error });
  })
);

app.get(
  "/api/games/:id/reviews",
  h(async (req, res) => {
    res.json(await repo.getGameReviews(req.params.id));
  })
);

app.get(
  "/api/users/:id/rating",
  h(async (req, res) => {
    res.json(await repo.getHostRating(req.params.id));
  })
);

// --- Feedback -------------------------------------------------------------

app.post(
  "/api/feedback",
  requireAuth,
  h(async (req, res) => {
    const { type, subject, body } = req.body || {};
    if (!body || !String(body).trim()) return res.status(400).json({ error: "Message is required." });
    if (!["feedback", "bug", "other"].includes(type))
      return res.status(400).json({ error: "Invalid type." });
    await repo.createFeedback(req.userId, {
      type: String(type),
      subject: String(subject || "").trim().slice(0, 200),
      body: String(body).trim().slice(0, 2000),
    });
    res.status(201).json({ ok: true });
  })
);

// --- Highlights -----------------------------------------------------------

app.get(
  "/api/highlights",
  optionalAuth,
  h(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Math.min(Math.max(Number(req.query.offset) || 0, 0), 10000);
    res.json(await repo.listHighlights(limit, offset, req.userId || null));
  })
);

app.post(
  "/api/highlights",
  requireAuth,
  h(async (req, res) => {
    const { caption, videoUrl, thumbUrl, mediaType } = req.body || {};
    if (!videoUrl || typeof videoUrl !== "string")
      return res.status(400).json({ error: "Media URL is required." });
    if (!isCloudinaryUrl(videoUrl))
      return res.status(400).json({ error: "Media must be uploaded via Cloudinary." });
    if (thumbUrl && !isCloudinaryUrl(String(thumbUrl)))
      return res.status(400).json({ error: "Thumbnail must be a valid Cloudinary URL." });
    if (caption && String(caption).length > 300)
      return res.status(400).json({ error: "Caption too long (max 300 characters)." });
    const hl = await repo.createHighlight(req.userId, {
      caption: String(caption || "").trim(),
      videoUrl: String(videoUrl),
      thumbUrl: String(thumbUrl || ""),
      mediaType: mediaType === "photo" ? "photo" : "video",
    });
    res.status(201).json(hl);
  })
);

app.delete(
  "/api/highlights/:id",
  requireAuth,
  h(async (req, res) => {
    const result = await repo.deleteHighlight(req.params.id, req.userId);
    if (result.ok) return res.status(204).end();
    res.status(result.code).json({ error: result.error });
  })
);

app.post(
  "/api/highlights/:id/like",
  requireAuth,
  h(async (req, res) => {
    const hl = await repo.toggleHighlightLike(req.params.id, req.userId);
    if (!hl) return res.status(404).json({ error: "Highlight not found." });
    res.json(hl);
  })
);

app.get(
  "/api/users/:id/highlights",
  requireAuth,
  h(async (req, res) => {
    res.json(await repo.getUserHighlights(req.params.id));
  })
);

// --- Highlight comments (anyone can comment) ------------------------------

app.get(
  "/api/highlights/:id/comments",
  requireAuth,
  h(async (req, res) => {
    res.json(await repo.listHighlightComments(req.params.id, req.userId));
  })
);

app.post(
  "/api/highlights/:id/comments",
  requireAuth,
  contentLimiter,
  h(async (req, res) => {
    const body = String((req.body || {}).body || "").trim();
    if (!body) return res.status(400).json({ error: "Comment can't be empty." });
    if (body.length > 500)
      return res.status(400).json({ error: "Comment too long (max 500 characters)." });
    const result = await repo.addHighlightComment(req.params.id, req.userId, body);
    if (!result.ok) return res.status(result.code).json({ error: result.error });
    res.status(201).json(result.comments);
  })
);

app.delete(
  "/api/highlights/:id/comments/:commentId",
  requireAuth,
  h(async (req, res) => {
    const result = await repo.deleteHighlightComment(
      req.params.id,
      req.params.commentId,
      req.userId
    );
    if (!result.ok) return res.status(result.code).json({ error: result.error });
    res.json(result.comments);
  })
);

// --- Google Calendar URL builder ------------------------------------------

/** Build a downloadable .ics calendar event for a game (floating local time). */
function buildICS(game, appUrl) {
  const [y, m, d] = game.date.split("-").map(Number);
  const [sh, sm] = game.time.split(":").map(Number);
  const p = (n) => String(n).padStart(2, "0");
  const fmt = (h, min) => `${y}${p(m)}${p(d)}T${p(h)}${p(min)}00`;
  const start = fmt(sh, sm);
  const end = game.endTime
    ? (() => { const [eh, em] = game.endTime.split(":").map(Number); return fmt(eh, em); })()
    : fmt(sh + 2, sm);
  // Escape per RFC 5545 (commas, semicolons, newlines, backslashes).
  const esc545 = (s) =>
    String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const desc = `Hosted by ${game.hostName}.${game.notes ? " " + game.notes : ""} ${appUrl}/game/${game.id}`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vybe//Games//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${game.id}@vybe`,
    `SUMMARY:${esc545(game.title)}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `LOCATION:${esc545([game.location, game.area].filter(Boolean).join(", "))}`,
    `DESCRIPTION:${esc545(desc)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function buildGCalUrl(game, appUrl) {
  const [y, m, d] = game.date.split("-").map(Number);
  const [sh, sm] = game.time.split(":").map(Number);
  const p = (n) => String(n).padStart(2, "0");
  const fmt = (h, min) => `${y}${p(m)}${p(d)}T${p(h)}${p(min)}00`;
  const start = fmt(sh, sm);
  const end = game.endTime
    ? (() => { const [eh, em] = game.endTime.split(":").map(Number); return fmt(eh, em); })()
    : fmt(sh + 2, sm);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: game.title,
    dates: `${start}/${end}`,
    details: `Hosted by ${game.hostName}.${game.notes ? " " + game.notes : ""} ${appUrl}/game/${game.id}`,
    location: `${game.location}, ${game.area}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

// --- Serve the built frontend in production -------------------------------
// In local dev the React app is served by Vite (port 5173) and this block is
// skipped because there's no dist/ folder. In production `npm run build`
// creates dist/, and this single service serves both the API and the app.
const distDir = path.join(__dirname, "..", "dist");
if (fs.existsSync(path.join(distDir, "index.html"))) {
  const indexHtml = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
  app.use(express.static(distDir));

  // Game pages get per-game Open Graph tags injected so shared links unfurl
  // into a rich card (WhatsApp / iMessage / etc.). The SPA still boots normally.
  app.get("/game/:id", h(async (req, res) => {
    const game = await repo.getGame(req.params.id);
    if (!game) return res.send(indexHtml);
    const base = `${req.protocol}://${req.get("host")}`;
    const left = Math.max(0, game.totalSlots - game.players.length);
    const desc =
      `${calDate(game.date)} · ${prettyTime(game.time)} · ${game.location}` +
      ` — ${left > 0 ? `${left} spot${left === 1 ? "" : "s"} left` : "full"}`;
    res.send(injectMeta(indexHtml, base, game.title, desc));
  }));

  // SPA fallback: any other non-API route returns index.html so routing works.
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.send(indexHtml);
  });
}

// --- Waitlist (public — no auth required) ------------------------------------
// Lenient per-IP cap: mobile carriers route many real users through a few
// shared IPs (CGNAT), so a strict limit would block genuine signups during a
// viral launch. The real bot defenses are the honeypot below (and a CAPTCHA if
// added) — this just stops one IP hammering the endpoint thousands of times.
// Channels we advertise on. An incoming utm_source is normalised to one of
// these; anything unrecognised becomes 'other' and a missing tag is 'direct'.
// 'test' is our private label for self-testing — excluded from the % breakdown.
const WAITLIST_SOURCES = new Set([
  "instagram", "tiktok", "youtube", "reddit", "telegram", "whatsapp", "test",
]);

function normaliseWaitlistSource(raw) {
  if (typeof raw !== "string") return "direct";
  const s = raw.trim().toLowerCase();
  if (s === "") return "direct";
  return WAITLIST_SOURCES.has(s) ? s : "other";
}

app.post("/api/waitlist", waitlistLimiter, async (req, res) => {
  const { email, name, company, source } = req.body || {};
  // Honeypot: the hidden "company" field is invisible to humans. Bots that
  // auto-fill every input set it — silently accept (don't reveal the trap) and
  // drop the request without writing anything.
  if (typeof company === "string" && company.trim() !== "") {
    return res.json({ ok: true, message: "You're on the list! We'll let you know when Vybe launches in Singapore." });
  }
  if (!email || typeof email !== "string") return res.status(400).json({ error: "Email is required." });
  const trimmed = email.trim();
  if (trimmed.length > 200) return res.status(400).json({ error: "Email too long." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return res.status(400).json({ error: "Invalid email address." });
  const safeName = typeof name === "string" ? name.slice(0, 100) : "";
  const safeSource = normaliseWaitlistSource(source);
  const result = await repo.addWaitlistEntry(trimmed, safeName, safeSource);
  if (result.alreadyExists) return res.json({ ok: true, message: "You're already on the list — we'll be in touch!" });
  res.json({ ok: true, message: "You're on the list! We'll let you know when Vybe launches in Singapore." });
});

// Unknown API routes → JSON 404 (never HTML).
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found." });
});

// Sentry must capture errors before the custom handler closes the response.
Sentry.setupExpressErrorHandler(app);

// Last-resort error handler so a thrown error returns clean JSON, not a crash.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[api] unhandled error:", err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

function injectMeta(html, base, title, desc) {
  const fullTitle = `${title} · Vybe`;
  const tags = `
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Vybe" />
    <meta property="og:title" content="${esc(fullTitle)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:image" content="${base}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(fullTitle)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${base}/og-image.png" />
  `;
  return html.replace("</head>", `${tags}</head>`);
}

// --- Startup --------------------------------------------------------------

async function start() {
  await initSchema();
  // Demo data (sample users, demo-password reset, fake past games/reviews) is
  // seeded unless SEED_DEMO is "false". Set SEED_DEMO=false in production to
  // launch with a clean database — no public demo logins, no fake content.
  if (process.env.SEED_DEMO !== "false") {
    await seedIfEmpty();
    await syncDemoPasswords();
    await seedPastData();
  } else {
    console.log("[seed] SEED_DEMO=false — skipping demo users and sample data");
  }
  await repo.promoteAdminsFromEnv();

  // Periodic cleanup so transient tables (reset tokens, idempotency keys, read
  // notifications) don't grow without bound. Runs once on startup, then every
  // 6 hours. unref() so it never holds the process open (tests / CLI imports).
  const runPrune = () =>
    repo
      .pruneExpired()
      .then((s) =>
        console.log(
          `[prune] removed ${s.resetTokens} reset tokens, ${s.idempotencyKeys} idempotency keys, ${s.notifications} old notifications`
        )
      )
      .catch((err) => console.error("[prune] failed:", err));
  runPrune();
  const pruneTimer = setInterval(runPrune, 6 * 60 * 60 * 1000);
  if (typeof pruneTimer.unref === "function") pruneTimer.unref();

  // Pre-game reminders: notify members of games happening tomorrow. Runs on
  // startup, then hourly; reminder_sent prevents duplicates.
  const runReminders = () =>
    repo
      .sendDueReminders()
      .then((r) => {
        if (r.games) console.log(`[reminders] notified ${r.notified} members across ${r.games} game(s)`);
      })
      .catch((err) => console.error("[reminders] failed:", err));
  runReminders();
  const reminderTimer = setInterval(runReminders, 60 * 60 * 1000);
  if (typeof reminderTimer.unref === "function") reminderTimer.unref();

  if (!process.env.RESEND_API_KEY) console.warn("[email] RESEND_API_KEY not set — join confirmation emails will be skipped");
  if (!process.env.SENTRY_DSN) console.warn("[sentry] SENTRY_DSN not set — errors will only be logged to the console, not reported to Sentry");
  app.listen(PORT, () => {
    console.log(`[api] Vybe API listening on http://localhost:${PORT}`);
  });
}

// Skip auto-start under test so the app can be imported without a DB or a
// listening socket (see tests/). Production / dev run normally.
if (process.env.NODE_ENV !== "test") {
  start().catch((err) => {
    console.error("[api] failed to start:", err);
    process.exit(1);
  });
}

// Exported for unit / integration tests (tests/).
export { app, validGameInput, gameInputFrom, isValidEmail, isCloudinaryUrl, addWeeksISO, PASSWORD_MIN };
