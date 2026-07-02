import { describe, it, expect, vi } from "vitest";
import request from "supertest";

vi.mock("../server/db.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, query: async () => ({ rows: [] }) };
});

const { app } = await import("../server/admin-server.js");

describe("admin-server (no DB access)", () => {
  it("protects /api/admin/* — 401 without a token", async () => {
    const res = await request(app).get("/api/admin/stats");
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/google redirects to Google's OAuth endpoint", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    const res = await request(app).get("/api/auth/google");
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/accounts\.google\.com/);
  });

  it("returns a JSON 404 for unknown /api routes", async () => {
    const res = await request(app).get("/api/this/route/does/not/exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });
});
