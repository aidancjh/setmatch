import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../server/index.js";
import { signToken } from "../server/auth.js";

// These tests exercise the middleware + validation wiring only. Every assertion
// below returns BEFORE any database call (auth rejection or input validation),
// so they never touch a real DB even though the pg Pool exists.
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
