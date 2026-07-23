import { useEffect, useRef, useState } from "react";
import { SpikerSilhouette, DiggerSilhouette } from "../components/PlayerSilhouettes";
import { initPostHog, captureEvent } from "../lib/posthog";

// Mobile-only waitlist design ("app sheet"): a dark hero (headline + player
// art) over a white value sheet, sized like a phone card. Deliberately kept
// separate from WaitlistDesktop.tsx — see Waitlist.tsx for the breakpoint
// that picks between them — so this can be iterated on freely without any
// risk to the desktop design. Full-bleed on phone (most signups happen
// there); centered as a fixed-aspect card on wider screens so it always reads
// as the same composition instead of stretching. All sizes below are fixed px
// tuned at the card's native ~394px width — deliberate, since the card is
// capped at that width everywhere, so there's nothing to scale.

// Decorative "player" avatars rendered as self-contained inline SVG portraits.
// The design's originals were photos from a third-party host the production CSP
// blocks — these read as real profile pictures while making zero network
// requests (no external dependency, no privacy leak, no broken images).
const PLAYERS = [
  { bg: "#D9E9F7", skin: "#F1C7A2", hair: "#2A3648", shirt: "#3F8FDB" },
  { bg: "#DBEAF8", skin: "#C68642", hair: "#0F1622", shirt: "#0A58A4" },
  { bg: "#D3E5F6", skin: "#8D5524", hair: "#182131", shirt: "#7CB8ED" },
];

// FAQ content shown in the centered modal. Kept in sync with the desktop
// accordion (WaitlistDesktop.tsx) by hand — same three questions.
const FAQS = [
  {
    q: "Can I join if I'm a total beginner?",
    a: "Absolutely. Coterie is for players of every standard — even if you've never touched a volleyball before. We want to give everyone a chance to get on court and improve.",
  },
  {
    q: "Can I host my own game, or only join others?",
    a: "Both. You can host your own game if you manage to book a court, and invite friends to fill it. You can also jump into games other people have already hosted.",
  },
  {
    q: "Is there an app, or just this website?",
    a: "Coterie is a mobile app — this website is only for the waitlist. Join now and we'll let you know the moment the app is ready.",
  },
];

