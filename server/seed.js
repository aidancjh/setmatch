// Seeds demo data the first time the DB is empty.
// syncDemoPasswords() runs on EVERY startup so login credentials stay
// predictable even after the DB already existed.
// seedPastData() is idempotent — safe to call any time via the admin endpoint.
import { query, uid } from "./db.js";
import { hashPassword } from "./auth.js";

// ─── Easy-to-remember credentials ──────────────────────────────────────────
// Email pattern:  [number]@demo.test   e.g. 1@demo.test
// Password:       111111  (for ALL demo accounts)
// ────────────────────────────────────────────────────────────────────────────
const DEMO_PASSWORD = "111111";

const demoUsers = [
  {
    id: "user_maria", name: "Maria L.", email: "1@demo.test",
    skill: "Intermediate", homeArea: "Santa Monica",
    bio: "Obsessed with beach volleyball. Played club in college, now just here to have fun.",
  },
  {
    id: "user_theo", name: "Theo R.", email: "2@demo.test",
    skill: "Advanced", homeArea: "Venice",
    bio: "Setter by trade. Been playing competitively for 8 years. Always down for a good rally.",
  },
  {
    id: "user_grace", name: "Grace P.", email: "3@demo.test",
    skill: "Beginner", homeArea: "Downtown LA",
    bio: "Picked up volleyball 3 months ago and I'm hooked. Please be patient with my serves!",
  },
  {
    id: "user_dre", name: "Dre M.", email: "4@demo.test",
    skill: "Advanced", homeArea: "Culver City",
    bio: "Former D3 libero. I love digging impossible balls. Host competitive games every week.",
  },
  {
    id: "user_nina", name: "Nina K.", email: "5@demo.test",
    skill: "All Levels", homeArea: "Pasadena",
    bio: "Weekend warrior. Grass volleyball, picnics, good vibes — that's my thing.",
  },
  ...[
    { name: "Jordan",  skill: "Intermediate", area: "Silver Lake" },
    { name: "Priya",   skill: "Advanced",     area: "Brentwood" },
    { name: "Sam",     skill: "Beginner",     area: "Echo Park" },
    { name: "Chris",   skill: "Intermediate", area: "Hollywood" },
    { name: "Devon",   skill: "Advanced",     area: "Manhattan Beach" },
    { name: "Ana",     skill: "Beginner",     area: "Koreatown" },
    { name: "Kim",     skill: "Intermediate", area: "West Hollywood" },
    { name: "Luis",    skill: "Advanced",     area: "Inglewood" },
    { name: "Nadia",   skill: "Intermediate", area: "Burbank" },
    { name: "Owen",    skill: "Beginner",     area: "Glendale" },
    { name: "Tara",    skill: "Advanced",     area: "Torrance" },
    { name: "Eli",     skill: "Beginner",     area: "Alhambra" },
    { name: "Mona",    skill: "Intermediate", area: "Woodland Hills" },
    { name: "Vik",     skill: "Advanced",     area: "Sherman Oaks" },
    { name: "Hana",    skill: "Intermediate", area: "Los Feliz" },
    { name: "Marco",   skill: "Advanced",     area: "El Segundo" },
    { name: "Lena",    skill: "Intermediate", area: "Playa Vista" },
    { name: "Paul",    skill: "Advanced",     area: "Redondo Beach" },
    { name: "Yuki",    skill: "All Levels",   area: "Little Tokyo" },
    { name: "Rosa",    skill: "Intermediate", area: "Boyle Heights" },
    { name: "Tom",     skill: "Advanced",     area: "Long Beach" },
    { name: "Bea",     skill: "Beginner",     area: "Hawthorne" },
    { name: "Ken",     skill: "Intermediate", area: "Gardena" },
    { name: "Raj",     skill: "All Levels",   area: "Diamond Bar" },
  ].map((u, i) => ({
    id: `user_p${i}`,
    name: u.name,
    email: `${u.name.toLowerCase()}@demo.test`,
    skill: u.skill,
    homeArea: u.area,
    bio: "",
  })),
];

