// One-off: generate PWA / home-screen PNG icons from assets/icon.svg into public/.
// Run with: node scripts/generate-icons.mjs
import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
mkdirSync(pub, { recursive: true });

const svg = readFileSync(join(root, "assets", "icon.svg"));

// Maskable icon: full-bleed background with the ball inside the ~80% safe zone,
// so Android can crop it to any shape without clipping the design.
const maskable = Buffer.from(`
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#0f172a"/>
  <g transform="translate(256,256) scale(0.66)">
    <circle r="150" fill="#ffffff"/>
    <g fill="none" stroke="#0f172a" stroke-width="13" stroke-linecap="round">
      <path d="M 0 -150 C -55 -70, -55 70, 0 150"/>
      <path d="M 130 -75 C 40 -45, -75 25, -130 75"/>
      <path d="M 130 75 C 40 45, -75 -25, -130 -75"/>
      <circle r="150"/>
    </g>
  </g>
</svg>`);

const jobs = [
  { src: svg, size: 192, out: "pwa-192x192.png" },
  { src: svg, size: 512, out: "pwa-512x512.png" },
  { src: svg, size: 180, out: "apple-touch-icon.png" },
  { src: svg, size: 32, out: "favicon-32x32.png" },
  { src: maskable, size: 512, out: "maskable-512x512.png" },
];

for (const j of jobs) {
  await sharp(j.src)
    .resize(j.size, j.size)
    .png()
    .toFile(join(pub, j.out));
  console.log("wrote public/" + j.out);
}
console.log("done");
