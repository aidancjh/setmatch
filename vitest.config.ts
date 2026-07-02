import { defineConfig } from "vitest/config";

// Standalone Vitest config (does NOT extend vite.config.ts, so the PWA/React
// plugins don't run during tests). All tests are pure logic + supertest, so a
// Node environment is enough.
//
// `env` is applied before test modules load, so importing server/index.js is
// safe: NODE_ENV=test skips auto-start, and the dummy DATABASE_URL points at an
// unreachable local address — any accidental query fails instead of touching a
// real database. The pg Pool is lazy, so merely importing never connects.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{js,ts}"],
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test-secret-not-for-production",
      ADMIN_JWT_SECRET: "test-admin-secret-not-for-production",
      // Falls back to an unreachable dummy so pure-logic tests never touch a DB.
      // To run the DB-gated tests (e.g. tests/join-race.test.js) point this at a
      // throwaway Postgres and set RUN_DB_TESTS=1.
      DATABASE_URL:
        process.env.DATABASE_URL ||
        "postgresql://test:test@127.0.0.1:5432/coterie_test_unused",
      APP_URL: "http://localhost:5173",
    },
  },
});
