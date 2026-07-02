// Server-side PostHog query — uses the private Personal API Key, never the
// public client-side project token. Counts, over the last 30 days:
//   visits    — $pageview events on /waitlist
//   started   — custom "waitlist_email_started" events (first keystroke)
//   submittedPosthog — custom "waitlist_signup" events (client-fired on success)
// submittedPosthog is informational only; the admin route treats the app's
// own `waitlist` table count as the source of truth for actual submissions
// (PostHog can undercount due to ad blockers / consent declines).
const POSTHOG_HOST = process.env.POSTHOG_HOST || "https://us.posthog.com";

const FUNNEL_QUERY = `
  SELECT
    countIf(event = '$pageview' AND properties.$pathname = '/waitlist') AS visits,
    countIf(event = 'waitlist_email_started') AS started,
    countIf(event = 'waitlist_signup') AS submitted
  FROM events
  WHERE timestamp > now() - INTERVAL 30 DAY
`;

export async function queryWaitlistFunnel() {
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
      query: { kind: "HogQLQuery", query: FUNNEL_QUERY },
    }),
  });

  if (!res.ok) {
    throw new Error(`PostHog query failed (${res.status})`);
  }
  const data = await res.json();
  const row = data.results && data.results[0];
  if (!row) throw new Error("PostHog query failed: no results returned.");

  const [visits, started, submittedPosthog] = row;
  return { visits, started, submittedPosthog };
}
