import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

vi.mock("../server/adminAuth.js", () => ({
  // Bypass real auth for these route-shape tests; auth itself is covered by
  // tests/adminAuth.test.js.
  requireAdminAuth: (req, _res, next) => {
    req.userId = "admin_1";
    next();
  },
}));

vi.mock("../server/repo.js", () => ({
  adminStats: vi.fn().mockResolvedValue({ users: 10, games: 3 }),
  getWaitlistCount: vi.fn().mockResolvedValue(7),
  getWaitlistCountsBySource: vi.fn().mockResolvedValue([
    { source: "instagram", count: 5 },
    { source: "direct", count: 2 },
  ]),
  logAdminAction: vi.fn().mockResolvedValue(undefined),
  findUserById: vi.fn(),
  publicUser: vi.fn(),
}));

vi.mock("../server/posthog.js", () => ({
  queryWaitlistFunnel: vi.fn().mockResolvedValue({ visits: 100, started: 40, submittedPosthog: 25 }),
  queryWaitlistVisitsBySource: vi.fn().mockResolvedValue([
    { source: "instagram", visits: 60 },
    { source: "direct", visits: 40 },
  ]),
}));

describe("adminRoutes", () => {
  let app;
  beforeEach(async () => {
    vi.clearAllMocks();
    const { default: adminRoutes } = await import("../server/adminRoutes.js");
    app = express();
    app.use(express.json());
    app.use("/api/admin", adminRoutes);
  });

  it("GET /api/admin/whoami returns the current admin's public profile", async () => {
    const repo = await import("../server/repo.js");
    repo.findUserById = vi.fn().mockResolvedValue({ id: "admin_1", name: "Ada", email: "ada@example.com", role: "admin" });
    repo.publicUser = vi.fn((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }));
    const res = await request(app).get("/api/admin/whoami");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "admin_1", name: "Ada", email: "ada@example.com", role: "admin" });
  });

  it("GET /api/admin/stats returns repo.adminStats()", async () => {
    const res = await request(app).get("/api/admin/stats");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ users: 10, games: 3 });
  });

  it("GET /api/admin/analytics/funnel combines PostHog counts with the DB waitlist count and computes rates", async () => {
    const res = await request(app).get("/api/admin/analytics/funnel");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      visits: 100,
      started: 40,
      submittedDb: 7,
      submittedPosthog: 25,
      startedRate: 40, // 40/100 * 100
      submittedRate: 7, // 7/100 * 100
      bySource: [
        { source: "instagram", count: 5, percent: 71.4 }, // 5/7
        { source: "direct", count: 2, percent: 28.6 }, // 2/7
      ],
      visitsBySource: [
        { source: "instagram", count: 60, percent: 60 }, // 60/100
        { source: "direct", count: 40, percent: 40 }, // 40/100
      ],
    });
  });

  it("GET /api/admin/analytics/funnel returns zero rates when there are no visits (no divide-by-zero)", async () => {
    const posthog = await import("../server/posthog.js");
    posthog.queryWaitlistFunnel.mockResolvedValueOnce({ visits: 0, started: 0, submittedPosthog: 0 });
    const repo = await import("../server/repo.js");
    repo.getWaitlistCount.mockResolvedValueOnce(0);

    const res = await request(app).get("/api/admin/analytics/funnel");
    expect(res.status).toBe(200);
    expect(res.body.startedRate).toBe(0);
    expect(res.body.submittedRate).toBe(0);
  });
});
