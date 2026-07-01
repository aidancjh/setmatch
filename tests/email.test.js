import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { esc, prettyTime, calDate, sendPasswordResetEmail } from "../server/email.js";

describe("esc", () => {
  it("escapes HTML-significant characters", () => {
    expect(esc(`<b>"Tom" & Jerry</b>`)).toBe("&lt;b&gt;&quot;Tom&quot; &amp; Jerry&lt;/b&gt;");
  });
});

describe("prettyTime", () => {
  it("formats a 24h time as 12h with AM/PM", () => {
    expect(prettyTime("18:30")).toBe("6:30 PM");
    expect(prettyTime("00:05")).toBe("12:05 AM");
    expect(prettyTime("12:00")).toBe("12:00 PM");
  });
});

describe("calDate", () => {
  it("formats an ISO date as weekday + month + day", () => {
    expect(calDate("2026-06-20")).toBe("Sat, Jun 20");
  });
});

describe("sendPasswordResetEmail", () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

  it("sends via Resend when RESEND_API_KEY is set", async () => {
    await sendPasswordResetEmail({ name: "Maria", email: "maria@example.com" }, "https://x/reset");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(opts.body);
    expect(body.to).toEqual(["maria@example.com"]);
    expect(body.html).toContain("Maria");
  });

  it("no-ops when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    await sendPasswordResetEmail({ name: "Maria", email: "maria@example.com" }, "https://x/reset");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
