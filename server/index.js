// SetMatch API server — Express + PostgreSQL.
// Local dev:  node --env-file=.env server/index.js   (see package.json scripts)
// Production: node server/index.js                    (host provides env vars)
import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword, verifyPassword, signToken, requireAuth } from "./auth.js";
import * as repo from "./repo.js";
import { initSchema } from "./db.js";
import { seedIfEmpty } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", true); // behind Railway's proxy — reflect real https host
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// --- Validation helpers ---------------------------------------------------

const SKILLS = ["Beginner", "Intermediate", "Advanced", "All Levels"];
const TYPES = ["Indoor", "Beach", "Grass"];

function validGameInput(b) {
  if (!b || typeof b !== "object") return "Invalid request body.";
  if (!b.title || !String(b.title).trim()) return "Title is required.";
  if (!TYPES.includes(b.type)) return "Invalid game type.";
  if (!SKILLS.includes(b.skill)) return "Invalid skill level.";
  if (!b.date) return "Date is required.";
  if (!b.time) return "Time is required.";
  if (!b.location || !String(b.location).trim()) return "Location is required.";
  const slots = Number(b.totalSlots);
  if (!Number.isInteger(slots) || slots < 2 || slots > 50)
    return "Total slots must be between 2 and 50.";
  return null;
}

function gameInputFrom(body) {
  return {
    title: String(body.title).trim(),
    type: body.type,
    skill: body.skill,
    date: body.date,
    time: body.time,
    location: String(body.location).trim(),
    area: String(body.area || body.location).trim(),
    totalSlots: Number(body.totalSlots),
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
    res.json({ user: repo.publicUser(user) });
  })
);

app.patch(
  "/api/auth/me",
  requireAuth,
  h(async (req, res) => {
    const { name, skill, homeArea } = req.body || {};
    if (skill && !SKILLS.includes(skill))
      return res.status(400).json({ error: "Invalid skill level." });
    const user = await repo.updateUser(req.userId, {
      name: name != null ? String(name).trim() || undefined : undefined,
      skill,
      homeArea,
    });
    res.json({ user: repo.publicUser(user) });
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

// --- Add to calendar (.ics) -----------------------------------------------
// Public on purpose: the phone's calendar app fetches this without auth.

app.get(
  "/api/games/:id/calendar.ics",
  h(async (req, res) => {
    const game = await repo.getGame(req.params.id);
    if (!game) return res.status(404).json({ error: "Game not found." });
    const ics = buildICS(game, `${req.protocol}://${req.get("host")}`);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${game.id}.ics"`
    );
    res.send(ics);
  })
);

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
    "PRODID:-//SetMatch//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${game.id}@setmatch`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsTime(game.date, game.time)}`,
    `DTEND:${icsTime(game.date, game.time, 2)}`,
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
  const fullTitle = `${title} · SetMatch`;
  const tags = `
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SetMatch" />
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
  app.listen(PORT, () => {
    console.log(`[api] SetMatch API listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("[api] failed to start:", err);
  process.exit(1);
});
