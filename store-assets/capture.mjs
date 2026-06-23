// Captures App Store / Play screenshots from the LIVE site using installed Chrome.
// Run: node store-assets/capture.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = "https://coterie.com.de";
const DEMO = { email: "1@demo.test", password: "111111" };

// Exact store sizes via viewport * deviceScaleFactor.
const PROFILES = [
  { name: "ios-1290x2796", width: 430, height: 932, dsf: 3 },   // iPhone 6.7"
  { name: "play-1080x2400", width: 360, height: 800, dsf: 3 },  // Android phone
];

const SHOTS = [
  { file: "1-browse", route: "/" },
  { file: "2-game-detail", route: "__first_game__" },
  { file: "3-create", route: "/create" },
  { file: "4-chats", route: "/chats" },
  { file: "5-profile", route: "/profile" },
  { file: "6-highlights", route: "/highlights" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page) {
  await page.goto(BASE + "/auth", { waitUntil: "domcontentloaded" });
  const inputs = page.locator("form input");
  await inputs.nth(0).waitFor({ state: "visible", timeout: 20000 });
  await inputs.nth(0).fill(DEMO.email);
  await inputs.nth(1).fill(DEMO.password);
  await inputs.nth(1).press("Enter");
  // Wait until we've left /auth (login succeeded + redirected home).
  await page.waitForFunction(() => !location.pathname.startsWith("/auth"), null, { timeout: 25000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(1500);
}

async function run() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const p of PROFILES) {
      const dir = `store-assets/screenshots/${p.name}`;
      fs.mkdirSync(dir, { recursive: true });
      const ctx = await browser.newContext({
        viewport: { width: p.width, height: p.height },
        deviceScaleFactor: p.dsf,
        isMobile: true,
        hasTouch: true,
      });
      const page = await ctx.newPage();
      await login(page);

      // Resolve the first real game id for the detail shot.
      let firstGameHref = null;
      try {
        await page.goto(BASE + "/", { waitUntil: "networkidle" });
        await page.locator('a[href^="/game/"]').first().waitFor({ timeout: 15000 });
        firstGameHref = await page.locator('a[href^="/game/"]').first().getAttribute("href");
      } catch { /* leave null */ }

      for (const s of SHOTS) {
        const route = s.route === "__first_game__" ? (firstGameHref || "/") : s.route;
        await page.goto(BASE + route, { waitUntil: "networkidle" }).catch(() => {});
        await sleep(1800); // let content + images settle
        const out = `${dir}/${s.file}.png`;
        await page.screenshot({ path: out });
        console.log("saved", out);
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}

run().then(() => console.log("DONE")).catch((e) => { console.error(e); process.exit(1); });