function PlayerAvatar({ p, i }: { p: (typeof PLAYERS)[number]; i: number }) {
  const cid = `wl-av-${i}`;
  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      style={{
        display: "block",
        width: 30,
        height: 30,
        borderRadius: "50%",
        marginLeft: i === 0 ? 0 : -9,
        border: "2.5px solid #FFF",
        boxShadow: "0 2px 6px rgba(13,20,30,0.14)",
      }}
    >
      <defs>
        <clipPath id={cid}>
          <circle cx="20" cy="20" r="20" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${cid})`}>
        <rect width="40" height="40" fill={p.bg} />
        <rect x="17" y="20" width="6" height="11" rx="3" fill={p.skin} />
        <ellipse cx="20" cy="40" rx="13.5" ry="9.5" fill={p.shirt} />
        <circle cx="20" cy="15.6" r="9.4" fill={p.hair} />
        <circle cx="20" cy="18" r="7.7" fill={p.skin} />
      </g>
    </svg>
  );
}

function FaqModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wl-faq-title"
      className="wl-faq-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="wl-faq-box">
        <button type="button" onClick={onClose} aria-label="Close" className="wl-faq-close">
          ×
        </button>
        <h2 id="wl-faq-title" style={{ margin: "0 26px 16px 0", fontSize: 18, fontWeight: 800, color: "#0F1B2D" }}>
          FAQ
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {FAQS.map((f, i) => (
            <div key={i}>
              <p style={{ margin: "0 0 5px", fontSize: 14, fontWeight: 700, color: "#0F1B2D" }}>{f.q}</p>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, color: "#5B6B7E", lineHeight: 1.5 }}>{f.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WaitlistMobile() {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // honeypot — humans leave this blank
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [faqOpen, setFaqOpen] = useState(false);

  // Attribution: read ?utm_source= once at first render and hold onto it, so
  // it's captured before the cleanup effect below wipes it from the address
  // bar. Sent with the signup; the backend validates it against its allowlist.
  const sourceRef = useRef<string | null>(null);
  if (sourceRef.current === null) {
    sourceRef.current =
      typeof window === "undefined"
        ? ""
        : new URLSearchParams(window.location.search).get("utm_source") || "";
  }

  // Initialize PostHog, then clean the URL. Order matters: PostHog captures the
  // pageview (reading utm_source off the live URL) asynchronously after its CDN
  // script loads, so we must NOT strip utm_* until it's ready — otherwise every
  // visit is recorded untagged and the per-source visit breakdown is empty.
  useEffect(() => {
    let cleaned = false;
    const cleanUrl = () => {
      if (cleaned) return;
      cleaned = true;
      const url = new URL(window.location.href);
      let changed = false;
      for (const key of [...url.searchParams.keys()]) {
        if (key.toLowerCase().startsWith("utm_")) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
      if (changed) {
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      }
    };
    initPostHog(cleanUrl); // clean once PostHog has captured the pageview
    const fallback = window.setTimeout(cleanUrl, 4000); // safety net if PostHog is slow/blocked
    return () => window.clearTimeout(fallback);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, company, source: sourceRef.current }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Something went wrong. Please try again.");
        setStatus("error");
      } else {
        setMessage(data.message || "You're on the list. We'll be in touch before launch.");
        setStatus("success");
        captureEvent("waitlist_signup");
      }
    } catch {
      setMessage("Something went wrong. Please check your connection and try again.");
      setStatus("error");
    }
  }

  const submitted = status === "success";

  return (
    <div
      className="wl-page"
      data-screen-label="Waitlist"
      style={{ fontFamily: "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&display=swap');
        .wl-page { min-height:100vh; min-height:100dvh; width:100%; background:#E8EEF5; display:flex; }
        .wl-card { position:relative; width:100%; min-height:100vh; min-height:100dvh; margin:0; background:#0A0F16; overflow:hidden; }
        @media (min-width:640px) {
          .wl-card { width:min(94vw,430px); min-height:0; height:min(860px,92dvh); margin:auto; border-radius:36px; box-shadow:0 30px 80px rgba(15,22,34,.28); }
        }
        /* Silhouette robustness: the text (header 64px tall, badge+headline
           anchored bottom:52px) is all fixed px, so the figures are anchored in
           fixed px to the SAME corners — the art-vs-text geometry is then
           identical on every device instead of %-sized art drifting against
           px text across aspect ratios (the bug reported on iPhone 16 Pro).
           The hero is a size container so the digger can adapt to the one
           thing that truly varies: the hero's height. */
        .wl-hero { position:absolute; top:0; left:0; right:0; height:47%; overflow:hidden; container-type:size;
                   background:linear-gradient(160deg, #1B2534 0%, #101724 55%, #0A0F16 100%); }
        .wl-glow { position:absolute; inset:0; z-index:1; background:radial-gradient(80% 60% at 78% 70%, rgba(11,110,205,.22) 0%, transparent 65%); pointer-events:none; }
        .wl-fig { position:absolute; z-index:1; color:#0B6ECD; pointer-events:none; }
        /* Spiker: hero art, bottom-right, raised so the legs sit higher and
           more transparent (client-tuned composition). 212px at the 394px
           reference width; below that it scales with the viewport
           (53.81vw = 212/394) so narrow phones get the same composition
           proportionally smaller instead of the fixed-size art creeping left
           into the headline. The min/max caps freeze it at the reference size
           inside the >=640px centered card (vw > card width). */
        /* The bottom offset rises as the figure shrinks, re-tuned (rate 70,
           was 26) for this more-raised composition — verified via rendered
           ink-vs-headline measurement across the device matrix below. */
        .wl-fig-spiker { right:max(-31px,-7.87vw); bottom:calc(39px + max(0px, 394px - 100vw)); width:min(212px,53.81vw); opacity:.82; }
        /* Digger: subtle accent pinned below the 64px header (client-tuned:
           lower and larger than the original corner tuck, at ~49% opacity).
           Height budget between digger top (84px) and the badge top (hero
           height - 177px) varies per phone, so its size derives from the
           hero's real height (cqh), capped at the chosen 113px so it never
           grows larger on tall phones: w <= H - 261 (in px) becomes
           104cqh - 290px with a safety margin baked in. Px fallback first for
           browsers without container-query units. */
        .wl-fig-digger { left:2px; top:84px; width:90px; width:clamp(40px, calc(104cqh - 278px), 113px); opacity:.49; }
        /* Hero too short for even the smallest digger to clear the badge
           (tiny landscape windows) — drop the accent, keep the layout. */
        @container (max-height:300px) { .wl-fig-digger { display:none; } }
        /* Legacy 320px-class devices: the 40px headline itself is too wide to
           share the hero with the art — shrink it (needs !important to beat
           the inline style). */
        @media (max-width:340px) { .wl-hero h1 { font-size:33px !important; } }
        .wl-hd { position:relative; z-index:3; display:flex; align-items:center; justify-content:space-between; padding:20px 22px; }
        .wl-logo-dot { width:24px; height:24px; border-radius:50%; background:conic-gradient(from 210deg,#0B6ECD,#4D97DE,#A8CDF0,#E11D48,#0B6ECD); }
        .wl-sheet { position:absolute; top:43%; left:0; right:0; bottom:0; background:#FFF; border-radius:30px 30px 0 0;
                    box-shadow:0 -12px 40px rgba(15,22,34,.14); padding:30px 26px 26px; display:flex; flex-direction:column; overflow-y:auto; }
        .wl-chk { display:flex; gap:11px; align-items:flex-start; font-size:15px; font-weight:600; color:#2F3A4C; line-height:1.35; }
        .wl-chk-icon { width:24px; height:24px; border-radius:50%; background:#EAF3FC; color:#0B6ECD;
                       display:inline-flex; align-items:center; justify-content:center; font-weight:800; font-size:13px; flex:none; }
        .wl-accent { color:#0B6ECD; }
        .wl-box { position:relative; border-radius:18px; background:#fff; padding:6px; }
        @keyframes wl-glow-pulse {
          0%,100% { box-shadow:0 6px 22px rgba(11,110,205,0.18), 0 0 16px rgba(11,110,205,0.16); }
          50%     { box-shadow:0 10px 34px rgba(11,110,205,0.32), 0 0 30px rgba(11,110,205,0.28); }
        }
        .wl-box-1 { animation: wl-glow-pulse 2.8s ease-in-out infinite; }
        .wl-email:focus { border-color:#3F8FDB !important; box-shadow:0 0 0 4px rgba(63,143,219,0.16) !important; }
        .wl-cta:hover:not(:disabled) { background:#0959A8; transform:translateY(-1px); box-shadow:0 10px 24px rgba(11,110,205,0.42); }
        .wl-cta:active:not(:disabled) { transform:translateY(0); }
        .wl-faq-btn { flex:none; margin-left:auto; padding:6px 13px; font-family:inherit; font-size:11.5px; font-weight:700;
                      color:#33689E; background:#EAF3FC; border:1px solid #CCDEF0; border-radius:100px; cursor:pointer;
                      white-space:nowrap; }
        .wl-faq-btn:hover { background:#E4EFFA; }
        .wl-faq-backdrop { position:fixed; inset:0; z-index:50; background:rgba(9,15,24,0.55); display:flex;
                           align-items:center; justify-content:center; padding:20px;
                           animation: wl-faq-fade .16s ease-out; }
        .wl-faq-box { position:relative; width:100%; max-width:340px; max-height:80vh; overflow-y:auto;
                      background:#FFF; border-radius:20px; padding:26px 22px 22px; box-shadow:0 30px 70px rgba(13,20,30,0.35);
                      animation: wl-faq-pop .16s ease-out; }
        .wl-faq-close { position:absolute; top:14px; right:14px; width:28px; height:28px; border-radius:50%; border:none;
                        background:#EFF3F8; color:#5B6B7E; font-size:16px; font-weight:700; cursor:pointer;
                        display:flex; align-items:center; justify-content:center; line-height:1; }
        .wl-faq-close:hover { background:#E8EEF5; }
        @keyframes wl-faq-fade { from { opacity:0; } to { opacity:1; } }
        @keyframes wl-faq-pop { from { opacity:0; transform:scale(.96); } to { opacity:1; transform:scale(1); } }
        @media (prefers-reduced-motion: reduce) {
          .wl-box-1 { animation: none !important; box-shadow:0 8px 26px rgba(11,110,205,0.22), 0 0 22px rgba(11,110,205,0.18) !important; }
          .wl-faq-backdrop, .wl-faq-box { animation: none !important; }
        }
      `}</style>

      <div className="wl-card">
        <div className="wl-hero">
          <div className="wl-glow" aria-hidden="true" />
          <DiggerSilhouette className="wl-fig wl-fig-digger" aria-hidden="true" />
          <SpikerSilhouette className="wl-fig wl-fig-spiker" aria-hidden="true" />

          <header className="wl-hd">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div className="wl-logo-dot" />
              <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: "#FFF" }}>
                vybe
              </span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: "#7A8899" }}>
              Volleyball · Singapore
            </span>
          </header>

          <div style={{ position: "absolute", left: 26, bottom: 52, zIndex: 3, textAlign: "left" }}>
            <div
              style={{
                display: "inline-flex",
                padding: "6px 14px",
                borderRadius: 100,
                background: "rgba(11,110,205,.16)",
                border: "1px solid rgba(63,143,219,.45)",
                color: "#3F8FDB",
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Launches soon
            </div>
            <h1
              style={{
                margin: "14px 0 0",
                fontSize: 40,
                lineHeight: 1.02,
                letterSpacing: "-0.03em",
                fontWeight: 800,
                color: "#FFF",
              }}
            >
              Play more
              <br />
              volleyball.
            </h1>
          </div>
        </div>

        <div className="wl-sheet">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Text is wrapped in a single <span> so the flex `gap` only sits
                between the icon and the text — not around each inline accent,
                which would otherwise become its own flex item with 11px gaps. */}
            <div className="wl-chk">
              <span className="wl-chk-icon">✓</span>
              <span>
                Find volleyball games <span className="wl-accent">near</span> you
              </span>
            </div>
            <div className="wl-chk">
              <span className="wl-chk-icon">✓</span>
              <span>
                Always have <span className="wl-accent">reliable and friendly</span> teammates
              </span>
            </div>
            <div className="wl-chk">
              <span className="wl-chk-icon">✓</span>
              <span>
                Meet players at <span className="wl-accent">your skill level</span>
              </span>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ display: "flex" }} aria-hidden="true">
              {PLAYERS.map((p, i) => (
                <PlayerAvatar key={i} p={p} i={i} />
              ))}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#5B6B7E" }}>
              40+ players already on the list
            </span>
            <button type="button" onClick={() => setFaqOpen(true)} className="wl-faq-btn">
              FAQ
            </button>
          </div>

          {submitted ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 11,
                padding: "17px 22px",
                background: "#EAF3FC",
                border: "1px solid #CCDEF0",
                borderRadius: 14,
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "#0B6ECD",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 13,
                  flex: "none",
                }}
              >
                ✓
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, color: "#0F1B2D" }}>{message}</span>
            </div>
          ) : (
            <div className="wl-box wl-box-1">
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 7, width: "100%" }}>
                {/* Honeypot: off-screen, hidden from tab order + screen readers.
                    Real users never fill it; auto-fill bots do and get dropped. */}
                <input
                  type="text"
                  name="company"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
                />
                <input
                  type="email"
                  required
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => {
                    if (email === "" && e.target.value !== "") captureEvent("waitlist_email_started");
                    setEmail(e.target.value);
                  }}
                  maxLength={200}
                  aria-label="Email address"
                  className="wl-email"
                  style={{
                    padding: 15,
                    fontFamily: "inherit",
                    fontSize: 16,
                    fontWeight: 500,
                    color: "#0F1B2D",
                    background: "#fff",
                    border: `1px solid ${status === "error" ? "#E11D48" : "transparent"}`,
                    borderRadius: 12,
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="wl-cta"
                  style={{
                    padding: 15,
                    fontFamily: "inherit",
                    fontSize: 16,
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                    color: "#fff",
                    background: "#0B6ECD",
                    border: "none",
                    borderRadius: 12,
                    cursor: status === "loading" ? "not-allowed" : "pointer",
                    opacity: status === "loading" ? 0.85 : 1,
                    boxShadow: "0 6px 18px rgba(11,110,205,0.35)",
                    transition: "transform .15s ease, box-shadow .15s ease, background .15s ease",
                  }}
                >
                  {status === "loading" ? "Joining…" : "Join the waitlist"}
                </button>
              </form>
            </div>
          )}
          {status === "error" && (
            <p style={{ margin: "10px 2px 0", fontSize: 13.5, fontWeight: 600, color: "#0A58A4", textAlign: "left" }}>
              {message}
            </p>
          )}
          <p style={{ textAlign: "center", margin: "14px 0 0", fontSize: 11.5, color: "#A3AFBE", fontWeight: 500 }}>
            Join the waitlist — one email when we launch.
          </p>
        </div>
      </div>

      {faqOpen && <FaqModal onClose={() => setFaqOpen(false)} />}
    </div>
  );
}
