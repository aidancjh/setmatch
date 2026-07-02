// tests/dbPool.test.js
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("db pool size", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("defaults to pg's default pool size when DB_POOL_MAX is unset", async () => {
    delete process.env.DB_POOL_MAX;
    const { pool } = await import("../server/db.js");
    expect(pool.options.max).toBe(10);
  });

  it("respects DB_POOL_MAX when set", async () => {
    process.env.DB_POOL_MAX = "5";
    const { pool } = await import("../server/db.js");
    expect(pool.options.max).toBe(5);
    delete process.env.DB_POOL_MAX;
  });
});
