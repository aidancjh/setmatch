// Minimal PostHog wiring — no npm dependency. Injects the official inline
// snippet (client-side, public write-only project key) and exposes a tiny
// capture() wrapper. No-ops entirely if VITE_POSTHOG_KEY isn't set (e.g.
// local dev), so nothing breaks without it.
declare global {
  interface Window {
    posthog?: {
      init: (key: string, opts?: Record<string, unknown>) => void;
      capture: (event: string, props?: Record<string, unknown>) => void;
      opt_out_capturing: () => void;
    };
  }
}

let initialized = false;

// onReady fires once PostHog has loaded and captured the initial pageview (so
// the caller can safely mutate the URL afterwards without losing utm params).
// It ALSO fires immediately when PostHog is disabled (no key / SSR) so callers
// never hang waiting for an init that will never happen.
export function initPostHog(onReady?: () => void) {
  if (initialized) return;
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key || typeof window === "undefined") {
    onReady?.();
    return;
  }
  initialized = true;

  // Official PostHog JS snippet (loads posthog-js from their CDN, then calls
  // init once loaded). Kept inline rather than an npm dependency to match
  // this repo's minimal client-dependency footprint.
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://us-assets.i.posthog.com/static/array.js";
  script.onload = () => {
    window.posthog?.init(key, {
      api_host: "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: true,
      // `loaded` runs after init completes and the auto pageview (which reads
      // utm_source off the live URL) has been captured — the safe moment to let
      // the caller clean the address bar.
      loaded: () => {
        maybeOptOut();
        onReady?.();
      },
    });
  };
  // If the CDN script is blocked (ad blocker) it never loads or captures — let
  // the caller proceed so the URL still gets tidied.
  script.onerror = () => onReady?.();
  document.head.appendChild(script);
}

// One-time device opt-out: visiting with ?ph_optout=1 calls PostHog's own
// opt_out_capturing(), which persists in this browser (localStorage) so it's
// never tracked again — no need to revisit the link or append the param each
// time. Runs after the initial pageview is captured, so that one visit still
// counts; every visit after is excluded. Strips the param from the address
// bar afterwards so a bookmarked/shared link looks like a normal URL.
function maybeOptOut() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("ph_optout") !== "1") return;
  window.posthog?.opt_out_capturing();
  url.searchParams.delete("ph_optout");
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

export function captureEvent(name: string) {
  window.posthog?.capture(name);
}
