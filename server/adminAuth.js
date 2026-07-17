// Admin-scoped JWT: a deliberately separate token type from server/auth.js's
// consumer JWT — different secret, different audience claim, shorter expiry.
// A leaked consumer token can never authenticate against the admin service
// (wrong secret entirely) and a leaked admin token expires within hours.
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { findUserById } from "./repo.js";

const DEV_SECRET = "vybe-admin-dev-secret-change-me";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || DEV_SECRET;

// Fail CLOSED unless explicitly in local dev / test — see the matching rationale
// in server/auth.js. NODE_ENV isn't guaranteed to be "production" at runtime, so
// a `=== "production"` gate would let the admin service boot on the hardcoded
// DEV_SECRET when NODE_ENV is unset, making every admin token forgeable.
const IS_DEV_OR_TEST =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
if (!IS_DEV_OR_TEST && (!process.env.ADMIN_JWT_SECRET || ADMIN_JWT_SECRET === DEV_SECRET)) {
  console.error(
    "[adminAuth] FATAL: ADMIN_JWT_SECRET must be set to a strong, non-default value before deploying. " +
      "Set it in the admin service's environment variables (or export NODE_ENV=development for local dev)."
  );
  process.exit(1);
}

// Admin login: a single shared password (bcrypt-hashed at rest, never stored
// or logged in plaintext). ADMIN_PASSWORD_HASH is generated once with
// bcrypt.hashSync(password, 12) and set as a Railway env var — the plaintext
// password never touches source control or the database.
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || null;

if (!IS_DEV_OR_TEST && !ADMIN_PASSWORD_HASH) {
  console.error(
    "[adminAuth] FATAL: ADMIN_PASSWORD_HASH is not set. Set it in the admin service's environment variables before deploying."
  );
  process.exit(1);
}

/**
 * Constant-time (bcrypt) check against the shared admin password. Returns
 * false (never throws) if ADMIN_PASSWORD_HASH isn't configured, so a
 * misconfigured deploy fails closed instead of open.
 */
export function verifyAdminPassword(plain) {
  if (!ADMIN_PASSWORD_HASH || typeof plain !== "string" || !plain) return false;
  return bcrypt.compareSync(plain, ADMIN_PASSWORD_HASH);
}

const ADMIN_TOKEN_TTL = "8h";

export function signAdminToken(userId, tokenVersion = 0) {
  return jwt.sign({ sub: userId, aud: "admin", tv: tokenVersion }, ADMIN_JWT_SECRET, {
    expiresIn: ADMIN_TOKEN_TTL,
  });
}

/**
 * Express middleware: requires a valid admin-audience Bearer token, then
 * re-checks the account's current role, suspended status, and token_version
 * on every request — a role downgrade, suspension, or explicit revocation
 * (bumping token_version) takes effect immediately, not after the 8h token
 * expires. Reuses the same users.token_version column server/auth.js's
 * consumer JWT already uses; the shared admin password never touches this
 * column, so it's purely a manual revoke lever (bump it from the Users tab
 * to force every existing admin session to re-authenticate). Sets req.userId.
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
    if ((payload.tv ?? 0) !== (user.token_version ?? 0)) {
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
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
