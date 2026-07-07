// Server-side PostHog query — uses the private Personal API Key, never the
// public client-side project token.
//   visits    — $pageview events on /waitlist
//   started   — custom "waitlist_email_started" events (first keystroke)
//   submittedPosthog — custom "waitlist_signup" events (client-fired on success)
// submittedPosthog is informational only; the admin route treats the app's
// own `waitlist` table count as the source of truth for actual submissions
// (PostHog can undercount due to ad blockers / consent declines).
const POSTHOG_HOST = process.env.POSTHOG_HOST || "https://us.posthog.com";

// Everything before launch day (dev/QA traffic) is real but not meaningful to
// show next to real launch traffic, so every PostHog-sourced metric here is
// scoped to "since launch" — LAUNCH_DATE (UTC) onward. Deliberately asymmetric
// with the DB-backed signup metrics in repo.js (getWaitlistCount /
// getWaitlistCountsBySource / getWaitlistSignupsByDay), which stay all-time on
// purpose: those are real people already on the list, and resetting them would
// just hide them from the admin, not the database.
const LAUNCH_DATE = "2026-07-04";
const SINCE_LAUNCH = `timestamp >= toDateTime('${LAUNCH_DATE} 00:00:00', 'UTC')`;

// A capture bug (fixed 2026-07-05, see git history on server/posthog.js) meant
// every pageview shipped with no utm_source at all, regardless of the real
// link clicked — so pre-fix events can't be trusted for *source attribution*
// specifically, even the "direct" bucket (it doesn't mean "no tag was on the
// link", it means "we failed to read whatever tag was there"). The by-source
// breakdown alone uses this later cutoff; total visit counts and the
// pageviews-over-time chart aren't affected by the bug and keep using
// SINCE_LAUNCH above.
const UTM_FIX_DATE = "2026-07-05 02:40:00";
const SINCE_UTM_FIX = `timestamp >= toDateTime('${UTM_FIX_DATE}', 'UTC')`;

// Column order must match the destructuring order in queryWaitlistFunnel: [visits, started, submittedPosthog]
// Visits also exclude ?utm_source=test — the same private bucket the DB-backed
// signup queries already exclude — so testing from your own device doesn't
// skew the real numbers. Visit https://coterie.com.de/waitlist?utm_source=test
// from your own browser to keep your pageviews out of this count.
const FUNNEL_QUERY = `
  SELECT
    countIf(event = '$pageview' AND properties.$pathname = '/waitlist' AND coalesce(properties.utm_source, '') != 'test' AND ${SINCE_LAUNCH}) AS visits,
    countIf(event = 'waitlist_email_started' AND ${SINCE_LAUNCH}) AS started,
    countIf(event = 'waitlist_signup' AND ${SINCE_LAUNCH}) AS submitted
  FROM events
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
    AND ${SINCE_UTM_FIX}
  GROUP BY source
  ORDER BY visits DESC
`;

// Daily pageview counts on /waitlist, since launch. Grouped by UTC calendar day
// to match repo.getWaitlistSignupsByDay(); the admin route zero-fills both
// series onto one shared date axis. Returns only days that had at least one
// pageview. Excludes the 'test' utm_source bucket, same as FUNNEL_QUERY's
// visits count.
const VISITS_BY_DAY_QUERY = `
  SELECT toDate(timestamp) AS day, count() AS visits
  FROM events
  WHERE event = '$pageview'
    AND properties.$pathname = '/waitlist'
    AND coalesce(properties.utm_source, '') != 'test'
    AND ${SINCE_LAUNCH}
  GROUP BY day
  ORDER BY day
`;

// Normalises whatever date representation HogQL returns (string or object) to
// a plain "YYYY-MM-DD" string.
function toDateString(value) {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Thin wrapper around the PostHog HogQL query endpoint. Throws if PostHog isn't
// configured or the request fails; callers decide how to surface that (the
// admin funnel route degrades gracefully rather than 500ing). Transient
// failures (PostHog cold start / gateway blip — 429/502/503/504) are retried
// with backoff before giving up, since these clear themselves within a
// second or two in practice (a manual refresh was enough to fix it).
async function runHogQL(query) {
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!projectId || !apiKey) {
    throw new Error("PostHog is not configured (POSTHOG_PROJECT_ID / POSTHOG_PERSONAL_API_KEY missing).");
  }

  let lastStatus;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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

    if (res.ok) return res.json();

    lastStatus = res.status;
    if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
      await sleep(500 * (attempt + 1));
      continue;
    }
    throw new Error(`PostHog query failed (${res.status})`);
  }
  throw new Error(`PostHog query failed (${lastStatus})`);
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

/**
 * Daily pageview counts on /waitlist, all-time, oldest first: [{ date, count }].
 * Only days with at least one pageview are returned; the admin route zero-fills
 * this onto the shared date axis it builds from the signup series.
 */
export async function queryWaitlistVisitsByDay() {
  const data = await runHogQL(VISITS_BY_DAY_QUERY);
  const rows = Array.isArray(data.results) ? data.results : [];
  return rows
    .filter((r) => Array.isArray(r) && r.length === 2)
    .map(([day, visits]) => ({ date: toDateString(day), count: Number(visits) || 0 }));
}
