// Posts a handful of realistic UPCOMING games via demo accounts so the Browse
// feed looks active for store screenshots. Prints created game IDs so they can
// be deleted later. Run: node store-assets/seed-demo-games.mjs
const API = "https://coterie.com.de/api";

const GAMES = [
  { host: "2@demo.test", title: "Tuesday Night Indoor 6s", type: "Indoor", skill: "Intermediate", date: "2026-06-24", time: "19:00", endTime: "21:00", location: "Eastside Sports Hall", area: "Bedok", totalSlots: 12, preFilled: 7, notes: "Regular weekly run. Nets up at 7. Bring light + dark." },
  { host: "5@demo.test", title: "Sunset Beach 4s", type: "Beach", skill: "All Levels", date: "2026-06-25", time: "17:30", endTime: "19:30", location: "Marina Beach Courts", area: "Marina", totalSlots: 8, preFilled: 5, notes: "Casual doubles as the sun goes down. All welcome." },
  { host: "3@demo.test", title: "Saturday Grass Social", type: "Grass", skill: "Beginner", date: "2026-06-27", time: "10:00", endTime: "12:00", location: "Riverside Park, big field", area: "Riverside", totalSlots: 10, preFilled: 4, notes: "Beginner-friendly. We'll teach the basics + play games." },
  { host: "4@demo.test", title: "Advanced Indoor Scrimmage", type: "Indoor", skill: "Advanced", date: "2026-06-28", time: "20:00", endTime: "22:00", location: "Downtown Arena, Court 2", area: "Downtown", totalSlots: 12, preFilled: 9, notes: "Competitive 6s. Please only join if you can pass/set/hit." },
  { host: "1@demo.test", title: "Midweek Beach Doubles", type: "Beach", skill: "Intermediate", date: "2026-07-01", time: "18:00", endTime: "20:00", location: "Bayfront Sand Courts", area: "Bayfront", totalSlots: 8, preFilled: 3, notes: "Rotating doubles, king-of-the-court style." },
  { host: "2@demo.test", title: "Friday Indoor Mixed 6s", type: "Indoor", skill: "All Levels", date: "2026-07-03", time: "19:30", endTime: "21:30", location: "Community Rec Center", area: "Central", totalSlots: 12, preFilled: 6, notes: "Mixed social game to end the week. Drinks after." },
];

async function token(email) {
  const r = await fetch(API + "/auth/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "111111" }),
  });
  if (!r.ok) throw new Error(`login ${email} -> ${r.status} ${await r.text()}`);
  return (await r.json()).token;
}

async function run() {
  const created = [];
  for (const g of GAMES) {
    const t = await token(g.host);
    const { host, ...body } = g;
    const r = await fetch(API + "/games", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) { console.error(`FAIL ${g.title}: ${r.status} ${text}`); continue; }
    let id = "?"; try { id = JSON.parse(text).id || JSON.parse(text).game?.id || "?"; } catch {}
    created.push(id);
    console.log(`OK  ${g.title.padEnd(28)} host=${host} id=${id}`);
  }
  console.log("\nCreated game IDs:", created.join(", "));
}
run().catch((e) => { console.error(e); process.exit(1); });