const demoGames = [
  {
    id: "game_demo_1",
    title: "Friday Night Indoor 6s",
    type: "Indoor", skill: "Intermediate",
    date: "2026-06-19", time: "18:30",
    location: "Westside Rec Center, Court 2", area: "Santa Monica",
    total_slots: 12, host_id: "user_maria",
    notes: "Casual but competitive 6v6. Rotate teams every game. Bring a light and dark shirt.",
    roster: ["user_maria", "user_p0", "user_p1", "user_p2", "user_p3", "user_p4", "user_p5"],
  },
  {
    id: "game_demo_2",
    title: "Beach Doubles Meetup",
    type: "Beach", skill: "All Levels",
    date: "2026-06-22", time: "10:00",
    location: "Ocean Park, Nets 4–5", area: "Venice",
    total_slots: 8, host_id: "user_theo",
    notes: "Mixed doubles, king-of-the-court format. Sunscreen mandatory.",
    roster: ["user_theo", "user_p6", "user_p7", "user_p8", "user_p9", "user_p10"],
  },
  {
    id: "game_demo_3",
    title: "Sunday Beginners' Open Gym",
    type: "Indoor", skill: "Beginner",
    date: "2026-06-21", time: "16:00",
    location: "Lincoln HS Gym", area: "Downtown LA",
    total_slots: 12, host_id: "user_grace",
    notes: "New to volleyball? Perfect. We focus on passing, setting, and serving — then play games.",
    roster: ["user_grace", "user_p11", "user_p12"],
  },
  {
    id: "game_demo_4",
    title: "Competitive 6s — Power League",
    type: "Indoor", skill: "Advanced",
    date: "2026-06-20", time: "19:00",
    location: "Iron Court Athletics", area: "Culver City",
    total_slots: 12, host_id: "user_dre",
    notes: "High-level play only. Please join if you can pass, set, and hit consistently.",
    roster: ["user_dre", "user_p13", "user_p14", "user_p15", "user_p16", "user_p17", "user_p18", "user_p19", "user_p20", "user_p21", "user_p22"],
  },
  {
    id: "game_demo_5",
    title: "Grass 4s in the Park",
    type: "Grass", skill: "All Levels",
    date: "2026-06-27", time: "11:00",
    location: "Riverside Park, big field", area: "Pasadena",
    total_slots: 8, host_id: "user_nina",
    notes: "Relaxed grass volleyball + picnic after. Family friendly. Bring snacks to share!",
    roster: ["user_nina", "user_p23"],
  },
  {
    id: "game_demo_6",
    title: "Morning Beach Run & Rally",
    type: "Beach", skill: "Intermediate",
    date: "2026-06-25", time: "07:30",
    location: "Santa Monica Beach, North Courts", area: "Santa Monica",
    total_slots: 6, host_id: "user_p1",
    notes: "Early birds only! Light warmup run then 2-hour rally session. Coffee after.",
    roster: ["user_p1", "user_p3", "user_p7"],
  },
  {
    id: "game_demo_7",
    title: "Wednesday Evening Indoor",
    type: "Indoor", skill: "Intermediate",
    date: "2026-06-24", time: "20:00",
    location: "Planet Fitness Sports Hall", area: "Brentwood",
    total_slots: 10, host_id: "user_p4",
    notes: "Chill midweek game after work. 5v5 format. Parking is easy.",
    roster: ["user_p4", "user_p5", "user_p6", "user_p8", "user_p9", "user_p10"],
  },
  {
    id: "game_demo_8",
    title: "Advanced Grass Doubles",
    type: "Grass", skill: "Advanced",
    date: "2026-06-28", time: "09:00",
    location: "Griffith Park, South Lawn", area: "Los Feliz",
    total_slots: 4, host_id: "user_p13",
    notes: "Serious doubles practice. Looking for players who can serve, pass, and attack consistently.",
    roster: ["user_p13", "user_p15"],
  },
  {
    id: "game_demo_9",
    title: "Beach 6s — Sunset Session",
    type: "Beach", skill: "Intermediate",
    date: "2026-06-26", time: "17:00",
    location: "Redondo Beach, Courts 7–8", area: "Redondo Beach",
    total_slots: 12, host_id: "user_p17",
    notes: "Best sunset on the coast. 3 sets then food at the pier after.",
    roster: ["user_p17", "user_p18", "user_p19", "user_p20", "user_p0", "user_p2"],
  },
  {
    id: "game_demo_10",
    title: "Beginner-Friendly Beach Day",
    type: "Beach", skill: "Beginner",
    date: "2026-07-04", time: "13:00",
    location: "Venice Beach, Boardwalk Courts", area: "Venice",
    total_slots: 8, host_id: "user_p11",
    notes: "Low pressure, high fun. Great intro to outdoor volleyball. Sunscreen provided!",
    roster: ["user_p11", "user_p12", "user_p22", "user_p23"],
  },
];

