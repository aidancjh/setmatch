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
  { bg: "#FFE3D0", skin: "#F1C7A2", hair: "#3A2A1E", shirt: "#FF8A3D" },
  { bg: "#FFE8D2", skin: "#C68642", hair: "#16110D", shirt: "#E8590C" },
  { bg: "#FFE2C4", skin: "#8D5524", hair: "#241A12", shirt: "#FFB627" },
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
        boxShadow: "0 2px 6px rgba(20,17,15,0.14)",
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
        <h2 id="wl-faq-title" style={{ margin: "0 26px 16px 0", fontSize: 18, fontWeight: 800, color: "#15110F" }}>
          FAQ
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {FAQS.map((f, i) => (
            <div key={i}>
              <p style={{ margin: "0 0 5px", fontSize: 14, fontWeight: 700, color: "#15110F" }}>{f.q}</p>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, color: "#6F665E", lineHeight: 1.5 }}>{f.a}</p>
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
      style={{ fontFamily: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
        .wl-page { min-height:100vh; min-height:100dvh; width:100%; background:#EFE9E1; display:flex; }
        .wl-card { position:relative; width:100%; min-height:100vh; min-height:100dvh; margin:0; background:#0E0B09; overflow:hidden; }
        @media (min-width:640px) {
          .wl-card { width:min(94vw,430px); min-height:0; height:min(860px,92dvh); margin:auto; border-radius:36px; box-shadow:0 30px 80px rgba(23,19,15,.28); }
        }
        .wl-hero { position:absolute; top:0; left:0; right:0; height:47%; overflow:hidden;
                   background:linear-gradient(160deg, #26201A 0%, #17130F 55%, #0E0B09 100%); }
        .wl-glow { position:absolute; inset:0; background:radial-gradient(80% 60% at 78% 70%, rgba(255,106,26,.22) 0%, transparent 65%); pointer-events:none; }
        .wl-fig { position:absolute; color:#FF6A1A; pointer-events:none; }
        .wl-fig-spiker { right:-11.17%; bottom:9.84%; width:57.36%; }
        .wl-fig-digger { right:62.94%; bottom:46.28%; width:32.74%; }
        .wl-hd { position:relative; z-index:3; display:flex; align-items:center; justify-content:space-between; padding:20px 22px; }
        .wl-logo-dot { width:24px; height:24px; border-radius:50%; background:conic-gradient(from 210deg,#FF6A1A,#FF9A3D,#FFC078,#FF4D2E,#FF6A1A); }
        .wl-sheet { position:absolute; top:43%; left:0; right:0; bottom:0; background:#FFF; border-radius:30px 30px 0 0;
                    box-shadow:0 -12px 40px rgba(23,19,15,.14); padding:30px 26px 26px; display:flex; flex-direction:column; overflow-y:auto; }
        .wl-chk { display:flex; gap:11px; align-items:flex-start; font-size:15px; font-weight:600; color:#3E362F; line-height:1.35; }
        .wl-chk-icon { width:24px; height:24px; border-radius:50%; background:#FFF3EA; color:#FF6A1A;
                       display:inline-flex; align-items:center; justify-content:center; font-weight:800; font-size:13px; flex:none; }
        .wl-accent { color:#FF6A1A; }
        .wl-box { position:relative; border-radius:18px; background:#fff; padding:6px; }
        @keyframes wl-glow-pulse {
          0%,100% { box-shadow:0 6px 22px rgba(255,106,26,0.18), 0 0 16px rgba(255,106,26,0.16); }
          50%     { box-shadow:0 10px 34px rgba(255,106,26,0.32), 0 0 30px rgba(255,106,26,0.28); }
        }
        .wl-box-1 { animation: wl-glow-pulse 2.8s ease-in-out infinite; }
        .wl-email:focus { border-color:#FF8A3D !important; box-shadow:0 0 0 4px rgba(255,138,61,0.16) !important; }
        .wl-cta:hover:not(:disabled) { background:#F25E0F; transform:translateY(-1px); box-shadow:0 10px 24px rgba(255,106,26,0.42); }
        .wl-cta:active:not(:disabled) { transform:translateY(0); }
        .wl-faq-btn { flex:none; margin-left:auto; padding:6px 13px; font-family:inherit; font-size:11.5px; font-weight:700;
                      color:#C4622A; background:#FFF3EA; border:1px solid #F2D9C5; border-radius:100px; cursor:pointer;
                      white-space:nowrap; }
        .wl-faq-btn:hover { background:#FFEEDD; }
        .wl-faq-backdrop { position:fixed; inset:0; z-index:50; background:rgba(15,11,9,0.55); display:flex;
                           align-items:center; justify-content:center; padding:20px;
                           animation: wl-faq-fade .16s ease-out; }
        .wl-faq-box { position:relative; width:100%; max-width:340px; max-height:80vh; overflow-y:auto;
                      background:#FFF; border-radius:20px; padding:26px 22px 22px; box-shadow:0 30px 70px rgba(20,17,15,0.35);
                      animation: wl-faq-pop .16s ease-out; }
        .wl-faq-close { position:absolute; top:14px; right:14px; width:28px; height:28px; border-radius:50%; border:none;
                        background:#F5F1EC; color:#6F665E; font-size:16px; font-weight:700; cursor:pointer;
                        display:flex; align-items:center; justify-content:center; line-height:1; }
        .wl-faq-close:hover { background:#EFE9E1; }
        @keyframes wl-faq-fade { from { opacity:0; } to { opacity:1; } }
        @keyframes wl-faq-pop { from { opacity:0; transform:scale(.96); } to { opacity:1; transform:scale(1); } }
        @media (prefers-reduced-motion: reduce) {
          .wl-box-1 { animation: none !important; box-shadow:0 8px 26px rgba(255,106,26,0.22), 0 0 22px rgba(255,106,26,0.18) !important; }
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
                coterie
              </span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: "#8C7F73" }}>
              Volleyball · Singapore
            </span>
          </header>

          <div style={{ position: "absolute", left: 26, bottom: 52, zIndex: 3, textAlign: "left" }}>
            <div
              style={{
                display: "inline-flex",
                padding: "6px 14px",
                borderRadius: 100,
                background: "rgba(255,106,26,.16)",
                border: "1px solid rgba(255,138,61,.45)",
                color: "#FF8A3D",
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
            <span style={{ fontSize: 13, fontWeight: 600, color: "#6F665E" }}>
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
                background: "#FFF3EA",
                border: "1px solid #F2D9C5",
                borderRadius: 14,
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "#FF6A1A",
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
              <span style={{ fontSize: 15, fontWeight: 600, color: "#15110F" }}>{message}</span>
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
                    color: "#15110F",
                    background: "#fff",
                    border: `1px solid ${status === "error" ? "#FF4D2E" : "transparent"}`,
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
                    background: "#FF6A1A",
                    border: "none",
                    borderRadius: 12,
                    cursor: status === "loading" ? "not-allowed" : "pointer",
                    opacity: status === "loading" ? 0.85 : 1,
                    boxShadow: "0 6px 18px rgba(255,106,26,0.35)",
                    transition: "transform .15s ease, box-shadow .15s ease, background .15s ease",
                  }}
                >
                  {status === "loading" ? "Joining…" : "Join the waitlist"}
                </button>
              </form>
            </div>
          )}
          {status === "error" && (
            <p style={{ margin: "10px 2px 0", fontSize: 13.5, fontWeight: 600, color: "#E8590C", textAlign: "left" }}>
              {message}
            </p>
          )}
          <p style={{ textAlign: "center", margin: "14px 0 0", fontSize: 11.5, color: "#B4A99E", fontWeight: 500 }}>
            Join the waitlist — one email when we launch.
          </p>
        </div>
      </div>

      {faqOpen && <FaqModal onClose={() => setFaqOpen(false)} />}
    </div>
  );
}
