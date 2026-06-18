// Coterie API server — Express + PostgreSQL.
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
import rateLimit from "express-rate-limit";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { hashPassword, verifyPassword, signToken, requireAuth, TIMING_HASH } from "./auth.js";
import * as repo from "./repo.js";
import { initSchema, query } from "./db.js";
import { seedIfEmpty, syncDemoPasswords, seedPastData } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", true); // behind Railway's proxy — reflect real https host

// --- Security headers (helmet) --------------------------------------------
// Content-Security-Policy is relaxed enough for Cloudinary uploads + Sentry.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Vite inline scripts in prod build
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
        mediaSrc: ["'self'", "blob:", "https://res.cloudinary.com"],
        connectSrc: [
          "'self'",
          "https://api.cloudinary.com",
          "https://api.resend.com",
          "https://*.ingest.sentry.io",
          "https://*.ingest.us.sentry.io",
        ],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);

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
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts — please wait 15 minutes and try again." },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — slow down." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
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

// Health check for uptime monitors — verifies the DB is reachable.
app.get("/healthz", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    console.error("[health] db check failed:", err);
    res.status(503).json({ status: "db_unavailable" });
  }
});

// --- Shared validation helpers --------------------------------------------

/** Only allow uploads from Cloudinary (where our upload widget sends files). */
function isCloudinaryUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "res.cloudinary.com";
  } catch {
    return false;
  }
}

const SKILLS = ["Beginner", "Intermediate", "Advanced", "All Levels"];
const TYPES = ["Indoor", "Beach", "Grass"];
const GENDERS = ["Men", "Women", "Mixed", "Open"];
const NET_HEIGHTS = ["Men's (2.43m)", "Women's (2.24m)", "Recreational (2.35m)", "Venue Standard"];
const POSITIONS = ["Setter", "Outside Hitter", "Middle Blocker", "Opposite", "Libero", "Defensive Specialist", "Any"];
const ROTATION_TYPES = ["Standard", "No Rotation", "King of the Court", "Round Robin"];
const REGIONS = ["North", "South", "East", "West"];

function validGameInput(b) {
  if (!b || typeof b !== "object") return "Invalid request body.";
  if (!b.title || !String(b.title).trim()) return "Title is required.";
  if (String(b.title).trim().length > 100) return "Title must be 100 characters or fewer.";
  if (!TYPES.includes(b.type)) return "Invalid game type.";
  if (!SKILLS.includes(b.skill)) return "Invalid skill level.";
  if (b.gender && !GENDERS.includes(b.gender)) return "Invalid gender option.";
  if (b.netHeight && !NET_HEIGHTS.includes(b.netHeight)) return "Invalid net height option.";
  if (b.rotationType && !ROTATION_TYPES.includes(b.rotationType)) return "Invalid rotation type.";
  if (!b.date) return "Date is required.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return "Invalid date format (expected YYYY-MM-DD).";
  if (!b.time) return "Time is required.";
  if (!/^\d{2}:\d{2}$/.test(b.time)) return "Invalid time format (expected HH:MM).";
  if (b.endTime && !/^\d{2}:\d{2}$/.test(b.endTime)) return "Invalid end time format.";
  if (!b.location || !String(b.location).trim()) return "Location is required.";
  if (String(b.location).trim().length > 150) return "Location must be 150 characters or fewer.";
  if (b.notes && String(b.notes).length > 2000) return "Notes must be 2000 characters or fewer.";
  const slots = Number(b.totalSlots);
  if (!Number.isInteger(slots) || slots < 2 || slots > 50)
    return "Total slots must be between 2 and 50.";
  return null;
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

/** Wrap an async route so thrown errors become a 500 instead of crashing. */
const h = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error("[api] error:", err);
    res.status(500).json({ error: "Something went wrong on the server." });
  });

// --- Auth routes ----------------------------------------------------------

