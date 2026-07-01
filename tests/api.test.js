import { describe, it, expect, vi } from "vitest";
import request from "supertest";

// requireAuth now does one indexed lookup to confirm the account isn't suspended
// or revoked. Stub the data layer so the middleware resolves without a real DB;
// every assertion still returns at validation, never exercising business queries.
vi.mock("../server/db.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    query: async () => ({ rows: [{ suspended: false, token_version: 0 }] }),
  };
});

const { app } = await import("../server/index.js");
const { signToken } = await import("../server/auth.js");

// These tests exercise the middleware + validation wiring only. Assertions return
// at auth rejection or input validation — they never reach business-logic queries.
describe("auth & validation middleware (no DB access)", () => {
  it("rejects signup with an invalid email (400)", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "nope", password: "abcdefghij", name: "Test" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid email/i);
  });

  it("rejects signup with a too-short password (400)", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({ email: "player@example.com", password: "short", name: "Test" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/10 characters/i);
  });

  it("400s forgot-password with an invalid email (zod)", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({ email: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid email/i);
  });

  it("400s reset-password with a too-short password (zod)", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "abc", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/10 characters/i);
  });

  it("401s GET /api/auth/me without a token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("401s POST /api/games without a token", async () => {
    const res = await request(app).post("/api/games").send({});
    expect(res.status).toBe(401);
  });

  it("400s POST /api/games with a valid token but invalid body", async () => {
    const token = signToken("user_test_only");
    const res = await request(app)
      .post("/api/games")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "" });
    expect(res.status).toBe(400);
  });

  it("returns a JSON 404 for unknown /api routes", async () => {
    const res = await request(app).get("/api/this/route/does/not/exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});
