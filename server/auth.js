// Auth helpers: password hashing (bcryptjs) + JWT issue/verify.
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// In a real deployment this comes from an env var / secret manager.
// Hardcoded here so local Phase 2 testing works out of the box.
const JWT_SECRET = process.env.JWT_SECRET || "setmatch-dev-secret-change-me";
const TOKEN_TTL = "30d";

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