app.post(
  "/api/auth/signup",
  h(async (req, res) => {
    const { email, password, name } = req.body || {};
    if (!email || !String(email).includes("@"))
      return res.status(400).json({ error: "A valid email is required." });
    if (String(email).length > 254)
      return res.status(400).json({ error: "Email address is too long." });
    if (!password || String(password).length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    if (String(password).length > 128)
      return res.status(400).json({ error: "Password must be 128 characters or fewer." });
    if (!name || !String(name).trim())
      return res.status(400).json({ error: "Name is required." });
    if (String(name).trim().length > 50)
      return res.status(400).json({ error: "Name must be 50 characters or fewer." });

    if (await repo.findUserByEmail(email))
      return res
        .status(409)
        .json({ error: "An account with that email already exists." });

    const user = await repo.createUser({
      email,
      passwordHash: hashPassword(password),
      name: String(name).trim(),
    });
    res.status(201).json({ token: signToken(user.id), user: repo.publicUser(user) });
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
    res.json({ token: signToken(user.id), user: repo.publicUser(user) });
  })
);

app.get(
  "/api/auth/me",
  requireAuth,
  h(async (req, res) => {
    const user = await repo.findUserById(req.userId);
    if (!user) return res.status(401).json({ error: "Account not found." });
    const playerRating = await repo.getPlayerRating(req.userId);
    res.json({ user: { ...repo.publicUser(user), playerRating } });
  })
);

app.delete(
  "/api/auth/me",
  requireAuth,
  h(async (req, res) => {
    await repo.deleteAccount(req.userId);
    res.status(204).end();
  })
);

app.patch(
  "/api/auth/me",
  requireAuth,
  h(async (req, res) => {
    const { name, skill, homeArea, bio, avatarUrl, birthdate, userGender, showAge, showGender, favoritePositions, bannerColor, bannerImage } = req.body || {};
    if (skill && !SKILLS.includes(skill))
      return res.status(400).json({ error: "Invalid skill level." });
    const USER_GENDERS = ["Man", "Woman", "Non-binary", "Prefer not to say", ""];
    if (userGender !== undefined && !USER_GENDERS.includes(String(userGender)))
      return res.status(400).json({ error: "Invalid gender option." });
    if (bannerColor !== undefined && bannerColor && !/^#[0-9A-Fa-f]{3,8}$/.test(String(bannerColor)))
      return res.status(400).json({ error: "Invalid banner color — use a hex value like #FF6B6B." });
    if (avatarUrl != null && avatarUrl !== "" && !isCloudinaryUrl(String(avatarUrl)))
      return res.status(400).json({ error: "Avatar must be uploaded via Cloudinary." });
    if (bannerImage != null && bannerImage !== "" && !isCloudinaryUrl(String(bannerImage)))
      return res.status(400).json({ error: "Banner image must be uploaded via Cloudinary." });
    if (name != null && String(name).trim().length > 50)
      return res.status(400).json({ error: "Name must be 50 characters or fewer." });
    if (homeArea != null && String(homeArea).length > 100)
      return res.status(400).json({ error: "Home area must be 100 characters or fewer." });
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
  h(async (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "Email is required." });
    const user = await repo.findUserByEmail(email);
    // Always return OK — never reveal whether an email exists.
    if (!user) return res.json({ ok: true });

    const token = await repo.createPasswordResetToken(user.id);
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const resetLink = `${appUrl}/auth?reset=${token}`;
    const resendKey = process.env.RESEND_API_KEY;

    if (!resendKey) {
      console.warn("[auth] RESEND_API_KEY not set — skipping reset email");
      return res.json({ ok: true });
    }

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Coterie <onboarding@resend.dev>",
        to: [user.email],
        subject: "Reset your Coterie password",
        html: `<p>Hi ${user.name},</p>
               <p>You requested a password reset.</p>
               <p><a href="${resetLink}" style="background:#E8734A;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-family:sans-serif;">Reset password</a></p>
               <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
               <p>— The Coterie team</p>`,
      }),
    });

    res.json({ ok: true });
  })
);

app.post(
  "/api/auth/reset-password",
  h(async (req, res) => {
    const { token, password } = req.body || {};
    if (!token) return res.status(400).json({ error: "Reset token is required." });
    if (!password || String(password).length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters." });

    const record = await repo.verifyPasswordResetToken(token);
    if (!record)
      return res.status(400).json({ error: "This reset link has expired or already been used." });

    await repo.updateUserPassword(record.user_id, hashPassword(password));
    await repo.consumePasswordResetToken(token);

    const user = await repo.findUserById(record.user_id);
    res.json({ token: signToken(user.id), user: repo.publicUser(user) });
  })
);

// --- Google OAuth ----------------------------------------------------------

// In-memory store for OAuth state tokens (TTL 10 min; cleared on use or expiry).
// Fine for a single-process server. If you ever run multiple replicas, move
// this to Redis or Postgres.
const oauthStates = new Map(); // state -> expiry timestamp
setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of oauthStates) if (now > exp) oauthStates.delete(k);
}, 60_000);

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

    const user = await repo.findOrCreateGoogleUser(
      googleUser.id,
      googleUser.email,
      googleUser.name || googleUser.email.split("@")[0]
    );
    res.redirect(`${appUrl}/auth?token=${signToken(user.id)}`);
  })
);

