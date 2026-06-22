// Auth helpers: password hashing (bcryptjs) + JWT issue/verify.
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const DEV_SECRET = "setmatch-dev-secret-change-me";
const JWT_SECRET = process.env.JWT_SECRET || DEV_SECRET;

// Pre-computed at startup for constant-time login comparison — prevents timing
// attacks that could reveal which email addresses are registered.
export const TIMING_HASH = bcrypt.hashSync("__timing_sentinel__", 10);

if (process.env.NODE_ENV === "production" && JWT_SECRET === DEV_SECRET) {
  console.error(
    "[auth] FATAL: JWT_SECRET is not set. Set it in Railway environment variables before deploying."
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

export function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

/** Express middleware: requires a valid Bearer token, sets req.userId. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not signed in." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Session expired. Please sign in again." });
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
