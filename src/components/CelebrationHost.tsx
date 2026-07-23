/**
 * Renders celebration visuals (confetti burst, checkmark pop) on demand.
 * Mounted once in the app shell so effects persist across navigation.
 */
import { useEffect, useRef, useState } from "react";
import { onCelebrate } from "../lib/celebrate";

function fireConfetti(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  if (W === 0 || H === 0) return;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = ["#d92632", "#f2a3a8", "#ffd34e", "#f4746d", "#7ee081", "#ffffff"];
  const cx = W / 2;
  const cy = H * 0.4;
  const parts = Array.from({ length: 100 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 7;
    return {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      size: 5 + Math.random() * 6,
      color: colors[(Math.random() * colors.length) | 0],
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.3,
    };
  });

  const start = performance.now();
  const tick = (now: number) => {
    const elapsed = now - start;
    ctx.clearRect(0, 0, W, H);
    let alive = false;
    const life = Math.max(0, 1 - elapsed / 1400);
    for (const p of parts) {
      p.vy += 0.18; // gravity
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      if (life > 0 && p.y < H + 20) {
        alive = true;
        ctx.save();
        ctx.globalAlpha = life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
    }
    if (alive && elapsed < 1600) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, W, H);
  };
  requestAnimationFrame(tick);
}

export default function CelebrationHost() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [check, setCheck] = useState(false);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const unsub = onCelebrate((kind) => {
      if (kind === "join") {
        if (!reduce) fireConfetti(canvasRef.current);
      } else {
        setCheck(true);
        clearTimeout(checkTimer.current);
        checkTimer.current = setTimeout(() => setCheck(false), 1100);
      }
    });
    return () => {
      unsub();
      clearTimeout(checkTimer.current);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-[60] h-full w-full"
        aria-hidden
      />
      {check && (
        <div
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center"
          aria-hidden
        >
          <div className="check-pop flex h-24 w-24 items-center justify-center rounded-full bg-slate-900 shadow-xl">
            <svg viewBox="0 0 52 52" className="h-14 w-14">
              <circle cx="26" cy="26" r="24" fill="none" stroke="#e04b55" strokeWidth="3" opacity="0.22" />
              <path
                className="check-draw"
                fill="none"
                stroke="#e04b55"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14 27 l8 8 l16 -18"
              />
            </svg>
          </div>
        </div>
      )}
    </>
  );
}