// --- Email debug (authenticated) -----------------------------------------

app.get(
  "/api/debug/email-test",
  requireAuth,
  requireAdmin,
  h(async (req, res) => {
    const user = await repo.findUserById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

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
          from: "Coterie <onboarding@resend.dev>",
          to: [user.email],
          subject: "Coterie — email test",
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

app.post(
  "/api/games",
  requireAuth,
  h(async (req, res) => {
    const err = validGameInput(req.body);
    if (err) return res.status(400).json({ error: err });
    // Idempotency: a retried request with the same key returns the first result
    // instead of creating duplicate games.
    const idemKey = req.get("Idempotency-Key");
    if (idemKey && idemKey.length > 128)
      return res.status(400).json({ error: "Idempotency-Key must be 128 characters or fewer." });
    const existing = await repo.getIdempotentGame(idemKey);
    if (existing) return res.status(201).json(existing);

    const input = gameInputFrom(req.body);
    // Recurring: create N weekly occurrences (capped). Return the first one.
    const repeat = Math.min(Math.max(Number(req.body.repeat) || 1, 1), 12);
    let first = null;
    for (let i = 0; i < repeat; i++) {
      const game = await repo.createGame(req.userId, {
        ...input,
        date: addWeeksISO(input.date, i),
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
  h(async (req, res) => {
    const err = validGameInput(req.body);
    if (err) return res.status(400).json({ error: err });
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
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.warn("[email] RESEND_API_KEY not set — skipping join confirmation email");
    } else if (user && isPlayer && !user.email.endsWith("@demo.test")) {
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const calLink = buildGCalUrl(game, appUrl);
      const timeDisplay = game.endTime
        ? `${prettyTime(game.time)} – ${prettyTime(game.endTime)}`
        : prettyTime(game.time);
      const brand = "#E8734A";
      const row = (label, value) =>
        `<tr><td style="padding:6px 0;font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:#9ca3af;">${label}</td>` +
        `<td style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${value}</td></tr>`;
      const emailHtml = [
        `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>`,
        `<body style="margin:0;padding:24px 16px;background:#f5ede3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">`,
        `<div style="max-width:460px;margin:0 auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">`,
        `<div style="text-align:center;padding:28px 32px 0;">`,
        `<div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:${brand};border-radius:50%;font-size:26px;color:#fff;">&#10003;</div>`,
        `</div>`,
        `<div style="text-align:center;padding:12px 32px 0;">`,
        `<h1 style="margin:0;font-size:32px;font-weight:800;color:#111827;">You're In!</h1>`,
        `<p style="margin:8px 0 0;font-size:14px;color:#6b7280;">Hi ${esc(user.name)}, your spot for <strong style="color:#374151;">${esc(game.title)}</strong> is confirmed.</p>`,
        `</div>`,
        `<div style="margin:20px 32px 0;height:1px;background:#f3f4f6;"></div>`,
        `<div style="padding:16px 32px 0;"><table style="width:100%;border-collapse:collapse;">`,
        row("Date", calDate(game.date)),
        row("Time", timeDisplay),
        row("Location", esc(game.location)),
        game.costPerPerson > 0 ? row("Cost", `$${game.costPerPerson} per person`) : "",
        `</table></div>`,
        game.notes ? `<div style="margin:12px 32px 0;background:#f9fafb;border-radius:12px;padding:12px 16px;font-size:13px;color:#4b5563;line-height:1.6;">${esc(game.notes)}</div>` : "",
        `<div style="padding:20px 32px 8px;">`,
        `<a href="${calLink}" style="display:block;background:${brand};color:#fff;text-decoration:none;text-align:center;padding:15px;border-radius:12px;font-size:15px;font-weight:700;">Add to Google Calendar</a>`,
        `</div>`,
        `<div style="padding:0 32px 24px;">`,
        `<a href="${appUrl}/game/${game.id}" style="display:block;border:1.5px solid #e5e7eb;color:#374151;text-decoration:none;text-align:center;padding:13px;border-radius:12px;font-size:14px;font-weight:500;">View Game Details</a>`,
        `</div>`,
        `<p style="text-align:center;padding:0 0 20px;margin:0;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#d1d5db;">COTERIE</p>`,
        `</div></body></html>`,
      ].join("");
      console.log(`[email] sending join confirmation to ${user.email} for "${game.title}"`);
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Coterie <onboarding@resend.dev>",
          to: [user.email],
          subject: `You're in: ${game.title}`,
          html: emailHtml,
        }),
      }).then((r) => {
        if (r.ok) {
          console.log(`[email] delivered OK to ${user.email}`);
        } else {
          r.text().then((t) => console.error(`[email] Resend error ${r.status}:`, t));
        }
      }).catch((e) => console.error("[email] network error:", e));
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

// --- Comments -------------------------------------------------------------

app.get(
  "/api/games/:id/comments",
  h(async (req, res) => {
    res.json(await repo.listComments(req.params.id));
  })
);

app.post(
  "/api/games/:id/comments",
  requireAuth,
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

// --- Cost splitting -------------------------------------------------------

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

// --- Admin (role-enforced on the server, not just the UI) -----------------

async function requireAdmin(req, res, next) {
  try {
    const role = await repo.getRole(req.userId);
    if (role !== "admin")
      return res.status(403).json({ error: "Admin access required." });
    next();
  } catch (err) {
    console.error("[api] admin check error:", err);
    res.status(500).json({ error: "Something went wrong on the server." });
  }
}

app.get(
  "/api/admin/stats",
  requireAuth,
  requireAdmin,
  h(async (_req, res) => res.json(await repo.adminStats()))
);

app.get(
  "/api/admin/users",
  requireAuth,
  requireAdmin,
  h(async (_req, res) => res.json(await repo.adminListUsers()))
);

app.patch(
  "/api/admin/users/:id/role",
  requireAuth,
  requireAdmin,
  h(async (req, res) => {
    const user = await repo.setUserRole(req.params.id, req.body && req.body.role);
    if (!user) return res.status(400).json({ error: "Invalid role." });
    res.json(repo.publicUser(user));
  })
);

app.get(
  "/api/admin/games",
  requireAuth,
  requireAdmin,
  h(async (_req, res) => res.json(await repo.adminListGames()))
);

app.delete(
  "/api/admin/games/:id",
  requireAuth,
  requireAdmin,
  h(async (req, res) => {
    await repo.adminDeleteGame(req.params.id);
    res.status(204).end();
  })
);

app.post(
  "/api/admin/seed-past-data",
  requireAuth,
  requireAdmin,
  h(async (_req, res) => {
    await seedPastData();
    res.json({ ok: true });
  })
);

// --- User profiles --------------------------------------------------------

app.get(
  "/api/users/:id/profile",
  requireAuth,
  h(async (req, res) => {
    const profile = await repo.getUserProfile(req.params.id);
    if (!profile) return res.status(404).json({ error: "Player not found." });
    res.json(profile);
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
  h(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Math.min(Math.max(Number(req.query.offset) || 0, 0), 10000);
    res.json(await repo.listHighlights(limit, offset));
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
    res.json(await repo.listHighlightComments(req.params.id));
  })
);

app.post(
  "/api/highlights/:id/comments",
  requireAuth,
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

// --- Join confirmation email -----------------------------------------------

function buildConfirmEmail({ game, userName, gcalUrl, appUrl, timeDisplay }) {
  const brand = "#E8734A";
  const row = (label, value) => `
    <tr>
      <td style="padding:6px 0;font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;color:#9ca3af;">${label}</td>
      <td style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${value}</td>
    </tr>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:24px 16px;background:#f5ede3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;margin:0 auto;">
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:28px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.10);">
        <!-- top notch -->
        <tr><td style="text-align:center;padding:20px 0 8px;">
          <div style="display:inline-block;width:36px;height:36px;background:#111827;border-radius:50%;"></div>
        </td></tr>
        <!-- checkmark -->
        <tr><td style="text-align:center;padding:4px 0 12px;">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:${brand};border-radius:50%;font-size:26px;color:white;">✓</div>
        </td></tr>
        <!-- heading -->
        <tr><td style="text-align:center;padding:4px 32px 6px;">
          <h1 style="margin:0;font-size:34px;font-weight:800;color:#111827;letter-spacing:-.5px;">You're In!</h1>
          <p style="margin:8px 0 0;font-size:14px;color:#6b7280;line-height:1.5;">
            Hi ${esc(userName)}, your spot for <strong style="color:#374151;">${esc(game.title)}</strong> is confirmed.
          </p>
        </td></tr>
        <!-- divider -->
        <tr><td style="padding:16px 32px;"><div style="height:1px;background:#f3f4f6;"></div></td></tr>
        <!-- details table -->
        <tr><td style="padding:0 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            ${row("Date", calDate(game.date))}
            ${row("Time", timeDisplay)}
            ${row("Location", esc(game.location))}
            ${game.area ? row("Area", esc(game.area)) : ""}
            ${game.costPerPerson > 0 ? row("Cost", `$${game.costPerPerson} per person`) : ""}
          </table>
        </td></tr>
        ${game.notes ? `<tr><td style="padding:12px 32px 0;"><div style="background:#f9fafb;border-radius:14px;padding:12px 16px;font-size:13px;color:#4b5563;line-height:1.6;">${esc(game.notes)}</div></td></tr>` : ""}
        <!-- buttons -->
        <tr><td style="padding:20px 32px 8px;">
          <a href="${gcalUrl}" style="display:block;background:${brand};color:#ffffff;text-decoration:none;text-align:center;padding:15px 24px;border-radius:14px;font-size:15px;font-weight:700;">
            Add to Google Calendar
          </a>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <a href="${appUrl}/game/${game.id}" style="display:block;border:1.5px solid #e5e7eb;color:#374151;text-decoration:none;text-align:center;padding:13px 24px;border-radius:14px;font-size:14px;font-weight:500;">
            View Game Details
          </a>
        </td></tr>
        <!-- footer -->
        <tr><td style="text-align:center;padding:12px 0 24px;">
          <span style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#d1d5db;">COTERIE</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// --- Calendar ICS builder (kept for potential future use) ------------------

function icsTime(dateISO, timeHHMM, addHours = 0) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = timeHHMM.split(":").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, hh + addHours, mm));
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(
    dt.getUTCDate()
  )}T${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}00`;
}

function icsEscape(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function buildICS(game, base) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const desc =
    `Hosted by ${game.hostName}.` +
    (game.notes ? ` ${game.notes}` : "") +
    ` View: ${base}/game/${game.id}`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Coterie//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${game.id}@setmatch`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsTime(game.date, game.time)}`,
    `DTEND:${game.endTime ? icsTime(game.date, game.endTime) : icsTime(game.date, game.time, 2)}`,
    `SUMMARY:${icsEscape(game.title)}`,
    `LOCATION:${icsEscape(`${game.location}, ${game.area}`)}`,
    `DESCRIPTION:${icsEscape(desc)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Volleyball game reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
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
const waitlistLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many signups from this IP — try again later." },
});

app.post("/api/waitlist", waitlistLimiter, async (req, res) => {
  const { email, name } = req.body || {};
  if (!email || typeof email !== "string") return res.status(400).json({ error: "Email is required." });
  const trimmed = email.trim();
  if (trimmed.length > 200) return res.status(400).json({ error: "Email too long." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return res.status(400).json({ error: "Invalid email address." });
  const safeName = typeof name === "string" ? name.slice(0, 100) : "";
  const result = await repo.addWaitlistEntry(trimmed, safeName);
  if (result.alreadyExists) return res.json({ ok: true, message: "You're already on the list — we'll be in touch!" });
  res.json({ ok: true, message: "You're on the list! We'll let you know when Coterie launches in Singapore." });
});

app.get("/api/waitlist", requireAuth, async (req, res) => {
  const user = await repo.findUserById(req.userId);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Forbidden." });
  const entries = await repo.getWaitlistEntries();
  const count = await repo.getWaitlistCount();
  res.json({ count, entries });
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

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function prettyTime(t) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

function calDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${days[date.getUTCDay()]}, ${months[m - 1]} ${d}`;
}

function injectMeta(html, base, title, desc) {
  const fullTitle = `${title} · Coterie`;
  const tags = `
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Coterie" />
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
  await seedIfEmpty();
  await syncDemoPasswords();
  await seedPastData();
  await repo.promoteAdminsFromEnv();
  if (!process.env.RESEND_API_KEY) console.warn("[email] RESEND_API_KEY not set — join confirmation emails will be skipped");
  if (!process.env.SENTRY_DSN) console.warn("[sentry] SENTRY_DSN not set — errors will only be logged to the console, not reported to Sentry");
  app.listen(PORT, () => {
    console.log(`[api] Coterie API listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("[api] failed to start:", err);
  process.exit(1);
});
