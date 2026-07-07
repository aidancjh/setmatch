import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

vi.mock("../server/repo.js", () => ({
  findUserById: vi.fn(),
}));

const ADMIN_SECRET = "test-admin-secret-not-for-production";
// bcrypt hash of "test-admin-password-not-for-production" (cost 4 — matches vitest.config.ts).
const ADMIN_PASSWORD_HASH = "$2a$04$bdfehVzJBxP0H9L1gZxJeeoWoQBuutCoyxsFdYqOrRpyTvsNT64n2";

describe("adminAuth", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ADMIN_JWT_SECRET = ADMIN_SECRET;
    process.env.ADMIN_PASSWORD_HASH = ADMIN_PASSWORD_HASH;
  });

  it("signAdminToken produces a token with aud=admin, tv, and an 8h expiry", async () => {
    const { signAdminToken } = await import("../server/adminAuth.js");
    const token = signAdminToken("user_1", 2);
    const payload = jwt.verify(token, ADMIN_SECRET);
    expect(payload.sub).toBe("user_1");
    expect(payload.aud).toBe("admin");
    expect(payload.tv).toBe(2);
    const ttlSeconds = payload.exp - payload.iat;
    expect(ttlSeconds).toBe(8 * 60 * 60);
  });

  it("signAdminToken defaults tv to 0 when not passed", async () => {
    const { signAdminToken } = await import("../server/adminAuth.js");
    const token = signAdminToken("user_1");
    const payload = jwt.verify(token, ADMIN_SECRET);
    expect(payload.tv).toBe(0);
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
    repo.findUserById.mockResolvedValue({ id: "user_2", role: "user", suspended: false, token_version: 0 });
    const { signAdminToken, requireAdminAuth } = await import("../server/adminAuth.js");
    const token = signAdminToken("user_2", 0);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await requireAdminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireAdminAuth rejects a token whose tv no longer matches the account's token_version (revoked, 401)", async () => {
    const repo = await import("../server/repo.js");
    repo.findUserById.mockResolvedValue({ id: "user_4", role: "admin", suspended: false, token_version: 1 });
    const { signAdminToken, requireAdminAuth } = await import("../server/adminAuth.js");
    const token = signAdminToken("user_4", 0); // stale — DB now at token_version 1
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await requireAdminAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireAdminAuth sets req.userId and calls next() for a valid admin", async () => {
    const repo = await import("../server/repo.js");
    repo.findUserById.mockResolvedValue({ id: "user_3", role: "admin", suspended: false, token_version: 0 });
    const { signAdminToken, requireAdminAuth } = await import("../server/adminAuth.js");
    const token = signAdminToken("user_3", 0);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await requireAdminAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe("user_3");
  });

  describe("verifyAdminPassword", () => {
    it("returns true for the correct password", async () => {
      const { verifyAdminPassword } = await import("../server/adminAuth.js");
      expect(verifyAdminPassword("test-admin-password-not-for-production")).toBe(true);
    });

    it("returns false for an incorrect password", async () => {
      const { verifyAdminPassword } = await import("../server/adminAuth.js");
      expect(verifyAdminPassword("wrong-password")).toBe(false);
    });

    it("returns false for empty/non-string input without throwing", async () => {
      const { verifyAdminPassword } = await import("../server/adminAuth.js");
      expect(verifyAdminPassword("")).toBe(false);
      expect(verifyAdminPassword(undefined)).toBe(false);
    });

    it("fails closed (false) when ADMIN_PASSWORD_HASH isn't configured", async () => {
      delete process.env.ADMIN_PASSWORD_HASH;
      const { verifyAdminPassword } = await import("../server/adminAuth.js");
      expect(verifyAdminPassword("test-admin-password-not-for-production")).toBe(false);
    });
  });
});
