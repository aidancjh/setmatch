// Generates PWA / home-screen PNG icons from the Coterie BrandMark
// (red tile + white C — same geometry as BrandMark in src/components/icons.tsx).
// Run with: node scripts/generate-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
mkdirSync(pub, { recursive: true });

const RED = "#d92632";
const C_PATH = `<path d="M16.6 8.4 A 5.8 5.8 0 1 0 16.6 15.6" fill="none"
  stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>`;

// Rounded red tile with the C — regular icons.
const tile = Buffer.from(`
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="6.5" fill="${RED}"/>${C_PATH}
</svg>`);

// Full-bleed red square — the OS applies its own corner mask. `pad` grows the
// canvas around the 24-unit mark so it sits inside the safe zone.
const fullBleed = (pad) =>
  Buffer.from(`
<svg viewBox="${-pad} ${-pad} ${24 + 2 * pad} ${24 + 2 * pad}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${-pad}" y="${-pad}" width="${24 + 2 * pad}" height="${24 + 2 * pad}" fill="${RED}"/>${C_PATH}
</svg>`);

const jobs = [
  { src: tile, size: 192, out: "pwa-192x192.png" },
  { src: tile, size: 512, out: "pwa-512x512.png" },
  { src: tile, size: 32, out: "favicon-32x32.png" },
  // Maskable: keep the mark inside the middle ~80% so Android can crop freely.
  { src: fullBleed(4), size: 512, out: "maskable-512x512.png" },
  { src: fullBleed(2), size: 180, out: "apple-touch-icon.png" },
];

for (const j of jobs) {
  await sharp(j.src).resize(j.size, j.size).png().toFile(join(pub, j.out));
  console.log("wrote public/" + j.out);
}

// Social share image (Open Graph / Twitter) — 1200x630.
const og = Buffer.from(`
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#ffffff"/>
  <g transform="translate(492,110) scale(9)">
    <rect width="24" height="24" rx="6.5" fill="${RED}"/>${C_PATH}
  </g>
  <text x="600" y="440" text-anchor="middle" fill="#0f172a" font-family="Segoe UI, Arial, sans-serif" font-size="82" font-weight="bold">Coterie</text>
  <text x="600" y="510" text-anchor="middle" fill="#64748b" font-family="Segoe UI, Arial, sans-serif" font-size="36">Find your players. Fill your games.</text>
</svg>`);
await sharp(og).png().toFile(join(pub, "og-image.png"));
console.log("wrote public/og-image.png");

console.log("done");
