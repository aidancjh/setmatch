// Admin-scoped JWT: a deliberately separate token type from server/auth.js's
// consumer JWT — different secret, different audience claim, shorter expiry.
// A leaked consumer token can never authenticate against the admin service
// (wrong secret entirely) and a leaked admin token expires within hours.
import jwt from "jsonwebtoken";
import { findUserById } from "./repo.js";

const DEV_SECRET = "coterie-admin-dev-secret-change-me";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || DEV_SECRET;

if (process.env.NODE_ENV === "production" && ADMIN_JWT_SECRET === DEV_SECRET) {
  console.error(
    "[adminAuth] FATAL: ADMIN_JWT_SECRET is not set. Set it in the admin service's Railway environment variables before deploying."
  );
  process.exit(1);
}

const ADMIN_TOKEN_TTL = "8h";

export function signAdminToken(userId) {
  return jwt.sign({ sub: userId, aud: "admin" }, ADMIN_JWT_SECRET, {
    expiresIn: ADMIN_TOKEN_TTL,
  });
}

/**
 * Express middleware: requires a valid admin-audience Bearer token, then
 * re-checks the account's current role and suspended status on every request
 * (a role downgrade or suspension takes effect immediately, not after the
 * 8h token expires). Sets req.userId.
 */
export async function requireAdminAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not signed in." });

  let payload;
  try {
    payload = jwt.verify(token, ADMIN_JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }
  if (payload.aud !== "admin") {
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }

  try {
    const user = await findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: "Account not found." });
    if (user.suspended) return res.status(403).json({ error: "This account has been suspended." });
    if ((user.role || "user") !== "admin") {
      return res.status(403).json({ error: "Admin access required." });
    }
    req.userId = payload.sub;
    next();
  } catch (e) {
    console.error("[adminAuth] requireAdminAuth status check failed:", e);
    return res.status(503).json({ error: "Service temporarily unavailable. Please try again." });
  }
}
