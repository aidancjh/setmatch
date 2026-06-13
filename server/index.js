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
    res.status(201).json(await repo.createGame(req.userId, gameInputFrom(req.body)));
  })
);

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

// --- Serve the built frontend in production -------------------------------
// In local dev the React app is served by Vite (port 5173) and this block is
// skipped because there's no dist/ folder. In production `npm run build`
// creates dist/, and this single service serves both the API and the app.
const distDir = path.join(__dirname, "..", "dist");
if (fs.existsSync(path.join(distDir, "index.html"))) {
  app.use(express.static(distDir));
  // SPA fallback: any non-API route returns index.html so React Router works.
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
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