function resolveUserId(entry) {
  const byId = demoUsers.find((u) => u.id === entry);
  if (byId) return byId.id;
  const byName = demoUsers.find((u) => u.name === entry);
  return byName ? byName.id : null;
}

/** Runs every startup — keeps ALL @demo.test accounts at password 111111
 *  and migrates the 5 main demo users to number-based emails. */
export async function syncDemoPasswords() {
  // Migrate main demo user emails to the easy-to-remember format
  const emailMigrations = [
    { id: "user_maria", email: "1@demo.test", skill: "Intermediate", homeArea: "Santa Monica" },
    { id: "user_theo",  email: "2@demo.test", skill: "Advanced",     homeArea: "Venice" },
    { id: "user_grace", email: "3@demo.test", skill: "Beginner",     homeArea: "Downtown LA" },
    { id: "user_dre",   email: "4@demo.test", skill: "Advanced",     homeArea: "Culver City" },
    { id: "user_nina",  email: "5@demo.test", skill: "All Levels",   homeArea: "Pasadena" },
  ];
  for (const { id, email, skill, homeArea } of emailMigrations) {
    await query(
      `UPDATE users SET email = $1, skill = $2, home_area = $3
       WHERE id = $4 AND email <> $1`,
      [email, skill, homeArea, id]
    );
  }

  // Reset password for ALL @demo.test accounts
  const pw = hashPassword(DEMO_PASSWORD);
  const { rowCount } = await query(
    "UPDATE users SET password_hash = $1 WHERE email LIKE '%@demo.test'",
    [pw]
  );
  if (rowCount > 0) {
    console.log(
      `[seed] synced ${rowCount} demo accounts → password: "${DEMO_PASSWORD}"\n` +
      `[seed] main logins: 1@demo.test … 5@demo.test`
    );
  }
}

