// HTML email templates + Resend sends, plus the small formatting helpers they
// (and a couple of non-email routes) share. One-directional dependency: this
// module never imports from index.js.
import * as Sentry from "@sentry/node";

// Sender address for transactional email. Defaults to Resend's shared sandbox
// domain (works for testing but is spam-prone and rate-limited). Once you've
// verified your own domain in Resend, set MAIL_FROM, e.g.
//   MAIL_FROM="Vybe <hello@coterie.com.de>"
export const MAIL_FROM = process.env.MAIL_FROM || "Vybe <onboarding@resend.dev>";

export function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function prettyTime(t) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function calDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${days[date.getUTCDay()]}, ${months[m - 1]} ${d}`;
}

/** Send the password-reset email. No-ops (logged) if RESEND_API_KEY is unset. */
export async function sendPasswordResetEmail(user, resetLink) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("[auth] RESEND_API_KEY not set — skipping reset email");
    return;
  }
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [user.email],
      subject: "Reset your Vybe password",
      html: `<p>Hi ${esc(user.name)},</p>
             <p>You requested a password reset.</p>
             <p><a href="${resetLink}" style="background:#E8734A;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-family:sans-serif;">Reset password</a></p>
             <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
             <p>— The Vybe team</p>`,
    }),
  });
}

/**
 * Fire-and-forget: send the "you're in" confirmation email for a joined game.
 * Not awaited by the caller — matches the route's existing behavior exactly.
 * calLink is precomputed by the caller (buildGCalUrl stays in index.js until
 * the games domain moves in Phase 2) and passed straight through.
 */
export function sendJoinConfirmationEmail({ user, game, appUrl, calLink }) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping join confirmation email");
    return;
  }
  const timeDisplay = game.endTime
    ? `${prettyTime(game.time)} – ${prettyTime(game.endTime)}`
    : prettyTime(game.time);
  const brand = "#E8734A";
  const row = (label, value) =>
    `<tr><td style="padding:6px 0;font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:#9ca3af;">${label}</td>` +
    `<td style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${value}</td></tr>`;
  const emailHtml = [
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>`,
    `<body style="margin:0;padding:24px 16px;background:#f5ede3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">`,
    `<div style="max-width:460px;margin:0 auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">`,
    `<div style="text-align:center;padding:28px 32px 0;">`,
    `<div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:${brand};border-radius:50%;font-size:26px;color:#fff;">&#10003;</div>`,
    `</div>`,
    `<div style="text-align:center;padding:12px 32px 0;">`,
    `<h1 style="margin:0;font-size:32px;font-weight:800;color:#111827;">You're In!</h1>`,
    `<p style="margin:8px 0 0;font-size:14px;color:#6b7280;">Hi ${esc(user.name)}, your spot for <strong style="color:#374151;">${esc(game.title)}</strong> is confirmed.</p>`,
    `</div>`,
    `<div style="margin:20px 32px 0;height:1px;background:#f3f4f6;"></div>`,
    `<div style="padding:16px 32px 0;"><table style="width:100%;border-collapse:collapse;">`,
    row("Date", calDate(game.date)),
    row("Time", timeDisplay),
    row("Location", esc(game.location)),
    game.costPerPerson > 0 ? row("Cost", `$${game.costPerPerson} per person`) : "",
    `</table></div>`,
    game.notes ? `<div style="margin:12px 32px 0;background:#f9fafb;border-radius:12px;padding:12px 16px;font-size:13px;color:#4b5563;line-height:1.6;">${esc(game.notes)}</div>` : "",
    `<div style="padding:20px 32px 8px;">`,
    `<a href="${calLink}" style="display:block;background:${brand};color:#fff;text-decoration:none;text-align:center;padding:15px;border-radius:12px;font-size:15px;font-weight:700;">Add to Google Calendar</a>`,
    `</div>`,
    `<div style="padding:0 32px 24px;">`,
    `<a href="${appUrl}/game/${game.id}" style="display:block;border:1.5px solid #e5e7eb;color:#374151;text-decoration:none;text-align:center;padding:13px;border-radius:12px;font-size:14px;font-weight:500;">View Game Details</a>`,
    `</div>`,
    `<p style="text-align:center;padding:0 0 20px;margin:0;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#d1d5db;">VYBE</p>`,
    `</div></body></html>`,
  ].join("");
  console.log(`[email] sending join confirmation to ${user.email} for "${game.title}"`);
  fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [user.email],
      subject: `You're in: ${game.title}`,
      html: emailHtml,
    }),
  }).then((r) => {
    if (r.ok) {
      console.log(`[email] delivered OK to ${user.email}`);
    } else {
      r.text().then((t) => {
        console.error(`[email] Resend error ${r.status}:`, t);
        Sentry.captureMessage(`Resend join-email failed (${r.status}): ${t}`, "error");
      });
    }
  }).catch((e) => {
    console.error("[email] network error:", e);
    Sentry.captureException(e);
  });
}
