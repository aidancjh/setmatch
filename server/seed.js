// Seeds demo hosts + games the first time the DB is empty, so a fresh signup
// lands on a populated Browse screen. All demo hosts share one password so you
// can also log in as them to test the host view.
import { query, uid } from "./db.js";
import { hashPassword } from "./auth.js";

const DEMO_PASSWORD = "volleyball";

const demoUsers = [
  { id: "user_maria", name: "Maria L.", email: "maria@demo.test" },
  { id: "user_theo", name: "Theo R.", email: "theo@demo.test" },
  { id: "user_grace", name: "Grace P.", email: "grace@demo.test" },
  { id: "user_dre", name: "Dre M.", email: "dre@demo.test" },
  { id: "user_nina", name: "Nina K.", email: "nina@demo.test" },
  ...[
    "Jordan", "Priya", "Sam", "Chris", "Devon", "Ana", "Kim", "Luis",
    "Nadia", "Owen", "Tara", "Eli", "Mona", "Vik", "Hana", "Marco",
    "Lena", "Paul", "Yuki", "Rosa", "Tom", "Bea", "Ken", "Raj",
  ].map((name, i) => ({
    id: `user_p${i}`,
    name,
    email: `${name.toLowerCase()}@demo.test`,
  })),
];

// Dates are relative-ish to mid-June 2026 (when the app was first built); they
// can be edited freely in the app once it's running.
const demoGames = [
  {
    id: "game_demo_1",
    title: "Friday Night Indoor 6s",
    type: "Indoor",
    skill: "Intermediate",
    date: "2026-06-19",
    time: "18:30",
    location: "Westside Rec Center, Court 2",
    area: "Santa Monica",
    total_slots: 12,
    host_id: "user_maria",
    notes: "Casual but competitive 6v6. We rotate teams every game. Bring a light and dark shirt.",
    roster: ["user_maria", "Jordan", "Priya", "Sam", "Chris", "Devon", "Ana"],
  },
  {
    id: "game_demo_2",
    title: "Beach Doubles Meetup",
    type: "Beach",
    skill: "All Levels",
    date: "2026-06-14",
    time: "10:00",
    location: "Ocean Park, Nets 4-5",
    area: "Venice",
    total_slots: 8,
    host_id: "user_theo",
    notes: "Mixed doubles, king-of-the-court format. Sunscreen mandatory.",
    roster: ["user_theo", "Kim", "Luis", "Nadia", "Owen", "Tara"],
  },
  {
    id: "game_demo_3",
    title: "Sunday Beginners' Open Gym",
    type: "Indoor",
    skill: "Beginner",
    date: "2026-06-21",
    time: "16:00",
    location: "Lincoln HS Gym",
    area: "Downtown",
    total_slots: 12,
    host_id: "user_grace",
    notes: "New to volleyball? Perfect. We focus on basics — passing, setting, serving — then play.",
    roster: ["user_grace", "Eli", "Mona"],
  },
  {
    id: "game_demo_4",
    title: "Competitive 6s — Power League",
    type: "Indoor",
    skill: "Advanced",
    date: "2026-06-20",
    time: "19:00",
    location: "Iron Court Athletics",
    area: "Culver City",
    total_slots: 12,
    host_id: "user_dre",
    notes: "High-level play. Please only join if you can pass, set, and hit consistently.",
    roster: ["user_dre", "Vik", "Hana", "Marco", "Lena", "Paul", "Yuki", "Rosa", "Tom", "Bea", "Ken"],
  },
  {
    id: "game_demo_5",
    title: "Grass 4s in the Park",
    type: "Grass",
    skill: "All Levels",
    date: "2026-06-27",
    time: "11:00",
    location: "Riverside Park, big field",
    area: "Pasadena",
    total_slots: 8,
    host_id: "user_nina",
    notes: "Relaxed grass volleyball + picnic after. Family friendly.",
    roster: ["user_nina", "Raj"],
  },
];

function resolveUserId(entry) {
  const byId = demoUsers.find((u) => u.id === entry);
  if (byId) return byId.id;
  const byName = demoUsers.find((u) => u.name === entry);
  return byName ? byName.id : null;
}

export async function seedIfEmpty() {
  const { rows } = await query("SELECT COUNT(*) AS c FROM users");
  if (Number(rows[0].c) > 0) return;

  const now = new Date().toISOString();
  const pw = hashPassword(DEMO_PASSWORD);

  for (const u of demoUsers) {
    await query(
      `INSERT INTO users (id, email, password_hash, name, skill, home_area, created_at)
       VALUES ($1, $2, $3, $4, 'Intermediate', '', $5)`,
      [u.id, u.email, pw, u.name, now]
    );
  }

  for (const g of demoGames) {
    await query(
      `INSERT INTO games
         (id, title, type, skill, date, time, location, area, total_slots, host_id, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        g.id, g.title, g.type, g.skill, g.date, g.time,
        g.location, g.area, g.total_slots, g.host_id, g.notes, now,
      ]
    );
    let seq = 0;
    for (const entry of g.roster) {
      const userId = resolveUserId(entry);
      if (userId) {
        await query(
          "INSERT INTO game_members (game_id, user_id, status, seq) VALUES ($1, $2, 'player', $3)",
          [g.id, userId, seq]
        );
      }
      seq += 1;
    }
  }

  console.log(
    `[seed] inserted ${demoUsers.length} demo users and ${demoGames.length} games ` +
      `(demo login password: "${DEMO_PASSWORD}")`
  );
}
