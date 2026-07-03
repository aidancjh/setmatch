// Server-side PostHog query — uses the private Personal API Key, never the
// public client-side project token. Counts, over the last 30 days:
//   visits    — $pageview events on /waitlist
//   started   — custom "waitlist_email_started" events (first keystroke)
//   submittedPosthog — custom "waitlist_signup" events (client-fired on success)
// submittedPosthog is informational only; the admin route treats the app's
// own `waitlist` table count as the source of truth for actual submissions
// (PostHog can undercount due to ad blockers / consent declines).
const POSTHOG_HOST = process.env.POSTHOG_HOST || "https://us.posthog.com";

// Column order must match the destructuring order in queryWaitlistFunnel: [visits, started, submittedPosthog]
const FUNNEL_QUERY = `
  SELECT
    countIf(event = '$pageview' AND properties.$pathname = '/waitlist') AS visits,
    countIf(event = 'waitlist_email_started') AS started,
    countIf(event = 'waitlist_signup') AS submitted
  FROM events
  WHERE timestamp > now() - INTERVAL 30 DAY
`;

// Page visits on /waitlist grouped by the utm_source that was on the URL when
// PostHog captured the pageview (empty / missing → 'direct'). This is the only
// reliable source for per-channel *visit* counts: the waitlist page is a static
// SPA view, so visits never hit our own API — only PostHog sees them.
const VISITS_BY_SOURCE_QUERY = `
  SELECT
    coalesce(nullIf(properties.utm_source, ''), 'direct') AS source,
    count() AS visits
  FROM events
  WHERE event = '$pageview'
    AND properties.$pathname = '/waitlist'
    AND timestamp > now() - INTERVAL 30 DAY
  GROUP BY source
  ORDER BY visits DESC
`;

// Thin wrapper around the PostHog HogQL query endpoint. Throws if PostHog isn't
// configured or the request fails; callers decide how to surface that.
async function runHogQL(query) {
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!projectId || !apiKey) {
    throw new Error("PostHog is not configured (POSTHOG_PROJECT_ID / POSTHOG_PERSONAL_API_KEY missing).");
  }

  const res = await fetch(`${POSTHOG_HOST}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: { kind: "HogQLQuery", query },
    }),
  });

  if (!res.ok) {
    throw new Error(`PostHog query failed (${res.status})`);
  }
  return res.json();
}

export async function queryWaitlistFunnel() {
  const data = await runHogQL(FUNNEL_QUERY);
  const row = data.results && data.results[0];
  if (!row) throw new Error("PostHog query failed: no results returned.");
  if (!Array.isArray(row) || row.length !== 3) {
    throw new Error("PostHog query failed: unexpected result shape.");
  }

  const [visits, started, submittedPosthog] = row;
  return { visits, started, submittedPosthog };
}

/** Visit counts grouped by utm_source, most visits first: [{ source, visits }]. */
export async function queryWaitlistVisitsBySource() {
  const data = await runHogQL(VISITS_BY_SOURCE_QUERY);
  const rows = Array.isArray(data.results) ? data.results : [];
  return rows
    .filter((r) => Array.isArray(r) && r.length === 2)
    .map(([source, visits]) => ({
      source: typeof source === "string" && source !== "" ? source : "direct",
      visits: Number(visits) || 0,
    }));
}
