import { describe, it, expect } from "vitest";
import {
  loginLimiter,
  signupLimiter,
  authLimiter,
  apiLimiter,
  contentLimiter,
  waitlistLimiter,
} from "../server/middleware/rateLimiters.js";

describe("rateLimiters", () => {
  it("exports all six limiters as middleware functions", () => {
    for (const limiter of [
      loginLimiter,
      signupLimiter,
      authLimiter,
      apiLimiter,
      contentLimiter,
      waitlistLimiter,
    ]) {
      expect(typeof limiter).toBe("function");
    }
  });
});
