// Shared Helmet config, used by both server/index.js (consumer app) and
// server/admin-server.js (admin app) so both get identical security headers.
export const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
      mediaSrc: ["'self'", "blob:", "https://res.cloudinary.com"],
      connectSrc: [
        "'self'",
        "https://api.cloudinary.com",
        "https://api.resend.com",
        "https://*.ingest.sentry.io",
        "https://*.ingest.us.sentry.io",
      ],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
};
