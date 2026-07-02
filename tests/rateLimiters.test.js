import { describe, it, expect } from "vitest";
import {
  loginLimiter,
  signupLimiter,
  authLimiter,
  apiLimiter,
  contentLimiter,
  waitlistLimiter,
  adminApiLimiter,
} from "../server/middleware/rateLimiters.js";

describe("rateLimiters", () => {
  it("exports all seven limiters as middleware functions", () => {
    for (const limiter of [
      loginLimiter,
      signupLimiter,
      authLimiter,
      apiLimiter,
      contentLimiter,
      waitlistLimiter,
      adminApiLimiter,
    ]) {
      expect(typeof limiter).toBe("function");
    }
  });
});
