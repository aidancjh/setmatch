/**
 * Full-screen branded loader: a detailed volleyball bouncing over a pulsing
 * ground shadow (no squash — the ball stays a perfect circle). Shown while auth resolves so the app never flashes a
 * blank screen. The animation classes live in index.css (ball-bounce / -spin /
 * -shadow) and respect prefers-reduced-motion.
 */

function VolleyballBall() {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" role="img" aria-label="Volleyball" style={{ display: "block" }}>
      <defs>
        <clipPath id="vbClip">
          <circle cx="60" cy="60" r="54" />
        </clipPath>
        {/* one seam arm; reused at 120°/240° so the pinwheel is perfectly symmetric */}
        <g id="vbArm" fill="none" stroke="#ffffff" strokeWidth="3.6" strokeLinecap="round">
          <path d="M60 60 C 48 76, 46 96, 56 118" />
          <path d="M78 66 C 68 82, 68 102, 76 118" />
        </g>
      </defs>
      <circle cx="60" cy="60" r="54" fill="#d92632" />
      <g clipPath="url(#vbClip)" opacity="0.96">
        <use href="#vbArm" />
        <use href="#vbArm" transform="rotate(120 60 60)" />
        <use href="#vbArm" transform="rotate(240 60 60)" />
      </g>
    </svg>
  );
}

export default function FullScreenLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-white">
      <div className="relative" style={{ width: 84, height: 140 }}>
        {/* shadow is painted first so the ball sits on top of it at rest */}
        <div
          className="ball-shadow absolute"
          style={{ left: 14, bottom: 4, width: 56, height: 11, borderRadius: "50%", background: "#000" }}
        />
        <div
          className="ball-bounce absolute"
          style={{ left: 10, bottom: 10, width: 64, height: 64 }}
        >
          <div className="ball-spin" style={{ width: "100%", height: "100%" }}>
            <VolleyballBall />
          </div>
        </div>
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand">Coterie</p>
    </div>
  );
}