/** Runs once on empty DB to insert all demo data. */
export async function seedIfEmpty() {
  const { rows } = await query("SELECT COUNT(*) AS c FROM users");
  if (Number(rows[0].c) > 0) return;

  const now = new Date().toISOString();
  const pw = hashPassword(DEMO_PASSWORD);

  for (const u of demoUsers) {
    await query(
      `INSERT INTO users (id, email, password_hash, name, skill, home_area, bio, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [u.id, u.email, pw, u.name, u.skill, u.homeArea, u.bio || "", now]
    );
  }

  for (const g of demoGames) {
    await query(
      `INSERT INTO games
         (id, title, type, skill, date, time, location, area, total_slots, pre_filled, host_id, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [g.id, g.title, g.type, g.skill, g.date, g.time,
       g.location, g.area, g.total_slots, g.host_id, g.notes, now]
    );
    let seq = 0;
    for (const entry of g.roster) {
      const userId = resolveUserId(entry);
      if (userId) {
        await query(
          `INSERT INTO game_members (game_id, user_id, status, seq)
           VALUES ($1, $2, 'player', $3) ON CONFLICT DO NOTHING`,
          [g.id, userId, seq]
        );
        seq += 1;
      }
    }
  }

  console.log(
    `[seed] inserted ${demoUsers.length} demo users and ${demoGames.length} games\n` +
    `[seed] demo logins: 1@demo.test … 5@demo.test  |  password: "${DEMO_PASSWORD}"`
  );
}

// ---------------------------------------------------------------------------
// Past games + fake reviews/ratings  (idempotent — ON CONFLICT DO NOTHING)
// ---------------------------------------------------------------------------

const pastGames = [
  // --- Maria's reviewable games (she's a player, not host — within 7-day review window) ---
  {
    id: "game_past_4",
    title: "Mixed Beach 4s",
    type: "Beach", skill: "Intermediate",
    date: "2026-06-09", time: "10:00", end_time: "12:00",
    location: "Ocean Park, Net 2", area: "Venice",
    total_slots: 8, host_id: "user_p1",
    notes: "Great vibes, sunny morning session.",
    roster: ["user_p1", "user_maria", "user_p6", "user_p7"],
  },
  {
    id: "game_past_5",
    title: "Evening Indoor Comp",
    type: "Indoor", skill: "Advanced",
    date: "2026-06-11", time: "19:30", end_time: "21:30",
    location: "Iron Court Athletics, Court B", area: "Culver City",
    total_slots: 10, host_id: "user_p4",
    notes: "Fast-paced competitive game. Score to 25.",
    roster: ["user_p4", "user_maria", "user_p8", "user_p9", "user_p10"],
  },
  {
    id: "game_past_6",
    title: "Grass Open Run",
    type: "Grass", skill: "All Levels",
    date: "2026-06-13", time: "11:00", end_time: "13:00",
    location: "Griffith Park, East Lawn", area: "Los Feliz",
    total_slots: 8, host_id: "user_p6",
    notes: "Casual grass game, all welcome.",
    roster: ["user_p6", "user_maria", "user_p7", "user_nina"],
  },
  // --- Older seeded games (outside 7-day review window) ---
  {
    id: "game_past_1",
    title: "Thursday Night Indoor 6s",
    type: "Indoor", skill: "Intermediate",
    date: "2026-06-05", time: "18:00", end_time: "20:00",
    location: "Westside Rec Center, Court 1", area: "Santa Monica",
    total_slots: 12, host_id: "user_theo",
    notes: "Great competitive game. Rotate teams every set.",
    roster: ["user_theo", "user_maria", "user_p0", "user_p1", "user_p2", "user_p3"],
  },
  {
    id: "game_past_2",
    title: "Weekend Beach Tournament",
    type: "Beach", skill: "Advanced",
    date: "2026-06-08", time: "09:00", end_time: "13:00",
    location: "Manhattan Beach, Main Courts", area: "Manhattan Beach",
    total_slots: 8, host_id: "user_dre",
    notes: "High intensity tournament format. Bring your A-game.",
    roster: ["user_dre", "user_p13", "user_p14", "user_p15", "user_p16"],
  },
  {
    id: "game_past_3",
    title: "Sunday Beginner Open",
    type: "Indoor", skill: "Beginner",
    date: "2026-06-10", time: "14:00", end_time: "16:00",
    location: "Lincoln HS Gym", area: "Downtown LA",
    total_slots: 10, host_id: "user_grace",
    notes: "Friendly intro session. All skill welcome.",
    roster: ["user_grace", "user_nina", "user_p11", "user_p12"],
  },
];

// game_reviews: reviewer_id → rates the host of the game
const pastReviews = [
  // Thursday Indoor (host: user_theo)
  { id: "rev_past_1_1", game_id: "game_past_1", reviewer_id: "user_maria",  host_id: "user_theo",  rating: 5, comment: "Theo ran a super smooth game. Great energy and fair rotations!" },
  { id: "rev_past_1_2", game_id: "game_past_1", reviewer_id: "user_p0",     host_id: "user_theo",  rating: 4, comment: "Good organization, would play again." },
  { id: "rev_past_1_3", game_id: "game_past_1", reviewer_id: "user_p1",     host_id: "user_theo",  rating: 5, comment: "One of the best pickup games I've been to." },
  { id: "rev_past_1_4", game_id: "game_past_1", reviewer_id: "user_p2",     host_id: "user_theo",  rating: 4, comment: "Started on time and the court was reserved. 10/10." },
  // Beach Tournament (host: user_dre)
  { id: "rev_past_2_1", game_id: "game_past_2", reviewer_id: "user_p13",    host_id: "user_dre",   rating: 5, comment: "Dre knows how to run a competitive game. Incredible." },
  { id: "rev_past_2_2", game_id: "game_past_2", reviewer_id: "user_p14",    host_id: "user_dre",   rating: 5, comment: "Best beach tournament I've played in a while." },
  { id: "rev_past_2_3", game_id: "game_past_2", reviewer_id: "user_p15",    host_id: "user_dre",   rating: 4, comment: "Really well run. Brackets were fair." },
  // Sunday Beginner Open (host: user_grace)
  { id: "rev_past_3_1", game_id: "game_past_3", reviewer_id: "user_nina",   host_id: "user_grace", rating: 5, comment: "Grace is such a welcoming host. Perfect vibe for beginners." },
  { id: "rev_past_3_2", game_id: "game_past_3", reviewer_id: "user_p11",    host_id: "user_grace", rating: 5, comment: "Learned so much! Grace explained every drill clearly." },
  { id: "rev_past_3_3", game_id: "game_past_3", reviewer_id: "user_p12",    host_id: "user_grace", rating: 4, comment: "Super patient host. Really appreciated the beginner-friendly pace." },
];

// player_ratings: rater_id → rates rated_id for a specific game
const pastPlayerRatings = [
  // Thursday Indoor — user_maria rates teammates
  { id: "pr_1_maria_p0",   game_id: "game_past_1", rater_id: "user_maria",  rated_id: "user_p0",    rating: 4 },
  { id: "pr_1_maria_p1",   game_id: "game_past_1", rater_id: "user_maria",  rated_id: "user_p1",    rating: 5 },
  { id: "pr_1_maria_theo", game_id: "game_past_1", rater_id: "user_maria",  rated_id: "user_theo",  rating: 5 },
  // user_p0 rates
  { id: "pr_1_p0_maria",   game_id: "game_past_1", rater_id: "user_p0",     rated_id: "user_maria", rating: 5 },
  { id: "pr_1_p0_theo",    game_id: "game_past_1", rater_id: "user_p0",     rated_id: "user_theo",  rating: 4 },
  // user_p1 rates
  { id: "pr_1_p1_maria",   game_id: "game_past_1", rater_id: "user_p1",     rated_id: "user_maria", rating: 5 },
  { id: "pr_1_p1_p2",      game_id: "game_past_1", rater_id: "user_p1",     rated_id: "user_p2",    rating: 3 },
  // user_p2 rates
  { id: "pr_1_p2_theo",    game_id: "game_past_1", rater_id: "user_p2",     rated_id: "user_theo",  rating: 5 },
  { id: "pr_1_p2_p1",      game_id: "game_past_1", rater_id: "user_p2",     rated_id: "user_p1",    rating: 4 },
  // user_theo rates
  { id: "pr_1_theo_maria", game_id: "game_past_1", rater_id: "user_theo",   rated_id: "user_maria", rating: 5 },
  { id: "pr_1_theo_p3",    game_id: "game_past_1", rater_id: "user_theo",   rated_id: "user_p3",    rating: 4 },

  // Beach Tournament
  { id: "pr_2_p13_dre",    game_id: "game_past_2", rater_id: "user_p13",    rated_id: "user_dre",   rating: 5 },
  { id: "pr_2_p13_p14",    game_id: "game_past_2", rater_id: "user_p13",    rated_id: "user_p14",   rating: 4 },
  { id: "pr_2_p14_dre",    game_id: "game_past_2", rater_id: "user_p14",    rated_id: "user_dre",   rating: 5 },
  { id: "pr_2_p14_p13",    game_id: "game_past_2", rater_id: "user_p14",    rated_id: "user_p13",   rating: 5 },
  { id: "pr_2_p15_dre",    game_id: "game_past_2", rater_id: "user_p15",    rated_id: "user_dre",   rating: 4 },
  { id: "pr_2_p15_p16",    game_id: "game_past_2", rater_id: "user_p15",    rated_id: "user_p16",   rating: 3 },
  { id: "pr_2_p16_p13",    game_id: "game_past_2", rater_id: "user_p16",    rated_id: "user_p13",   rating: 4 },
  { id: "pr_2_dre_p13",    game_id: "game_past_2", rater_id: "user_dre",    rated_id: "user_p13",   rating: 5 },
  { id: "pr_2_dre_p15",    game_id: "game_past_2", rater_id: "user_dre",    rated_id: "user_p15",   rating: 4 },

  // Sunday Beginner Open
  { id: "pr_3_nina_grace", game_id: "game_past_3", rater_id: "user_nina",   rated_id: "user_grace", rating: 5 },
  { id: "pr_3_nina_p11",   game_id: "game_past_3", rater_id: "user_nina",   rated_id: "user_p11",   rating: 3 },
  { id: "pr_3_p11_grace",  game_id: "game_past_3", rater_id: "user_p11",    rated_id: "user_grace", rating: 5 },
  { id: "pr_3_p11_nina",   game_id: "game_past_3", rater_id: "user_p11",    rated_id: "user_nina",  rating: 4 },
  { id: "pr_3_p12_grace",  game_id: "game_past_3", rater_id: "user_p12",    rated_id: "user_grace", rating: 5 },
  { id: "pr_3_p12_p11",    game_id: "game_past_3", rater_id: "user_p12",    rated_id: "user_p11",   rating: 4 },
  { id: "pr_3_grace_nina", game_id: "game_past_3", rater_id: "user_grace",  rated_id: "user_nina",  rating: 5 },
  { id: "pr_3_grace_p12",  game_id: "game_past_3", rater_id: "user_grace",  rated_id: "user_p12",   rating: 4 },
];

/** Idempotent — inserts past games, host reviews, and player ratings. Safe to call repeatedly. */
export async function seedPastData() {
  const now = new Date().toISOString();

  for (const g of pastGames) {
    await query(
      `INSERT INTO games
         (id, title, type, skill, date, time, end_time, location, area, total_slots, pre_filled, host_id, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, $12, $13)
       ON CONFLICT (id) DO NOTHING`,
      [g.id, g.title, g.type, g.skill, g.date, g.time, g.end_time,
       g.location, g.area, g.total_slots, g.host_id, g.notes, now]
    );
    let seq = 0;
    for (const entry of g.roster) {
      const userId = resolveUserId(entry);
      if (userId) {
        await query(
          `INSERT INTO game_members (game_id, user_id, status, seq)
           VALUES ($1, $2, 'player', $3) ON CONFLICT DO NOTHING`,
          [g.id, userId, seq]
        );
        seq += 1;
      }
    }
  }

  for (const r of pastReviews) {
    await query(
      `INSERT INTO game_reviews (id, game_id, reviewer_id, host_id, rating, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (game_id, reviewer_id) DO NOTHING`,
      [r.id, r.game_id, r.reviewer_id, r.host_id, r.rating, r.comment, now]
    );
  }

  for (const pr of pastPlayerRatings) {
    await query(
      `INSERT INTO player_ratings (id, game_id, rater_id, rated_id, rating, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (game_id, rater_id, rated_id) DO NOTHING`,
      [pr.id, pr.game_id, pr.rater_id, pr.rated_id, pr.rating, now]
    );
  }

  console.log(
    `[seed] seedPastData: ${pastGames.length} past games, ` +
    `${pastReviews.length} host reviews, ${pastPlayerRatings.length} player ratings`
  );
}
