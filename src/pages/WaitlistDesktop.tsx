import { useEffect, useRef, useState } from "react";
import { SpikerSilhouette, DiggerSilhouette } from "../components/PlayerSilhouettes";
import { initPostHog, captureEvent } from "../lib/posthog";

// Desktop-only waitlist design (canvas-rays). Deliberately kept separate from
// WaitlistMobile.tsx — see Waitlist.tsx for the breakpoint that picks between
// them — so mobile iteration never risks this one.
//
// Imported from the Claude Design project "Coterie Waitlist". The signature
// piece is the animated canvas: warm-toned rays streaming outward from a point
// just above centre. Ported here 1:1 from the design's render loop, wired to the
// real /api/waitlist submit.

type Particle = {
  dir: number;
  r: number;
  len: number;
  width: number;
  color: string;
  jitter: number;
};

const PALETTE = [
  "#FF6A1A", "#FF8A3D", "#FFA94D", "#FF4D2E", "#FFB627",
  "#E8590C", "#FF7A45", "#FFC078", "#FF9F1C",
];
const MOTION_INTENSITY = 4.5; // slightly slower than design default of 6 (1–10)
const BASE_LINE_COUNT = 84; // design default

// Decorative "player" avatars rendered as self-contained inline SVG portraits.
// The design's originals were photos from a third-party host the production CSP
// blocks — these read as real profile pictures while making zero network
// requests (no external dependency, no privacy leak, no broken images).
const PLAYERS = [
  { bg: "#FFE3D0", skin: "#F1C7A2", hair: "#3A2A1E", shirt: "#FF8A3D" },
  { bg: "#FFE8D2", skin: "#C68642", hair: "#16110D", shirt: "#E8590C" },
  { bg: "#FFE2C4", skin: "#8D5524", hair: "#241A12", shirt: "#FFB627" },
  { bg: "#FFEFE0", skin: "#FFD7B0", hair: "#7A4E2A", shirt: "#FF7A45" },
  { bg: "#FFF0DE", skin: "#E8B07D", hair: "#C98A3C", shirt: "#FF9F1C" },
];

// FAQ content for the top-right accordion. Kept in sync with the mobile modal
// (WaitlistMobile.tsx) by hand — same three questions.
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
        width: "clamp(32px,2.6vw,48px)",
        height: "clamp(32px,2.6vw,48px)",
        borderRadius: "50%",
        marginLeft: i === 0 ? 0 : "clamp(-10px,-0.8vw,-13px)",
        border: "2.5px solid #FDFBF9",
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

// The value prop shown under the headline. Joiner-first, clear and direct:
// discovery ("find a game") + the payoff ("play"), with the mid-clause picked
// out in brand orange so the line has a focal point without a box around it.

