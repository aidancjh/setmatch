// Standalone admin service — separate Railway deploy from the consumer app
// (server/index.js). Same repo, same Postgres, deliberately separate:
//   - own connection pool cap (set DB_POOL_MAX on this service in Railway)
//   - own JWT secret/audience (server/adminAuth.js) — a leaked consumer token
//     can never authenticate here
//   - own rate limiter (adminApiLimiter) — can't be starved by consumer traffic
//     because it isn't the same process
//   - own password login (server/adminAuth.js's verifyAdminPassword) — a
//     single shared bcrypt-hashed password, gated by adminLoginLimiter so
//     brute-forcing it is impractical (5 failed guesses / 15 min / IP)
import express from "express";
import helmet from "helmet";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { helmetOptions } from "./security.js";
import { adminApiLimiter, adminLoginLimiter } from "./middleware/rateLimiters.js";
import { signAdminToken, verifyAdminPassword } from "./adminAuth.js";
import adminRoutes from "./adminRoutes.js";
import { findUserByEmail, logAdminAction } from "./repo.js";

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

// --- Admin password login ---------------------------------------------------
// The password itself carries no identity, so the account it logs into is
// fixed by ADMIN_LOGIN_EMAIL (an existing admin user's email — same row the
// old Google flow looked up). This keeps suspension, role checks, and the
// token_version revoke lever all working exactly as before; only how the
// password is *verified* changed. Generic error messages throughout — never
// reveal whether the failure was a wrong password vs. a misconfigured server.
app.post("/api/auth/login", adminLoginLimiter, async (req, res) => {
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!password) return res.status(400).json({ error: "Password is required." });

  if (!verifyAdminPassword(password)) {
    return res.status(401).json({ error: "Incorrect password." });
  }

  const loginEmail = process.env.ADMIN_LOGIN_EMAIL;
  if (!loginEmail) {
    console.error("[admin-api] ADMIN_LOGIN_EMAIL is not configured.");
    return res.status(503).json({ error: "Admin login is not configured." });
  }

  try {
    const user = await findUserByEmail(loginEmail);
    if (!user || (user.role || "user") !== "admin") {
      return res.status(403).json({ error: "Admin access required." });
    }
    if (user.suspended) {
      return res.status(403).json({ error: "This account has been suspended." });
    }

    const token = signAdminToken(user.id, user.token_version);
    logAdminAction(user.id, "login", "Signed in with the admin password").catch(() => {});
    res.json({ token });
  } catch (err) {
    console.error("[admin-api] login failed:", err);
    res.status(503).json({ error: "Service temporarily unavailable. Please try again." });
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
