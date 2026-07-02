// Minimal PostHog wiring — no npm dependency. Injects the official inline
// snippet (client-side, public write-only project key) and exposes a tiny
// capture() wrapper. No-ops entirely if VITE_POSTHOG_KEY isn't set (e.g.
// local dev), so nothing breaks without it.
declare global {
  interface Window {
    posthog?: {
      init: (key: string, opts?: Record<string, unknown>) => void;
      capture: (event: string, props?: Record<string, unknown>) => void;
    };
  }
}

let initialized = false;

export function initPostHog() {
  if (initialized) return;
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key || typeof window === "undefined") return;
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
    });
  };
  document.head.appendChild(script);
}

export function captureEvent(name: string) {
  window.posthog?.capture(name);
}