export default function WaitlistDesktop() {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // honeypot — humans leave this blank
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null); // accordion: one open at a time
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  // --- Animated ray field (ported from the design's canvas render loop) ------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let w = 0, h = 0, cx = 0, cy = 0, maxR = 0;
    let parts: Particle[] = [];
    let raf = 0;

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      cx = w / 2;
      cy = h * 0.46;
      maxR = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) * 1.02;
    };

    const count = () => {
      const areaScale = Math.min(1.4, Math.max(0.55, (w * h) / (1280 * 800)));
      return Math.round(BASE_LINE_COUNT * areaScale);
    };

    const make = (full: boolean): Particle => {
      const angle = Math.random() * Math.PI * 2;
      const r0 = 26 + Math.random() * 34;
      const r = full ? r0 + Math.random() * (maxR - r0) : r0;
      return {
        dir: angle,
        r,
        len: 16 + Math.random() * 34,
        width: 1.4 + Math.random() * 1.8,
        color: PALETTE[(Math.random() * PALETTE.length) | 0],
        jitter: (Math.random() - 0.5) * 0.6,
      };
    };

    const seed = () => {
      if (!maxR) return;
      const n = count();
      parts = [];
      for (let i = 0; i < n; i++) parts.push(make(true));
    };

    const draw = (advance: boolean) => {
      const speed = 0.32 + MOTION_INTENSITY * 0.26;
      const want = count();
      while (parts.length < want) parts.push(make(true));
      while (parts.length > want) parts.pop();

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      for (const p of parts) {
        if (advance) {
          p.r += speed * (0.85 + (p.len / 50) * 0.4);
          if (p.r > maxR) Object.assign(p, make(false));
        }
        const a = p.dir + Math.sin(p.r * 0.012) * 0.05 * p.jitter;
        const ux = Math.cos(a), uy = Math.sin(a);
        const ex = cx + ux * p.r, ey = cy + uy * p.r;
        const sx = ex - ux * p.len, sy = ey - uy * p.len;
        const t = p.r / maxR;
        let op;
        if (t < 0.1) op = t / 0.1;
        else if (t > 0.72) op = Math.max(0, (1 - t) / 0.28);
        else op = 1;
        op *= 0.85;
        ctx.globalAlpha = op;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const loop = () => {
      if (w && h) draw(true);
      raf = requestAnimationFrame(loop);
    };

    // A ResizeObserver sizes the backing store the moment the canvas has real
    // dimensions (independent of when rAF first fires), then paints one static
    // frame so the field is never blank. The rAF loop animates from there.
    const onSize = () => {
      resize();
      seed();
      if (w && h) draw(false);
    };
    const ro = new ResizeObserver(onSize);
    ro.observe(canvas);
    onSize(); // in case the observer's first callback is deferred
    window.addEventListener("resize", onSize); // belt-and-suspenders for orientation changes

    if (!reduceMotion) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", onSize);
    };
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
    <section
      data-screen-label="Waitlist"
      style={{
        position: "relative",
        minHeight: "100vh",
        width: "100%",
        overflow: "hidden",
        background:
          "radial-gradient(120% 90% at 50% 30%, #FFFFFF 0%, #FDFBF9 55%, #FBF5EF 100%)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
        /* Email box — soft pulsing orange glow (no hard outline rings) */
        .wl-box { position:relative; border-radius:18px; background:#fff; padding:7px; }
        @keyframes wl-glow {
          0%,100% { box-shadow:0 6px 22px rgba(255,106,26,0.18), 0 0 16px rgba(255,106,26,0.16); }
          50%     { box-shadow:0 10px 34px rgba(255,106,26,0.32), 0 0 30px rgba(255,106,26,0.28); }
        }
        .wl-box-1 { animation: wl-glow 2.8s ease-in-out infinite; }
        .wl-email:focus { border-color:#FF8A3D !important; box-shadow:0 0 0 4px rgba(255,138,61,0.16) !important; }
        .wl-cta:hover:not(:disabled) { background:#F25E0F; transform:translateY(-1px); box-shadow:0 10px 24px rgba(255,106,26,0.42); }
        .wl-cta:active:not(:disabled) { transform:translateY(0); }
        /* Top-right FAQ accordion (desktop only) */
        .wl-faq { position:absolute; top:clamp(72px,7vw,104px); right:clamp(16px,3vw,56px); z-index:4;
                  width:clamp(240px,20vw,300px); background:rgba(255,255,255,0.92); backdrop-filter:blur(12px);
                  -webkit-backdrop-filter:blur(12px); border:1px solid #F0E4D8; border-radius:18px;
                  padding:14px 18px 4px; box-shadow:0 12px 44px rgba(23,19,15,0.12); text-align:left; }
        .wl-faq-title { font-size:11px; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; color:#C4622A; margin-bottom:4px; }
        .wl-faq-item { border-top:1px solid #F0E4D8; }
        .wl-faq-item:first-of-type { border-top:none; }
        .wl-faq-q { width:100%; display:flex; align-items:center; justify-content:space-between; gap:12px;
                    background:none; border:none; cursor:pointer; padding:13px 0; font-family:inherit;
                    font-size:14.5px; font-weight:700; color:#2A2320; text-align:left; line-height:1.3; }
        .wl-faq-q:hover { color:#C4622A; }
        .wl-faq-chev { flex:none; color:#C4622A; font-size:15px; transition:transform .25s ease; }
        .wl-faq-chev.open { transform:rotate(180deg); }
        .wl-faq-a { display:grid; grid-template-rows:0fr; transition:grid-template-rows .26s ease; }
        .wl-faq-a.open { grid-template-rows:1fr; }
        .wl-faq-a-inner { overflow:hidden; min-height:0; }
        .wl-faq-a-inner p { margin:0 0 13px; font-size:13.5px; font-weight:500; line-height:1.5; color:#6F665E; }
        @media (prefers-reduced-motion: reduce) {
          .wl-faq-a, .wl-faq-chev { transition:none !important; }
        }
        /* Design 1 — bold player silhouettes grounded in the bottom corners */
        .wl-fig { position:absolute; bottom:-2px; z-index:2; color:#FF6A1A; opacity:.95; pointer-events:none; height:auto; }
        .wl-spiker { left:clamp(-32px, -1.5vw, 0px); width:clamp(220px, 26vw, 560px); }
        .wl-digger { right:clamp(-32px, -1.5vw, 0px); width:clamp(240px, 28vw, 600px); }
        @media (max-width: 760px) {
          /* Shrink + fade so they frame the form instead of crowding it */
          .wl-fig { opacity:.13; }
          .wl-spiker { width:160px; left:-30px; }
          .wl-digger { width:175px; right:-30px; }
        }
        @media (max-width: 480px) {
          .wl-form { flex-direction: column; }
          .wl-cta { width: 100%; }
          .wl-formwrap { max-width: 300px !important; }
          .wl-spiker { width:128px; left:-26px; }
          .wl-digger { width:140px; right:-26px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .wl-box-1 { animation: none !important; box-shadow:0 8px 26px rgba(255,106,26,0.22), 0 0 22px rgba(255,106,26,0.18) !important; }
        }
      `}</style>

      {/* Animated ray field */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", zIndex: 0 }}
      />
      {/* Soft vignette so the centre content stays legible over the rays */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          pointerEvents: "none",
          background:
            "radial-gradient(46% 40% at 50% 46%, rgba(253,251,249,0.92) 0%, rgba(253,251,249,0.7) 38%, rgba(253,251,249,0) 70%)",
        }}
      />

      {/* Player silhouettes (traced from reference art) — spiker left, receiver
          right, both facing inward toward the headline. Decorative only. */}
      <SpikerSilhouette className="wl-fig wl-spiker" aria-hidden="true" />
      <DiggerSilhouette className="wl-fig wl-digger" aria-hidden="true" />

      {/* Header */}
      <header
        style={{
          position: "relative",
          zIndex: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "clamp(18px,2.2vw,34px) clamp(20px,5vw,72px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "clamp(8px,0.9vw,14px)" }}>
          <div
            style={{
              width: "clamp(22px,2.4vw,40px)",
              height: "clamp(22px,2.4vw,40px)",
              borderRadius: "50%",
              background: "conic-gradient(from 210deg, #FF6A1A, #FF9A3D, #FFC078, #FF4D2E, #FF6A1A)",
              boxShadow: "0 2px 10px rgba(255,106,26,0.35)",
            }}
          />
          <span style={{ fontSize: "clamp(17px,1.8vw,30px)", fontWeight: 700, letterSpacing: "-0.02em", color: "#1A1614" }}>
            coterie
          </span>
        </div>
        <span style={{ fontSize: "clamp(12.5px,1.1vw,18px)", fontWeight: 600, letterSpacing: "0.04em", color: "#9A8E84" }}>
          Volleyball · Singapore
        </span>
      </header>

      {/* Top-right FAQ accordion — all three questions shown; clicking one
          expands its answer and collapses whichever was previously open. */}
      <div className="wl-faq">
        <div className="wl-faq-title">FAQ</div>
        {FAQS.map((f, i) => {
          const open = openFaq === i;
          return (
            <div className="wl-faq-item" key={i}>
              <button
                type="button"
                className="wl-faq-q"
                aria-expanded={open}
                onClick={() => setOpenFaq(open ? null : i)}
              >
                <span>{f.q}</span>
                <span className={`wl-faq-chev${open ? " open" : ""}`} aria-hidden="true">⌄</span>
              </button>
              <div className={`wl-faq-a${open ? " open" : ""}`}>
                <div className="wl-faq-a-inner">
                  <p>{f.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main */}
      <main
        style={{
          position: "relative",
          zIndex: 3,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "clamp(24px,3vw,40px) clamp(20px,5vw,72px) clamp(56px,7vw,96px)",
        }}
      >
        {/* "Launches soon" badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "clamp(9px,0.9vw,15px) clamp(18px,1.7vw,30px)",
            border: "1px solid #F2D9C5",
            background: "rgba(255,247,240,0.8)",
            borderRadius: 100,
            marginBottom: "clamp(26px,2.6vw,46px)",
          }}
        >
          <span
            style={{
              fontSize: "clamp(13px,1vw,18px)",
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "#C4622A",
              textTransform: "uppercase",
            }}
          >
            Launches soon
          </span>
        </div>

        {/* Headline */}
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(2.6rem,6vw,7.5rem)",
            lineHeight: 0.98,
            fontWeight: 800,
            letterSpacing: "-0.035em",
            color: "#15110F",
            maxWidth: "13ch",
          }}
        >
          Join the Waitlist
        </h1>

        {/* Tagline — borderless kicker line under the headline. No box; the
            mid-clause is picked out in brand orange as the line's focal point. */}
        <p
          style={{
            margin: "clamp(20px,2.1vw,34px) 0 0",
            maxWidth: "min(90vw, 560px)",
            textAlign: "center",
            fontSize: "clamp(1rem, 1.5vw, 1.45rem)",
            fontWeight: 600,
            color: "#6F665E",
            letterSpacing: "-0.01em",
            lineHeight: 1.4,
          }}
        >
          Find a game near you, <span style={{ color: "#FF6A1A" }}>grab your spot</span>, and play
        </p>

        {/* Form / success */}
        <div className="wl-formwrap" style={{ width: "100%", maxWidth: "clamp(380px, 34vw, 640px)", marginTop: "clamp(28px,3vw,48px)" }}>
          {submitted ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 11,
                padding: "clamp(16px,1.4vw,24px) clamp(20px,2vw,30px)",
                background: "#FFF3EA",
                border: "1px solid #F2D9C5",
                borderRadius: 14,
              }}
            >
              <span
                style={{
                  width: "clamp(24px,1.8vw,32px)",
                  height: "clamp(24px,1.8vw,32px)",
                  borderRadius: "50%",
                  background: "#FF6A1A",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: "clamp(13px,1vw,16px)",
                  flex: "none",
                }}
              >
                ✓
              </span>
              <span style={{ fontSize: "clamp(15px,1.1vw,19px)", fontWeight: 600, color: "#15110F" }}>{message}</span>
            </div>
          ) : (
            <div className="wl-box wl-box-1">
              <form onSubmit={handleSubmit} className="wl-form" style={{ display: "flex", gap: 8, width: "100%" }}>
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
                    flex: 1,
                    minWidth: 0,
                    padding: "clamp(14px,1.2vw,20px) clamp(16px,1.4vw,22px)",
                    fontFamily: "inherit",
                    fontSize: "clamp(15px,1.1vw,19px)",
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
                    flex: "none",
                    padding: "clamp(14px,1.2vw,20px) clamp(22px,2vw,34px)",
                    fontFamily: "inherit",
                    fontSize: "clamp(15px,1.1vw,19px)",
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
                  {status === "loading" ? "Joining…" : "Join Now"}
                </button>
              </form>
            </div>
          )}
          {status === "error" && (
            <p style={{ margin: "12px 2px 0", fontSize: "clamp(13.5px,0.95vw,16px)", fontWeight: 600, color: "#E8590C", textAlign: "left" }}>
              {message}
            </p>
          )}
        </div>

        {/* Social proof */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 13, marginTop: "clamp(22px,2.2vw,38px)" }}>
          <div style={{ display: "flex" }} aria-hidden="true">
            {PLAYERS.map((p, i) => (
              <PlayerAvatar key={i} p={p} i={i} />
            ))}
          </div>
          <span style={{ fontSize: "clamp(13.5px,1vw,17px)", fontWeight: 600, color: "#6F665E" }}>
            Join 40+ players already on the list
          </span>
        </div>

        {/* Positioning line — plain text, styled like the old subtitle.
            coterie is the app name, so this frames what it is, not who made it. */}
        <p
          style={{
            margin: "clamp(30px,3vw,50px) 0 0",
            fontSize: "clamp(1rem,1.3vw,1.4rem)",
            lineHeight: 1.5,
            fontWeight: 500,
            color: "#6F665E",
          }}
        >
          <strong style={{ color: "#FF6A1A", fontWeight: 700 }}>Coterie</strong> · Play volleyball in Singapore
        </p>
      </main>
    </section>
  );
}
