/**
 * Build an absolute URL into the consumer app (coterie.com.de) from the admin
 * app. The admin SPA has no client-side router — pages like /user/:id and
 * /game/:id live only in the consumer app, so admin links to them must be
 * full cross-origin anchors, opened on the consumer domain.
 *
 * Origin resolution: VITE_CONSUMER_ORIGIN env override first, then derive by
 * stripping the "admin." prefix from the current hostname
 * (admin.coterie.com.de -> coterie.com.de), falling back to the local dev
 * consumer server when running the admin app on localhost.
 */
export function consumerUrl(path: string): string {
  const override = import.meta.env.VITE_CONSUMER_ORIGIN as string | undefined;
  if (override) return `${override.replace(/\/$/, "")}${path}`;

  const host = window.location.hostname;
  if (host.startsWith("admin.")) {
    return `${window.location.protocol}//${host.slice("admin.".length)}${path}`;
  }
  if (host === "localhost" || host === "127.0.0.1") {
    return `http://localhost:5173${path}`;
  }
  // Same-origin fallback (e.g. the *.up.railway.app URL) — better a wrong-
  // origin link than a crash; the consumer origin can't be derived here.
  return path;
}
