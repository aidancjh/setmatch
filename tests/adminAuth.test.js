import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

vi.mock("../server/repo.js", () => ({
  findUserById: vi.fn(),
}));

const ADMIN_SECRET = "test-admin-secret-not-for-production";

describe("adminAuth", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ADMIN_JWT_SECRET = ADMIN_SECRET;
  });

  it("signAdminToken produces a token with aud=admin and an 8h expiry", async () => {
    const { signAdminToken } = await import("../server/adminAuth.js");
    const token = signAdminToken("user_1");
    const payload = jwt.verify(token, ADMIN_SECRET);
    expect(payload.sub).toBe("user_1");
    expect(payload.aud).toBe("admin");
    const ttlSeconds = payload.exp - payload.iat;
    expect(ttlSeconds).toBe(8 * 60 * 60);
  });

  it("requireAdminAuth rejects a request with no token (401)", async () => {
    const { requireAdminAuth } = await import("../server/adminAuth.js");
    const req = { headers: {} };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await requireAdminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireAdminAuth rejects a consumer-style token signed with a different secret (401)", async () => {
    const { requireAdminAuth } = await import("../server/adminAuth.js");
    const wrongToken = jwt.sign({ sub: "user_1", tv: 0 }, "some-other-secret");
    const req = { headers: { authorization: `Bearer ${wrongToken}` } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await requireAdminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireAdminAuth rejects a valid admin-secret token whose account role isn't admin (403)", async () => {
    const repo = await import("../server/repo.js");
    repo.findUserById.mockResolvedValue({ id: "user_2", role: "user", suspended: false });
    const { signAdminToken, requireAdminAuth } = await import("../server/adminAuth.js");
    const token = signAdminToken("user_2");
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await requireAdminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireAdminAuth sets req.userId and calls next() for a valid admin", async () => {
    const repo = await import("../server/repo.js");
    repo.findUserById.mockResolvedValue({ id: "user_3", role: "admin", suspended: false });
    const { signAdminToken, requireAdminAuth } = await import("../server/adminAuth.js");
    const token = signAdminToken("user_3");
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await requireAdminAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe("user_3");
  });
});
