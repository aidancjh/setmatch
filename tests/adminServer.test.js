import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const ADMIN_USER = {
  id: "user_admin",
  email: "admin@example.com",
  role: "admin",
  suspended: false,
  token_version: 0,
};

vi.mock("../server/db.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, query: async () => ({ rows: [] }) };
});

vi.mock("../server/repo.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    findUserByEmail: vi.fn(async (email) => (email === ADMIN_USER.email ? ADMIN_USER : null)),
    logAdminAction: vi.fn(async () => {}),
  };
});

describe("admin-server (no DB access)", () => {
  it("protects /api/admin/* — 401 without a token", async () => {
    const { app } = await import("../server/admin-server.js");
    const res = await request(app).get("/api/admin/stats");
    expect(res.status).toBe(401);
  });

  it("returns a JSON 404 for unknown /api routes", async () => {
    const { app } = await import("../server/admin-server.js");
    const res = await request(app).get("/api/this/route/does/not/exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });

  describe("POST /api/auth/login", () => {
    // Each test re-imports admin-server.js after vi.resetModules() so it gets
    // a brand-new Express app — and crucially a brand-new adminLoginLimiter
    // in-memory store. Without this, failed attempts from one test would
    // carry over into the next and make the rate-limit test's count depend
    // on execution order.
    beforeEach(() => {
      vi.resetModules();
      vi.clearAllMocks();
    });

    it("issues an admin token for the correct password", async () => {
      const { app } = await import("../server/admin-server.js");
      const res = await request(app)
        .post("/api/auth/login")
        .send({ password: "test-admin-password-not-for-production" });
      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe("string");
    });

    it("rejects the wrong password (401), generic message", async () => {
      const { app } = await import("../server/admin-server.js");
      const res = await request(app).post("/api/auth/login").send({ password: "wrong" });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Incorrect password.");
    });

    it("rejects a missing password (400)", async () => {
      const { app } = await import("../server/admin-server.js");
      const res = await request(app).post("/api/auth/login").send({});
      expect(res.status).toBe(400);
    });

    it("rate-limits repeated failed attempts (429 after 5 failures)", async () => {
      const { app } = await import("../server/admin-server.js");
      for (let i = 0; i < 5; i++) {
        await request(app).post("/api/auth/login").send({ password: "wrong" });
      }
      const res = await request(app).post("/api/auth/login").send({ password: "wrong" });
      expect(res.status).toBe(429);
    });
  });
});
