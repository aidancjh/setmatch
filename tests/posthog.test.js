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

  it("throws when results array is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      })
    );
    const { queryWaitlistFunnel } = await import("../server/posthog.js");
    await expect(queryWaitlistFunnel()).rejects.toThrow(/PostHog query failed: no results returned/);
  });

  it("throws when result row has unexpected shape (wrong number of columns)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [[120, 45]] }),
      })
    );
    const { queryWaitlistFunnel } = await import("../server/posthog.js");
    await expect(queryWaitlistFunnel()).rejects.toThrow(/PostHog query failed: unexpected result shape/);
  });
});

describe("posthog.queryWaitlistVisitsBySource", () => {
  beforeEach(() => {
    process.env.POSTHOG_PROJECT_ID = "494538";
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_test_key";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.POSTHOG_PROJECT_ID;
    delete process.env.POSTHOG_PERSONAL_API_KEY;
  });

  it("maps grouped rows to { source, visits }, coalescing empty source to 'direct'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [["instagram", 60], ["", 40]] }),
      })
    );
    const { queryWaitlistVisitsBySource } = await import("../server/posthog.js");
    const result = await queryWaitlistVisitsBySource();
    expect(result).toEqual([
      { source: "instagram", visits: 60 },
      { source: "direct", visits: 40 },
    ]);
  });

  it("skips malformed rows and returns [] when there are no results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [["tiktok", 5], ["broken"], null] }),
      })
    );
    const { queryWaitlistVisitsBySource } = await import("../server/posthog.js");
    expect(await queryWaitlistVisitsBySource()).toEqual([{ source: "tiktok", visits: 5 }]);
  });

  it("throws when PostHog responds non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    );
    const { queryWaitlistVisitsBySource } = await import("../server/posthog.js");
    await expect(queryWaitlistVisitsBySource()).rejects.toThrow(/PostHog query failed/);
  });
});
