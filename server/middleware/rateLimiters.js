// Central definitions for every express-rate-limit instance used across the
// API. Each future per-domain router imports exactly the limiters it needs
// (e.g. the auth router owns loginLimiter/signupLimiter). apiLimiter (global,
// applied to all of /api) and the maintenance-mode gate stay in index.js since
// they apply across every domain rather than belonging to one.
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// Login: only FAILED attempts count (skipSuccessfulRequests), so legitimate
// users — including several people behind one shared IP/NAT — are never blocked
// by simply signing in. Only repeated wrong-password attempts (the brute-force
// signature) trip it.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many failed login attempts — please wait 15 minutes and try again." },
});

// Signup: caps mass account creation per IP, but lenient enough for several
// people on the same network (e.g. testers on shared Wi-Fi).
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many sign-ups from this network — please try again later." },
});

// Password reset / forgot: sensitive and rarely used legitimately, so kept
// strict to prevent reset-email spam and token guessing.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts — please wait 15 minutes and try again." },
});

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — slow down." },
});

// Tighter per-user limiter for user-generated content (comments, chat) to
// curb spam. Keyed by the authenticated user id (these routes sit behind
// requireAuth), so it limits a person rather than a shared NAT/IP.
export const contentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
  message: { error: "You're posting too fast — please slow down." },
});

// Lenient per-IP cap: mobile carriers route many real users through a few
// shared IPs (CGNAT), so a strict limit would block genuine signups during a
// viral launch. The real bot defenses are the honeypot on the route itself
// (and a CAPTCHA if added) — this just stops one IP hammering the endpoint
// thousands of times.
export const waitlistLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many signups from this network — try again later." },
});

// The admin service is low-volume/trusted (a handful of admins, not the
// public), so this is tighter than the consumer app's apiLimiter — mainly a
// backstop against a runaway script or a compromised admin token, not normal
// traffic shaping.
export const adminApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — slow down." },
});
