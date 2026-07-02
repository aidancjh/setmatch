import { describe, it, expect, vi } from "vitest";
import { h } from "../server/lib/asyncHandler.js";

describe("asyncHandler h()", () => {
  it("returns a 500 JSON error when the wrapped handler rejects", async () => {
    const req = {};
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const failing = h(async () => {
      throw new Error("boom");
    });
    await failing(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Something went wrong on the server." });
  });

  it("does nothing extra when the wrapped handler resolves", async () => {
    const req = {};
    const res = { status: vi.fn(), json: vi.fn() };
    const ok = h(async (_req, r) => {
      r.json({ done: true });
    });
    await ok(req, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ done: true });
  });
});
