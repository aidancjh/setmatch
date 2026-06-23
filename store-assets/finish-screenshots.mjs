// Finisher: posts the remaining upcoming games (retrying through the auth rate
// limit) and re-captures all screenshots by injecting a session token (no fresh
// browser logins). Run: node store-assets/finish-screenshots.mjs
import { chromium } from "playwright-core";
import fs from "node:fs";

const API = "https://coterie.com.de/api";
const BASE = "https://coterie.com.de";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const REMAINING = [
  { host: "4@demo.test", title: "Advanced Indoor Scrimmage", type: "Indoor", skill: "Advanced", date: "2026-06-28", time: "20:00", endTime: "22:00", location: "Downtown Arena, Court 2", area: "Downtown", totalSlots: 12, preFilled: 9, notes: "Competitive 6s. Please only join if you can pass/set/hit." },
  { host: "1@demo.test", title: "Midweek Beach Doubles", type: "Beach", skill: "Intermediate", date: "2026-07-01", time: "18:00", endTime: "20:00", location: "Bayfront Sand Courts", area: "Bayfront", totalSlots: 8, preFilled: 3, notes: "Rotating doubles, king-of-the-court style." },
  { host: "2@demo.test", title: "Friday Indoor Mixed 6s", type: "Indoor", skill: "All Levels", date: "2026-07-03", time: "19:30", endTime: "21:30", location: "Community Rec Center", area: "Central", totalSlots: 12, preFilled: 6, notes: "Mixed social game to end the week. Drinks after." },
];

const tokenCache = {};
async function token(email) {
  if (tokenCache[email]) return tokenCache[email];
  for (let attempt = 0; attempt < 20; attempt++) {
    const r = await fetch(API + "/auth/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "111111" }),
    });
    if (r.ok) { const t = (await r.json()).token; tokenCache[email] = t; return t; }
    if (r.status === 429) { console.log(`429 on ${email}, waiting 60s (attempt ${attempt + 1})`); await sleep(60000); continue; }
    throw new Error(`login ${email} -> ${r.status} ${await r.text()}`);
  }
  throw new Error(`login ${email} kept hitting rate limit`);
}

async function postGames() {
  for (const g of REMAINING) {
    const t = await token(g.host);
    const { host, ...body } = g;
    const r = await fetch(API + "/games", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) { console.error(`FAIL ${g.title}: ${r.status} ${text}`); continue; }
    let id = "?"; try { id = JSON.parse(text).id || "?"; } catch {}
    console.log(`OK  ${g.title.padEnd(28)} id=${id}`);
  }
}

const PROFILES = [
  { name: "ios-1290x2796", width: 430, height: 932, dsf: 3 },
  { name: "play-1080x2400", width: 360, height: 800, dsf: 3 },
];
const SHOTS = [
  { file: "1-browse", route: "/" },
  { file: "2-game-detail", route: "__first_game__" },
  { file: "3-create", route: "/create" },
  { file: "4-chats", route: "/chats" },
  { file: "5-profile", route: "/profile" },
];

async function capture(authToken) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const p of PROFILES) {
      const dir = `store-assets/screenshots/${p.name}`;
      fs.mkdirSync(dir, { recursive: true });
      const ctx = await browser.newContext({
        viewport: { width: p.width, height: p.height },
        deviceScaleFactor: p.dsf, isMobile: true, hasTouch: true,
      });
      await ctx.addInitScript((tok) => { try { localStorage.setItem("vb.token", tok); } catch {} }, authToken);
      const page = await ctx.newPage();
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await page.locator('a[href^="/game/"]').first().waitFor({ timeout: 20000 }).catch(() => {});
      let firstGameHref = await page.locator('a[href^="/game/"]').first().getAttribute("href").catch(() => null);
      for (const s of SHOTS) {
        const route = s.route === "__first_game__" ? (firstGameHref || "/") : s.route;
        await page.goto(BASE + route, { waitUntil: "networkidle" }).catch(() => {});
        await sleep(1800);
        await page.screenshot({ path: `${dir}/${s.file}.png` });
        console.log("saved", `${dir}/${s.file}.png`);
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
}

async function run() {
  await postGames();
  const maria = await token("1@demo.test");
  await capture(maria);
  console.log("DONE");
}
run().catch((e) => { console.error(e); process.exit(1); });
