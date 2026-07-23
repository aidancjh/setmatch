/**
 * Full-screen branded loader: a detailed volleyball bouncing with squash and a
 * pulsing ground shadow. Shown while auth resolves so the app never flashes a
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
      </defs>
      <circle cx="60" cy="60" r="54" fill="#d92632" />
      <g
        clipPath="url(#vbClip)"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.6"
        strokeLinecap="round"
        opacity="0.96"
      >
        {/* classic volleyball pinwheel: three seams meeting off-centre, each
            paired with a companion groove */}
        <path d="M70 58 C 52 64, 40 82, 36 112" />
        <path d="M82 56 C 66 66, 56 86, 54 114" />
        <path d="M70 58 C 50 50, 28 50, 4 60" />
        <path d="M71 47 C 52 38, 26 36, 2 44" />
        <path d="M70 58 C 74 40, 70 22, 58 4" />
        <path d="M82 56 C 90 40, 90 22, 82 6" />
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
