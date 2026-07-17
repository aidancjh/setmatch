// Auth helpers: password hashing (bcryptjs) + JWT issue/verify.
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "./db.js";

const DEV_SECRET = "setmatch-dev-secret-change-me";
const JWT_SECRET = process.env.JWT_SECRET || DEV_SECRET;

// Pre-computed at startup for constant-time login comparison — prevents timing
// attacks that could reveal which email addresses are registered.
export const TIMING_HASH = bcrypt.hashSync("__timing_sentinel__", 10);

// Secrets that are public knowledge — they live in source (the dev fallback) or
// in a committed example file (.env.example's placeholder). None may ever
// protect a real deployment, so they're rejected the same as a missing secret.
const WEAK_SECRETS = new Set([DEV_SECRET, "local-dev-secret-not-for-production"]);

// Fail CLOSED unless we're explicitly in local dev or the test suite. Railway
// (and most hosts) do not guarantee NODE_ENV="production" at runtime, so gating
// this check on `=== "production"` would silently boot on a public secret when
// NODE_ENV is unset — letting anyone forge tokens for any user. Requiring an
// explicit "development"/"test" opt-out means a misconfigured deploy refuses to
// start instead of running insecurely.
const IS_DEV_OR_TEST =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
if (!IS_DEV_OR_TEST && (!process.env.JWT_SECRET || WEAK_SECRETS.has(JWT_SECRET))) {
  console.error(
    "[auth] FATAL: JWT_SECRET is missing or set to a known placeholder/dev value. " +
      "Set it to a strong, unique value before deploying — generate one with " +
      "`node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"` " +
      "(or export NODE_ENV=development for local dev)."
  );
  process.exit(1);
}

const TOKEN_TTL = "14d";

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

export function signToken(userId, tokenVersion = 0) {
  return jwt.sign({ sub: userId, tv: tokenVersion }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

/**
 * Express middleware: requires a valid Bearer token, then confirms the account
 * still exists, isn't suspended, and the token hasn't been revoked (its `tv`
 * claim must match the user's current token_version). Sets req.userId.
 *
 * The status check is one indexed primary-key lookup — cheap, and these routes
 * hit the DB anyway. It closes the gap where a 14-day JWT kept working after a
 * suspension or password reset.
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not signed in." });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }
  try {
    const { rows } = await query(
      "SELECT suspended, token_version FROM users WHERE id = $1",
      [payload.sub]
    );
    const u = rows[0];
    if (!u) return res.status(401).json({ error: "Account not found." });
    if (u.suspended)
      return res.status(403).json({ error: "This account has been suspended." });
    if ((payload.tv ?? 0) !== (u.token_version ?? 0))
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    req.userId = payload.sub;
    next();
  } catch (e) {
    console.error("[auth] requireAuth status check failed:", e);
    return res.status(503).json({ error: "Service temporarily unavailable. Please try again." });
  }
}

/** Decode a bearer token to a userId, or null if missing/invalid. */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET).sub;
  } catch {
    return null;
  }
}

/** Optional auth: sets req.userId if a valid token is present, else null. */
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  req.userId = null;
  if (token) {
    try {
      req.userId = jwt.verify(token, JWT_SECRET).sub;
    } catch {
      /* ignore invalid token for optional routes */
    }
  }
  next();
}
