import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("posthog.queryWaitlistFunnel", () => {
  beforeEach(() => {
    process.env.POSTHOG_PROJECT_ID = "494538";
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_test_key";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.POSTHOG_PROJECT_ID;
    delete process.env.POSTHOG_PERSONAL_API_KEY;
  });

  it("calls the PostHog Query API with the project id, bearer key, and a HogQL body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [[120, 45, 30]] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { queryWaitlistFunnel } = await import("../server/posthog.js");
    const result = await queryWaitlistFunnel();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://us.posthog.com/api/projects/494538/query/");
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBe("Bearer phx_test_key");
    const body = JSON.parse(opts.body);
    expect(body.query.kind).toBe("HogQLQuery");
    expect(body.query.query).toMatch(/FROM events/i);

    expect(result).toEqual({ visits: 120, started: 45, submittedPosthog: 30 });
  });

  it("throws when PostHog responds non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    );
    const { queryWaitlistFunnel } = await import("../server/posthog.js");
    await expect(queryWaitlistFunnel()).rejects.toThrow(/PostHog query failed/);
  });
});
