// Coterie API server — Express + PostgreSQL.
// Local dev:  node --env-file=.env server/index.js   (see package.json scripts)
// Production: node server/index.js                    (host provides env vars)
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "https://83a12c55babf018af2ba1667de40f393@o4511558969786368.ingest.us.sentry.io/4511561293365248",
  environment: process.env.NODE_ENV || "production",
});

import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword, verifyPassword, signToken, requireAuth } from "./auth.js";
import * as repo from "./repo.js";
import { initSchema, query } from "./db.js";
import { seedIfEmpty, syncDemoPasswords } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", true); // behind Railway's proxy — reflect real https host
app.use(cors());
app.use(express.json());

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

// --- Validation helpers ---------------------------------------------------

const SKILLS = ["Beginner", "Intermediate", "Advanced", "All Levels"];
const TYPES = ["Indoor", "Beach", "Grass"];
const GENDERS = ["Men", "Women", "Mixed", "Open"];
const NET_HEIGHTS = ["Men's (2.43m)", "Women's (2.24m)", "Recreational (2.35m)", "Venue Standard"];
const POSITIONS = ["Setter", "Outside Hitter", "Middle Blocker", "Opposite", "Libero", "Defensive Specialist", "Any"];
const ROTATION_TYPES = ["Standard", "No Rotation", "King of the Court", "Round Robin"];

function validGameInput(b) {
  // pre_filled is optional — default 0, max totalSlots - 1
  if (!b || typeof b !== "object") return "Invalid request body.";
  if (!b.title || !String(b.title).trim()) return "Title is required.";
  if (!TYPES.includes(b.type)) return "Invalid game type.";
  if (!SKILLS.includes(b.skill)) return "Invalid skill level.";
  if (b.gender && !GENDERS.includes(b.gender)) return "Invalid gender option.";
  if (b.netHeight && !NET_HEIGHTS.includes(b.netHeight)) return "Invalid net height option.";
  if (b.rotationType && !ROTATION_TYPES.includes(b.rotationType)) return "Invalid rotation type.";
  if (!b.date) return "Date is required.";
  if (!b.time) return "Time is required.";
  if (!b.location || !String(b.location).trim()) return "Location is required.";
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
    courtFee: String(body.courtFee || "").trim().slice(0, 50),
    date: body.date,
    time: body.time,
    endTime: body.endTime ? String(body.endTime) : "",
    location: String(body.location).trim(),
    area: String(body.area || body.location).trim(),
    totalSlots: Number(body.totalSlots),
    preFilled: Math.max(0, Math.min(Number(body.preFilled) || 0, Number(body.totalSlots) - 1)),
    notes: String(body.notes || "").trim(),
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
    if (!password || String(password).length < 6)
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters." });
    if (!name || !String(name).trim())
      return res.status(400).json({ error: "Name is required." });

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
    if (!user || !verifyPassword(password || "", user.password_hash))
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
    const { name, skill, homeArea, bio, avatarUrl, birthdate, userGender, showAge, showGender, favoritePositions } = req.body || {};
    if (skill && !SKILLS.includes(skill))
      return res.status(400).json({ error: "Invalid skill level." });
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

app.get("/api/auth/google", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId)
    return res.status(503).json({ error: "Google login is not configured." });

  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get(
  "/api/auth/google/callback",
  h(async (req, res) => {
    const { code, error } = req.query;
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;

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
    const game = await repo.joinGame(req.params.id, req.userId);
    if (!game) return res.status(404).json({ error: "Game not found." });

    // Fire-and-forget: email a calendar invite when user gets a confirmed spot.
    const user = await repo.findUserById(req.userId);
    const isPlayer = game.players.some((p) => p.id === req.userId);
    const resendKey = process.env.RESEND_API_KEY;
    if (user && isPlayer && resendKey && !user.email.endsWith("@demo.test")) {
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const ics = buildICS(game, appUrl);
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Coterie <onboarding@resend.dev>",
          to: [user.email],
          subject: `You're in: ${game.title}`,
          html: `<p style="font-family:sans-serif">Hi ${user.name},</p>
                 <p style="font-family:sans-serif">You've claimed your spot for <strong>${game.title}</strong>!</p>
                 <p style="font-family:sans-serif">📅 ${game.date} at ${game.time}<br>📍 ${game.location}, ${game.area}</p>
                 ${game.notes ? `<p style="font-family:sans-serif">Notes: ${game.notes}</p>` : ""}
                 <p style="font-family:sans-serif">The calendar invite is attached — tap it to add to your calendar.</p>
                 <p style="font-family:sans-serif"><a href="${appUrl}/game/${game.id}" style="color:#E8734A;">View game details</a></p>
                 <p style="font-family:sans-serif">— The Coterie team</p>`,
          attachments: [{ filename: "coterie-game.ics", content: Buffer.from(ics).toString("base64") }],
        }),
      }).catch((e) => console.error("[calendar] email failed:", e));
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
    const offset = Number(req.query.offset) || 0;
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

// --- Calendar ICS builder (used when emailing invites on join) ------------

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
  await repo.promoteAdminsFromEnv();
  app.listen(PORT, () => {
    console.log(`[api] Coterie API listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("[api] failed to start:", err);
  process.exit(1);
});
