import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import {
  hashPassword,
  verifyPassword,
  signToken,
  requireAuth,
  optionalAuth,
  TIMING_HASH,
} from "../server/auth.js";

describe("password hashing", () => {
  it("verifies a correct password", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const hash = hashPassword("right-password-123");
    expect(verifyPassword("wrong-password-123", hash)).toBe(false);
  });

  it("salts: the same password hashes differently each time", () => {
    expect(hashPassword("samepass1234")).not.toBe(hashPassword("samepass1234"));
  });

  it("exposes a non-empty timing-attack sentinel hash", () => {
    expect(typeof TIMING_HASH).toBe("string");
    expect(TIMING_HASH.length).toBeGreaterThan(0);
    // Nothing should actually verify against the sentinel.
    expect(verifyPassword("anything", TIMING_HASH)).toBe(false);
  });
});

describe("JWT tokens", () => {
  it("encodes the user id as the subject", () => {
    const token = signToken("user_123");
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    expect(payload.sub).toBe("user_123");
  });

  it("produces tokens rejected by a different secret", () => {
    const token = signToken("user_123");
    expect(() => jwt.verify(token, "some-other-secret")).toThrow();
  });
});

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
  };
}

describe("requireAuth middleware", () => {
  it("401s when there is no Authorization header", () => {
    const res = mockRes();
    let nexted = false;
    requireAuth({ headers: {} }, res, () => {
      nexted = true;
    });
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("sets req.userId and calls next() for a valid token", () => {
    const token = signToken("user_abc");
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    let nexted = false;
    requireAuth(req, res, () => {
      nexted = true;
    });
    expect(nexted).toBe(true);
    expect(req.userId).toBe("user_abc");
  });

  it("401s for a malformed / tampered token", () => {
    const res = mockRes();
    let nexted = false;
    requireAuth({ headers: { authorization: "Bearer not.a.real.token" } }, res, () => {
      nexted = true;
    });
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});

describe("optionalAuth middleware", () => {
  it("continues with userId=null when no token is present", () => {
    const req = { headers: {} };
    let nexted = false;
    optionalAuth(req, {}, () => {
      nexted = true;
    });
    expect(nexted).toBe(true);
    expect(req.userId).toBe(null);
  });

  it("sets userId for a valid token", () => {
    const req = { headers: { authorization: `Bearer ${signToken("u_opt")}` } };
    let nexted = false;
    optionalAuth(req, {}, () => {
      nexted = true;
    });
    expect(nexted).toBe(true);
    expect(req.userId).toBe("u_opt");
  });
});
