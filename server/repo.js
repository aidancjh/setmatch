// Repository: all SQL lives here. Returns objects shaped exactly like the
// frontend's TypeScript types (Game, Player, Profile) so the React app needs no
// changes to how it reads data. All functions are async (Postgres is networked).
import crypto from "node:crypto";
import { query, uid, withTransaction } from "./db.js";

// --- Users ----------------------------------------------------------------

export async function findUserByEmail(email) {
  const { rows } = await query("SELECT * FROM users WHERE email = $1", [
    email.toLowerCase(),
  ]);
  return rows[0];
}

export async function findUserById(id) {
  const { rows } = await query("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0];
}

export async function createUser({ email, passwordHash, name }) {
  const id = uid("user");
  await query(
    `INSERT INTO users (id, email, password_hash, name, skill, home_area, created_at)
     VALUES ($1, $2, $3, $4, 'Intermediate', '', $5)`,
    [id, email.toLowerCase(), passwordHash, name, new Date().toISOString()]
  );
  return findUserById(id);
}

export async function updateUser(id, { name, skill, homeArea, bio, avatarUrl, birthdate, userGender, showAge, showGender, favoritePositions, bannerColor, bannerImage }) {
  const cur = await findUserById(id);
  if (!cur) return null;
  await query(
    `UPDATE users SET name = $1, skill = $2, home_area = $3, bio = $4, avatar_url = $5,
      birthdate = $6, user_gender = $7, show_age = $8, show_gender = $9,
      favorite_positions = $10, banner_color = $11, banner_image = $12 WHERE id = $13`,
    [
      name ?? cur.name,
      skill ?? cur.skill,
      homeArea ?? cur.home_area,
      bio ?? cur.bio ?? "",
      avatarUrl ?? cur.avatar_url ?? "",
      birthdate !== undefined ? birthdate : (cur.birthdate ?? null),
      userGender !== undefined ? userGender : (cur.user_gender || ""),
      showAge !== undefined ? showAge : (cur.show_age !== false),
      showGender !== undefined ? showGender : (cur.show_gender !== false),
      favoritePositions !== undefined
        ? JSON.stringify(favoritePositions)
        : (cur.favorite_positions || "[]"),
      bannerColor !== undefined ? bannerColor : (cur.banner_color || ""),
      bannerImage !== undefined ? bannerImage : (cur.banner_image || ""),
      id,
    ]
  );
  return findUserById(id);
}

function computeAge(birthdate) {
  if (!birthdate) return null;
  const [y, m, d] = birthdate.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age >= 0 ? age : null;
}

/** Public profile of any user: basic info + participation stats. */
export async function getUserProfile(userId) {
  const u = await findUserById(userId);
  if (!u) return null;
  const hosted = Number(
    (await query("SELECT COUNT(*) AS c FROM games WHERE host_id = $1", [userId]))
      .rows[0].c
  );
  const played = Number(
    (
      await query(
        "SELECT COUNT(*) AS c FROM game_members WHERE user_id = $1 AND status = 'player'",
        [userId]
      )
    ).rows[0].c
  );
  const today = new Date().toISOString().slice(0, 10);
  const { rows } = await query(
    "SELECT * FROM games WHERE host_id = $1 AND date >= $2 ORDER BY date ASC LIMIT 10",
    [userId, today]
  );
  const hostedUpcoming = await serializeGames(rows);
  const age = computeAge(u.birthdate);
  const rating = await getPlayerRating(userId);
  return {
    id: u.id,
    name: u.name,
    skill: u.skill,
    homeArea: u.home_area,
    bio: u.bio || "",
    avatarUrl: u.avatar_url || "",
    memberSince: u.created_at,
    gamesHosted: hosted,
    gamesPlayed: played,
    hostedUpcoming,
    ageDisplay: u.show_age !== false && age !== null ? String(age) : undefined,
    genderDisplay: u.show_gender !== false && u.user_gender ? u.user_gender : undefined,
    favoritePositions: parseJsonArr(u.favorite_positions),
    playerRating: rating,
    bannerColor: u.banner_color || "",
    bannerImage: u.banner_image || "",
  };
}

/** Strip the password hash before sending a user to the client. */
export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    skill: row.skill,
    homeArea: row.home_area,
    bio: row.bio || "",
    avatarUrl: row.avatar_url || "",
    role: row.role || "user",
    birthdate: row.birthdate || null,
    userGender: row.user_gender || "",
    showAge: row.show_age !== false,
    showGender: row.show_gender !== false,
    favoritePositions: parseJsonArr(row.favorite_positions),
    bannerColor: row.banner_color || "",
    bannerImage: row.banner_image || "",
  };
}

// --- Admin / authorization -------------------------------------------------

/**
 * Promote any emails in ADMIN_EMAILS (comma-separated) to admin.
 * Runs on every startup; idempotent (only updates rows that aren't admin yet).
 * Set ADMIN_EMAILS in your environment (.env locally, host variables in prod)
 * to grant admin — no emails are hardcoded in source.
 */
export async function promoteAdminsFromEnv() {
  const fromEnv = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const list = [...new Set(fromEnv)];
  for (const email of list) {
    const r = await query(
      "UPDATE users SET role = 'admin' WHERE email = $1 AND role <> 'admin'",
      [email]
    );
    if (r.rowCount > 0) console.log(`[auth] granted admin to ${email}`);
  }
}

export async function getRole(userId) {
  const u = await findUserById(userId);
  return u ? u.role || "user" : null;
}

// --- Maintenance / cleanup -------------------------------------------------

/**
 * Delete rows that have served their purpose so these tables don't grow without
 * bound. Safe to run repeatedly; called on startup and on an interval from
 * start() in index.js. Returns a summary for logging.
 *
 * created_at / expires_at are stored as ISO-8601 strings, so lexical comparison
 * against an ISO timestamp is also chronological.
 */
export async function pruneExpired() {
  const now = new Date().toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const tokens = await query(
    "DELETE FROM password_reset_tokens WHERE expires_at < $1",
    [now]
  );
  // Idempotency keys only need to outlive a client's retry window.
  const keys = await query(
    "DELETE FROM idempotency_keys WHERE created_at < $1",
    [dayAgo]
  );
  // Old notifications the user has already seen.
  const notifs = await query(
    "DELETE FROM notifications WHERE read = TRUE AND created_at < $1",
    [monthAgo]
  );
  return {
    resetTokens: tokens.rowCount,
    idempotencyKeys: keys.rowCount,
    notifications: notifs.rowCount,
  };
}

/**
 * Notify members of games happening tomorrow (once). `reminder_sent` guards
 * against repeat reminders. Called on an interval from start() in index.js.
 */
export async function sendDueReminders() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const { rows } = await query(
    "SELECT id, title FROM games WHERE date = $1 AND reminder_sent = FALSE",
    [tomorrow]
  );
  let notified = 0;
  for (const g of rows) {
    const members = await memberUserIds(g.id);
    await notifyUsers(members, "reminder", `Reminder: "${g.title}" is tomorrow`, g.id);
    await query("UPDATE games SET reminder_sent = TRUE WHERE id = $1", [g.id]);
    notified += members.length;
  }
  return { games: rows.length, notified };
}

// --- User blocking ---------------------------------------------------------

export async function blockUser(blockerId, blockedId) {
  if (blockerId === blockedId)
    return { ok: false, code: 400, error: "You can't block yourself." };
  const target = await findUserById(blockedId);
  if (!target) return { ok: false, code: 404, error: "User not found." };
  await query(
    `INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES ($1, $2, $3)
     ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
    [blockerId, blockedId, new Date().toISOString()]
  );
  return { ok: true };
}

export async function unblockUser(blockerId, blockedId) {
  await query("DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2", [
    blockerId,
    blockedId,
  ]);
  return { ok: true };
}

export async function listBlocked(blockerId) {
  const { rows } = await query(
    `SELECT b.blocked_id AS id, u.name, u.avatar_url
       FROM blocks b JOIN users u ON u.id = b.blocked_id
      WHERE b.blocker_id = $1
      ORDER BY b.created_at DESC`,
    [blockerId]
  );
  return rows.map((r) => ({ id: r.id, name: r.name, avatarUrl: r.avatar_url || "" }));
}

export async function isBlocked(blockerId, blockedId) {
  const { rows } = await query(
    "SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2",
    [blockerId, blockedId]
  );
  return rows.length > 0;
}

export async function adminStats() {
  const one = async (sql, params = []) =>
    Number((await query(sql, params)).rows[0].c);
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  // Signups per week for the last 8 weeks (oldest first) — a simple growth chart.
  const { rows: weekRows } = await query(
    `SELECT to_char(date_trunc('week', created_at::timestamptz), 'YYYY-MM-DD') AS week,
            COUNT(*)::int AS c
       FROM users
      WHERE created_at::timestamptz >= NOW() - INTERVAL '8 weeks'
      GROUP BY week
      ORDER BY week ASC`
  );
  const signupsByWeek = weekRows.map((r) => ({ week: r.week, count: Number(r.c) }));

  return {
    users: await one("SELECT COUNT(*) AS c FROM users"),
    newUsers7d: await one(
      "SELECT COUNT(*) AS c FROM users WHERE created_at >= $1",
      [weekAgo]
    ),
    newUsers30d: await one(
      "SELECT COUNT(*) AS c FROM users WHERE created_at >= $1",
      [monthAgo]
    ),
    suspendedUsers: await one(
      "SELECT COUNT(*) AS c FROM users WHERE suspended = TRUE"
    ),
    games: await one("SELECT COUNT(*) AS c FROM games"),
    upcomingGames: await one(
      "SELECT COUNT(*) AS c FROM games WHERE date >= $1",
      [today]
    ),
    highlights: await one("SELECT COUNT(*) AS c FROM highlights"),
    comments: await one("SELECT COUNT(*) AS c FROM game_comments"),
    signupsByWeek,
  };
}

export async function adminListUsers() {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.skill, u.created_at, u.suspended,
            (SELECT COUNT(*) FROM games g WHERE g.host_id = u.id) AS hosted,
            (SELECT COUNT(*) FROM game_members m WHERE m.user_id = u.id) AS joined
       FROM users u
      ORDER BY u.created_at DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role || "user",
    skill: r.skill,
    createdAt: r.created_at,
    suspended: r.suspended === true,
    hosted: Number(r.hosted),
    joined: Number(r.joined),
  }));
}

export async function adminListGames() {
  const { rows } = await query("SELECT * FROM games ORDER BY date DESC");
  return serializeGames(rows);
}

export async function setUserRole(userId, role) {
  if (!["user", "staff", "admin"].includes(role)) return null;
  await query("UPDATE users SET role = $1 WHERE id = $2", [role, userId]);
  return findUserById(userId);
}

export async function setUserSuspended(userId, suspended) {
  await query("UPDATE users SET suspended = $1 WHERE id = $2", [
    suspended === true,
    userId,
  ]);
  return findUserById(userId);
}

/** Permanently delete a user and all their data (FKs cascade). */
export async function adminDeleteUser(userId) {
  await query("DELETE FROM users WHERE id = $1", [userId]);
}

export async function adminDeleteGame(gameId) {
  const { rows } = await query("SELECT title FROM games WHERE id = $1", [gameId]);
  await query("DELETE FROM games WHERE id = $1", [gameId]);
  return rows[0]?.title || gameId;
}

// --- Admin content moderation ---------------------------------------------

/** Recent highlights across all users, for moderation. */
export async function adminListHighlights(limit = 100) {
  const { rows } = await query(
    `${HL_SELECT} ORDER BY h.created_at DESC LIMIT $1`,
    [limit]
  );
  return rows.map(serializeHighlight);
}

export async function adminDeleteHighlight(id) {
  const { rows } = await query(
    "SELECT u.name FROM highlights h JOIN users u ON u.id = h.user_id WHERE h.id = $1",
    [id]
  );
  await query("DELETE FROM highlights WHERE id = $1", [id]);
  return rows[0]?.name || id;
}

/** Recent comments (game + highlight) merged, newest first, for moderation. */
export async function adminListComments(limit = 60) {
  const { rows } = await query(
    `SELECT * FROM (
       SELECT c.id, 'game' AS kind, c.body, c.created_at,
              u.name AS author, c.game_id AS ref_id, g.title AS ref_title
         FROM game_comments c
         JOIN users u ON u.id = c.user_id
         JOIN games g ON g.id = c.game_id
       UNION ALL
       SELECT c.id, 'highlight' AS kind, c.body, c.created_at,
              u.name AS author, c.highlight_id AS ref_id,
              COALESCE(NULLIF(h.caption, ''), 'Highlight') AS ref_title
         FROM highlight_comments c
         JOIN users u ON u.id = c.user_id
         JOIN highlights h ON h.id = c.highlight_id
     ) merged
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    body: r.body,
    author: r.author,
    refId: r.ref_id,
    refTitle: r.ref_title,
    createdAt: r.created_at,
  }));
}

export async function adminDeleteComment(kind, id) {
  const table = kind === "highlight" ? "highlight_comments" : "game_comments";
  await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
}

// --- Admin audit log -------------------------------------------------------

/** Record an admin action. Best-effort: never throws into the request path. */
export async function logAdminAction(adminId, action, detail = "") {
  try {
    await query(
      `INSERT INTO admin_audit (id, admin_id, action, detail, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [uid("aud"), adminId || null, action, detail || "", new Date().toISOString()]
    );
  } catch (err) {
    console.error("[audit] failed to log admin action:", err);
  }
}

export async function adminListAudit(limit = 100) {
  const { rows } = await query(
    `SELECT a.id, a.action, a.detail, a.created_at,
            u.name AS admin_name, u.email AS admin_email
       FROM admin_audit a
       LEFT JOIN users u ON u.id = a.admin_id
      ORDER BY a.created_at DESC
      LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    detail: r.detail,
    adminName: r.admin_name || "(removed admin)",
    adminEmail: r.admin_email || "",
    createdAt: r.created_at,
  }));
}

// --- Admin feedback inbox --------------------------------------------------

export async function adminListFeedback() {
  const { rows } = await query(
    `SELECT f.id, f.type, f.subject, f.body, f.created_at, f.resolved,
            u.name AS user_name, u.email AS user_email
       FROM feedback f
       LEFT JOIN users u ON u.id = f.user_id
      ORDER BY f.resolved ASC, f.created_at DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    subject: r.subject || "",
    body: r.body,
    resolved: r.resolved === true,
    userName: r.user_name || "(deleted user)",
    userEmail: r.user_email || "",
    createdAt: r.created_at,
  }));
}

export async function setFeedbackResolved(id, resolved) {
  await query("UPDATE feedback SET resolved = $1 WHERE id = $2", [
    resolved === true,
    id,
  ]);
}

export async function adminDeleteFeedback(id) {
  await query("DELETE FROM feedback WHERE id = $1", [id]);
}

// --- Reports queue ---------------------------------------------------------

const REPORT_TYPES = ["game", "highlight", "game_comment", "highlight_comment"];

/** Create a report. Dedupes open reports per user+target. */
export async function createReport(reporterId, targetType, targetId, reason) {
  if (!REPORT_TYPES.includes(targetType) || !targetId)
    return { ok: false, code: 400, error: "Invalid report." };
  const { rows: dup } = await query(
    `SELECT 1 FROM reports
      WHERE reporter_id = $1 AND target_type = $2 AND target_id = $3 AND status = 'open'`,
    [reporterId, targetType, targetId]
  );
  if (dup[0]) return { ok: true, already: true };
  await query(
    `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status, created_at)
     VALUES ($1, $2, $3, $4, $5, 'open', $6)`,
    [uid("rpt"), reporterId, targetType, targetId, (reason || "").slice(0, 500), new Date().toISOString()]
  );
  return { ok: true };
}

export async function adminListReports() {
  const { rows } = await query(
    `SELECT r.id, r.target_type, r.target_id, r.reason, r.status, r.created_at,
            u.name AS reporter_name
       FROM reports r
       LEFT JOIN users u ON u.id = r.reporter_id
      ORDER BY (r.status = 'open') DESC, r.created_at DESC
      LIMIT 200`
  );
  return rows.map((r) => ({
    id: r.id,
    targetType: r.target_type,
    targetId: r.target_id,
    reason: r.reason || "",
    status: r.status,
    reporterName: r.reporter_name || "(deleted user)",
    createdAt: r.created_at,
  }));
}

export async function adminSetReportStatus(id, status) {
  if (!["open", "resolved", "dismissed"].includes(status)) return false;
  await query("UPDATE reports SET status = $1 WHERE id = $2", [status, id]);
  return true;
}

export async function openReportsCount() {
  const { rows } = await query(
    "SELECT COUNT(*) AS c FROM reports WHERE status = 'open'"
  );
  return Number(rows[0].c);
}

// --- Feature flags ---------------------------------------------------------

let flagsCache = null;
let flagsCacheAt = 0;
const FLAGS_TTL_MS = 15000;

/** All flags as a {key: boolean} map, cached briefly to avoid per-request DB hits. */
export async function getFlags() {
  if (flagsCache && Date.now() - flagsCacheAt < FLAGS_TTL_MS) return flagsCache;
  const { rows } = await query("SELECT key, enabled FROM feature_flags");
  const map = {};
  for (const r of rows) map[r.key] = r.enabled === true;
  flagsCache = map;
  flagsCacheAt = Date.now();
  return map;
}

export async function getFlag(key) {
  return (await getFlags())[key] === true;
}

export async function setFlag(key, enabled) {
  await query(
    `INSERT INTO feature_flags (key, enabled, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET enabled = $2, updated_at = $3`,
    [key, enabled === true, new Date().toISOString()]
  );
  flagsCache = null; // bust cache so the change takes effect immediately
}

// --- Notifications --------------------------------------------------------

export async function createNotification(userId, type, message, gameId) {
  await query(
    `INSERT INTO notifications (id, user_id, type, message, game_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [uid("ntf"), userId, type, message, gameId ?? null, new Date().toISOString()]
  );
}

/** Admin broadcast: send one announcement notification to every user. Returns recipient count. */
export async function broadcastAnnouncement(message) {
  const r = await query(
    `INSERT INTO notifications (id, user_id, type, message, game_id, read, created_at)
     SELECT 'ntf_' || substr(md5(random()::text || u.id || clock_timestamp()::text), 1, 16),
            u.id, 'announcement', $1, NULL, FALSE, $2
       FROM users u`,
    [message, new Date().toISOString()]
  );
  return r.rowCount;
}

/** Notify several users at once (skips empties and de-dupes). */
async function notifyUsers(userIds, type, message, gameId) {
  const unique = [...new Set(userIds.filter(Boolean))];
  for (const uidv of unique) {
    await createNotification(uidv, type, message, gameId);
  }
}

/** All user_ids that are members (players or waitlist) of a game. */
async function memberUserIds(gameId) {
  const { rows } = await query(
    "SELECT user_id FROM game_members WHERE game_id = $1",
    [gameId]
  );
  return rows.map((r) => r.user_id);
}

export async function listNotifications(userId) {
  const { rows } = await query(
    `SELECT id, type, message, game_id, read, created_at
       FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [userId]
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    message: r.message,
    gameId: r.game_id,
    read: r.read,
    createdAt: r.created_at,
  }));
}

export async function unreadCount(userId) {
  const { rows } = await query(
    "SELECT COUNT(*) AS c FROM notifications WHERE user_id = $1 AND read = FALSE",
    [userId]
  );
  return Number(rows[0].c);
}

export async function markAllRead(userId) {
  await query(
    "UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE",
    [userId]
  );
}

/** Mark a single notification read (scoped to its owner). Returns the new unread count. */
export async function markNotificationRead(userId, id) {
  await query(
    "UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2",
    [id, userId]
  );
  return unreadCount(userId);
}

// --- Games ----------------------------------------------------------------

function parseJsonArr(val) {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

/**
 * Build full Game objects for many rows using a FIXED number of queries,
 * regardless of how many games are passed in (no per-game N+1):
 *   1) all hosts, 2) all members (players + waitlist), 3) all interest rows.
 * The per-game data is then grouped in memory. `serializeGame` (single) just
 * delegates here so there's one source of truth for the shape.
 */
async function serializeGames(rows) {
  const games = rows.filter(Boolean);
  if (games.length === 0) return [];

  const gameIds = games.map((g) => g.id);
  const hostIds = [...new Set(games.map((g) => g.host_id))];

  const [hostsRes, membersRes, interestRes] = await Promise.all([
    query("SELECT id, name FROM users WHERE id = ANY($1)", [hostIds]),
    query(
      `SELECT m.game_id, m.status, m.paid, u.id, u.name
         FROM game_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.game_id = ANY($1)
        ORDER BY m.seq ASC`,
      [gameIds]
    ),
    query("SELECT game_id, user_id FROM game_interest WHERE game_id = ANY($1)", [
      gameIds,
    ]),
  ]);

  const hostName = new Map(hostsRes.rows.map((h) => [h.id, h.name]));

  // Bucket members per game. Rows arrive in seq order, so each game's list
  // preserves its join order.
  const playersByGame = new Map();
  const waitlistByGame = new Map();
  for (const m of membersRes.rows) {
    const byGame = m.status === "waitlist" ? waitlistByGame : playersByGame;
    if (!byGame.has(m.game_id)) byGame.set(m.game_id, []);
    byGame.get(m.game_id).push({ id: m.id, name: m.name, paid: m.paid === true });
  }

  const interestByGame = new Map();
  for (const i of interestRes.rows) {
    if (!interestByGame.has(i.game_id)) interestByGame.set(i.game_id, []);
    interestByGame.get(i.game_id).push(i.user_id);
  }

  return games.map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    skill: row.skill,
    gender: row.gender || "Open",
    netHeight: row.net_height || "Venue Standard",
    positionsNeeded: parseJsonArr(row.positions_needed),
    rotationType: row.rotation_type || "Standard",
    costPerPerson: Number(row.cost_per_person || 0),
    region: row.region || "",
    date: row.date,
    time: row.time,
    endTime: row.end_time || "",
    location: row.location,
    area: row.area,
    totalSlots: row.total_slots,
    preFilled: row.pre_filled || 0,
    hostId: row.host_id,
    hostName: hostName.get(row.host_id) || "Unknown",
    notes: row.notes,
    players: playersByGame.get(row.id) || [],
    waitlist: waitlistByGame.get(row.id) || [],
    interestedIds: interestByGame.get(row.id) || [],
    seriesId: row.series_id || null,
    createdAt: row.created_at,
  }));
}

/** Build the full Game object the frontend expects from a single games row. */
async function serializeGame(row) {
  if (!row) return null;
  const [game] = await serializeGames([row]);
  return game || null;
}

export async function listGames() {
  const { rows } = await query("SELECT * FROM games");
  return serializeGames(rows);
}

async function getGameRow(id) {
  const { rows } = await query("SELECT * FROM games WHERE id = $1", [id]);
  return rows[0];
}

export async function getGame(id) {
  return serializeGame(await getGameRow(id));
}

export async function createGame(hostId, input) {
  const id = uid("game");
  const now = new Date().toISOString();
  await query(
    `INSERT INTO games
       (id, title, type, skill, date, time, end_time, location, area, total_slots, pre_filled, host_id, notes,
        gender, net_height, positions_needed, rotation_type, cost_per_person, region, series_id, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
    [
      id,
      input.title,
      input.type,
      input.skill,
      input.date,
      input.time,
      input.endTime || "",
      input.location,
      input.area,
      input.totalSlots,
      input.preFilled || 0,
      hostId,
      input.notes || "",
      input.gender || "Open",
      input.netHeight || "Venue Standard",
      JSON.stringify(input.positionsNeeded || []),
      input.rotationType || "Standard",
      Number(input.costPerPerson) || 0,
      input.region || "",
      input.seriesId || null,
      now,
    ]
  );
  // Host takes the first slot.
  await query(
    "INSERT INTO game_members (game_id, user_id, status, seq) VALUES ($1, $2, 'player', 0)",
    [id, hostId]
  );
  return getGame(id);
}

/** Idempotency: returns a previously-created game for this key, or null. */
export async function getIdempotentGame(key) {
  if (!key) return null;
  const { rows } = await query(
    "SELECT game_id FROM idempotency_keys WHERE key = $1",
    [key]
  );
  if (rows.length === 0 || !rows[0].game_id) return null;
  return getGame(rows[0].game_id);
}

export async function saveIdempotentKey(key, gameId) {
  if (!key) return;
  await query(
    "INSERT INTO idempotency_keys (key, game_id, created_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING",
    [key, gameId, new Date().toISOString()]
  );
}

async function playerCount(gameId) {
  const { rows } = await query(
    "SELECT COUNT(*) AS c FROM game_members WHERE game_id = $1 AND status = 'player'",
    [gameId]
  );
  return Number(rows[0].c);
}

/**
 * Promote waitlisted players (earliest first) until the game is full.
 * Returns the user_ids that were promoted, so callers can notify them.
 *
 * Runs every read+write on `exec` (a transaction client) so the caller can
 * hold a `FOR UPDATE` lock on the game row for the whole promotion — without
 * that lock two concurrent leaves could promote the same waitlister twice or
 * over-fill the game.
 */
async function promoteWaitlistToFill(exec, gameId, totalSlots) {
  const promoted = [];
  for (;;) {
    const { rows: pc } = await exec.query(
      "SELECT COUNT(*) AS c FROM game_members WHERE game_id = $1 AND status = 'player'",
      [gameId]
    );
    if (Number(pc[0].c) >= totalSlots) break;
    const { rows } = await exec.query(
      `SELECT user_id FROM game_members
        WHERE game_id = $1 AND status = 'waitlist'
        ORDER BY seq ASC LIMIT 1`,
      [gameId]
    );
    if (rows.length === 0) break;
    await exec.query(
      "UPDATE game_members SET status = 'player' WHERE game_id = $1 AND user_id = $2",
      [gameId, rows[0].user_id]
    );
    promoted.push(rows[0].user_id);
  }
  return promoted;
}

export async function joinGame(gameId, userId) {
  const game = await getGameRow(gameId);
  if (!game) return null;

  // Capacity check + insert run under a row lock on the game so two people
  // racing for the last open slot can't both end up confirmed (overselling).
  // `FOR UPDATE` serializes concurrent joins on the same game: the second
  // transaction blocks until the first commits, then sees the updated count.
  const status = await withTransaction(async (client) => {
    const { rows: locked } = await client.query(
      "SELECT total_slots FROM games WHERE id = $1 FOR UPDATE",
      [gameId]
    );
    if (locked.length === 0) return "gone";
    const { rows: existing } = await client.query(
      "SELECT 1 FROM game_members WHERE game_id = $1 AND user_id = $2",
      [gameId, userId]
    );
    if (existing.length > 0) return "existing"; // already joined/waitlisted
    const { rows: pc } = await client.query(
      "SELECT COUNT(*) AS c FROM game_members WHERE game_id = $1 AND status = 'player'",
      [gameId]
    );
    const { rows: seqRow } = await client.query(
      "SELECT COALESCE(MAX(seq), -1) AS m FROM game_members WHERE game_id = $1",
      [gameId]
    );
    const next = Number(pc[0].c) < locked[0].total_slots ? "player" : "waitlist";
    await client.query(
      "INSERT INTO game_members (game_id, user_id, status, seq) VALUES ($1, $2, $3, $4)",
      [gameId, userId, next, Number(seqRow[0].m) + 1]
    );
    return next;
  });

  if (status === "gone") return null;
  if (status === "existing") return getGame(gameId);

  // Tell the host someone joined (unless the host is joining their own game).
  if (userId !== game.host_id) {
    const actor = await findUserById(userId);
    const who = actor ? actor.name : "Someone";
    const verb =
      status === "player"
        ? `${who} joined your game`
        : `${who} joined the waitlist for`;
    await createNotification(game.host_id, "join", `${verb} "${game.title}"`, gameId);
  }
  return getGame(gameId);
}

export async function leaveGame(gameId, userId) {
  const game = await getGameRow(gameId);
  if (!game) return null;

  // Delete + waitlist promotion run under the game's row lock so the freed
  // slot is filled atomically (no double-promotion under concurrent leaves).
  const promoted = await withTransaction(async (client) => {
    await client.query("SELECT 1 FROM games WHERE id = $1 FOR UPDATE", [gameId]);
    await client.query(
      "DELETE FROM game_members WHERE game_id = $1 AND user_id = $2",
      [gameId, userId]
    );
    return promoteWaitlistToFill(client, gameId, game.total_slots);
  });

  // Notify the host that someone left (unless the host themselves left).
  if (userId !== game.host_id) {
    const actor = await findUserById(userId);
    await createNotification(
      game.host_id,
      "leave",
      `${actor ? actor.name : "Someone"} left "${game.title}"`,
      gameId
    );
  }
  // Tell anyone promoted off the waitlist that they're now in.
  await notifyUsers(
    promoted,
    "promoted",
    `A spot opened up in "${game.title}" — you're in!`,
    gameId
  );
  return getGame(gameId);
}

/** Host removes a player or waitlister. Frees the slot (auto-promotes waitlist). */
export async function removeMember(gameId, hostId, targetUserId) {
  const game = await getGameRow(gameId);
  if (!game) return { ok: false, code: 404, error: "Game not found." };
  if (game.host_id !== hostId)
    return { ok: false, code: 403, error: "Only the host can manage the roster." };
  if (targetUserId === hostId)
    return { ok: false, code: 400, error: "The host can't remove themselves." };

  const promoted = await withTransaction(async (client) => {
    await client.query("SELECT 1 FROM games WHERE id = $1 FOR UPDATE", [gameId]);
    const { rowCount } = await client.query(
      "DELETE FROM game_members WHERE game_id = $1 AND user_id = $2",
      [gameId, targetUserId]
    );
    if (rowCount === 0) return null;
    return promoteWaitlistToFill(client, gameId, game.total_slots);
  });
  if (promoted === null)
    return { ok: false, code: 404, error: "That player isn't in this game." };

  await createNotification(
    targetUserId,
    "cancelled",
    `You were removed from "${game.title}" by the host`,
    gameId
  );
  await notifyUsers(promoted, "promoted", `A spot opened up in "${game.title}" — you're in!`, gameId);
  return { ok: true, game: await getGame(gameId) };
}

/** Host manually promotes a specific waitlister into an open slot. */
export async function promoteMember(gameId, hostId, targetUserId) {
  const game = await getGameRow(gameId);
  if (!game) return { ok: false, code: 404, error: "Game not found." };
  if (game.host_id !== hostId)
    return { ok: false, code: 403, error: "Only the host can manage the roster." };

  const result = await withTransaction(async (client) => {
    await client.query("SELECT 1 FROM games WHERE id = $1 FOR UPDATE", [gameId]);
    const { rows } = await client.query(
      "SELECT status FROM game_members WHERE game_id = $1 AND user_id = $2",
      [gameId, targetUserId]
    );
    if (rows.length === 0) return { code: 404, error: "That player isn't on the waitlist." };
    if (rows[0].status === "player") return { code: 400, error: "That player is already in the game." };
    const { rows: pc } = await client.query(
      "SELECT COUNT(*) AS c FROM game_members WHERE game_id = $1 AND status = 'player'",
      [gameId]
    );
    if (Number(pc[0].c) >= game.total_slots)
      return { code: 400, error: "The game is full — remove a player first." };
    await client.query(
      "UPDATE game_members SET status = 'player' WHERE game_id = $1 AND user_id = $2",
      [gameId, targetUserId]
    );
    return { ok: true };
  });
  if (!result.ok) return { ok: false, code: result.code, error: result.error };

  await createNotification(
    targetUserId,
    "promoted",
    `The host moved you into "${game.title}" — you're in!`,
    gameId
  );
  return { ok: true, game: await getGame(gameId) };
}

export async function updateGame(gameId, userId, input) {
  const row = await getGameRow(gameId);
  if (!row) return { ok: false, code: 404, error: "Game not found." };
  if (row.host_id !== userId)
    return { ok: false, code: 403, error: "Only the host can edit this game." };

  const confirmed = await playerCount(gameId);
  if (input.totalSlots < confirmed)
    return {
      ok: false,
      code: 400,
      error: `This game already has ${confirmed} confirmed player${
        confirmed === 1 ? "" : "s"
      } — total slots can't be fewer than that.`,
    };

  // Apply the edit and (if total slots grew) fill open spots from the waitlist
  // atomically under the game's row lock.
  const promoted = await withTransaction(async (client) => {
    await client.query("SELECT 1 FROM games WHERE id = $1 FOR UPDATE", [gameId]);
    await client.query(
      `UPDATE games
          SET title = $1, type = $2, skill = $3, date = $4, time = $5, end_time = $6,
              location = $7, area = $8, total_slots = $9, notes = $10,
              gender = $11, net_height = $12, positions_needed = $13,
              rotation_type = $14, cost_per_person = $15, region = $16
        WHERE id = $17`,
      [
        input.title,
        input.type,
        input.skill,
        input.date,
        input.time,
        input.endTime || "",
        input.location,
        input.area,
        input.totalSlots,
        input.notes || "",
        input.gender || "Open",
        input.netHeight || "Venue Standard",
        JSON.stringify(input.positionsNeeded || []),
        input.rotationType || "Standard",
        Number(input.costPerPerson) || 0,
        input.region || "",
        gameId,
      ]
    );
    return promoteWaitlistToFill(client, gameId, input.totalSlots);
  });
  await notifyUsers(
    promoted,
    "promoted",
    `A spot opened up in "${input.title}" — you're in!`,
    gameId
  );

  // Let everyone in the game know the details changed (except the host editor).
  const others = (await memberUserIds(gameId)).filter((id) => id !== row.host_id);
  await notifyUsers(others, "edited", `"${input.title}" was updated by the host`, gameId);

  return { ok: true, game: await getGame(gameId) };
}

export async function toggleInterest(gameId, userId) {
  const { rows } = await query(
    "SELECT 1 FROM game_interest WHERE game_id = $1 AND user_id = $2",
    [gameId, userId]
  );
  if (rows.length > 0) {
    await query(
      "DELETE FROM game_interest WHERE game_id = $1 AND user_id = $2",
      [gameId, userId]
    );
  } else {
    await query(
      "INSERT INTO game_interest (game_id, user_id) VALUES ($1, $2)",
      [gameId, userId]
    );
  }
  return getGame(gameId);
}

export async function deleteGame(gameId, userId) {
  const game = await getGameRow(gameId);
  if (!game) return { ok: false, code: 404 };
  if (game.host_id !== userId) return { ok: false, code: 403 };

  // Notify members BEFORE deleting (game_id will become NULL afterward).
  const others = (await memberUserIds(gameId)).filter((id) => id !== game.host_id);
  await notifyUsers(
    others,
    "cancelled",
    `"${game.title}" was cancelled by the host`,
    gameId
  );
  await query("DELETE FROM games WHERE id = $1", [gameId]);
  return { ok: true };
}

/**
 * Cancel this and all later occurrences of a recurring series (host only).
 * Notifies members of each cancelled game. Returns how many were removed.
 */
export async function cancelSeries(seriesId, hostId, fromDate) {
  const { rows } = await query(
    "SELECT id, title FROM games WHERE series_id = $1 AND host_id = $2 AND date >= $3",
    [seriesId, hostId, fromDate]
  );
  if (rows.length === 0)
    return { ok: false, code: 404, error: "No upcoming games in this series." };
  for (const g of rows) {
    const others = (await memberUserIds(g.id)).filter((uidv) => uidv !== hostId);
    await notifyUsers(others, "cancelled", `"${g.title}" was cancelled by the host`, g.id);
  }
  await query(
    "DELETE FROM games WHERE series_id = $1 AND host_id = $2 AND date >= $3",
    [seriesId, hostId, fromDate]
  );
  return { ok: true, count: rows.length };
}

// --- Comments (per-game discussion) ---------------------------------------

export async function listComments(gameId, viewerId = null) {
  const params = [gameId];
  let blockClause = "";
  if (viewerId) {
    params.push(viewerId);
    blockClause = ` AND c.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $${params.length})`;
  }
  const { rows } = await query(
    `SELECT c.id, c.user_id, c.body, c.created_at, u.name AS user_name
       FROM game_comments c
       JOIN users u ON u.id = c.user_id
      WHERE c.game_id = $1${blockClause}
      ORDER BY c.created_at ASC`,
    params
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function addComment(gameId, userId, body) {
  const game = await getGameRow(gameId);
  if (!game) return { ok: false, code: 404, error: "Game not found." };
  const id = uid("cmt");
  await query(
    `INSERT INTO game_comments (id, game_id, user_id, body, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, gameId, userId, body, new Date().toISOString()]
  );
  // Notify everyone in the game (host + members) about the new message,
  // except whoever wrote it.
  const actor = await findUserById(userId);
  const recipients = [game.host_id, ...(await memberUserIds(gameId))].filter(
    (id2) => id2 !== userId
  );
  await notifyUsers(
    recipients,
    "comment",
    `${actor ? actor.name : "Someone"} commented on "${game.title}"`,
    gameId
  );
  return { ok: true, comments: await listComments(gameId) };
}

// --- Chat (members-only group messages per game) --------------------------

/**
 * Whether a user may read/post in a game's chat. Access is granted while you
 * are a current member (player or waitlist) or the host. Leaving the game
 * removes your membership row, so you lose access — but past games keep their
 * members, so the chat stays reachable after the game has ended.
 */
export async function canAccessChat(gameId, userId) {
  const game = await getGameRow(gameId);
  if (!game) return false;
  if (game.host_id === userId) return true;
  const { rows } = await query(
    "SELECT 1 FROM game_members WHERE game_id = $1 AND user_id = $2",
    [gameId, userId]
  );
  return rows.length > 0;
}

export async function listMessages(gameId) {
  const { rows } = await query(
    `SELECT m.id, m.user_id, m.body, m.created_at, u.name AS user_name
       FROM messages m
       JOIN users u ON u.id = m.user_id
      WHERE m.game_id = $1
      ORDER BY m.created_at ASC`,
    [gameId]
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function addMessage(gameId, userId, body) {
  const id = uid("msg");
  const now = new Date().toISOString();
  await query(
    "INSERT INTO messages (id, game_id, user_id, body, created_at) VALUES ($1, $2, $3, $4, $5)",
    [id, gameId, userId, body, now]
  );
  // Notify the other members about the new chat message.
  const game = await getGameRow(gameId);
  const actor = await findUserById(userId);
  const recipients = (await memberUserIds(gameId)).filter((id2) => id2 !== userId);
  await notifyUsers(
    recipients,
    "message",
    `${actor ? actor.name : "Someone"} messaged in "${game ? game.title : "a game"}"`,
    gameId
  );
  return { id, userId, userName: actor ? actor.name : "", body, createdAt: now };
}

/** Delete a chat message. The author or the game host may remove it. */
export async function deleteMessage(gameId, messageId, userId) {
  const { rows } = await query(
    "SELECT user_id FROM messages WHERE id = $1 AND game_id = $2",
    [messageId, gameId]
  );
  if (rows.length === 0) return { ok: false, code: 404, error: "Message not found." };
  const game = await getGameRow(gameId);
  const isAuthor = rows[0].user_id === userId;
  const isHost = game && game.host_id === userId;
  if (!isAuthor && !isHost)
    return { ok: false, code: 403, error: "You can only delete your own messages." };
  await query("DELETE FROM messages WHERE id = $1", [messageId]);
  return { ok: true };
}

/**
 * Every game the user is a member/host of, with a preview of the last message.
 * Sorted by most-recent activity (last message, falling back to game creation).
 */
export async function listChatsForUser(userId) {
  const { rows } = await query(
    `SELECT g.id, g.title, g.date, g.time, g.host_id,
            (SELECT COUNT(*) FROM game_members gm WHERE gm.game_id = g.id) AS member_count,
            lm.body AS last_body, lm.created_at AS last_at, lu.name AS last_sender
       FROM games g
       JOIN game_members m ON m.game_id = g.id AND m.user_id = $1
       LEFT JOIN LATERAL (
         SELECT body, created_at, user_id
           FROM messages
          WHERE game_id = g.id
          ORDER BY created_at DESC
          LIMIT 1
       ) lm ON TRUE
       LEFT JOIN users lu ON lu.id = lm.user_id
      ORDER BY COALESCE(lm.created_at, g.created_at) DESC`,
    [userId]
  );
  return rows.map((r) => ({
    gameId: r.id,
    title: r.title,
    date: r.date,
    time: r.time,
    hostId: r.host_id,
    memberCount: Number(r.member_count),
    lastMessage: r.last_body || null,
    lastSender: r.last_sender || null,
    lastMessageAt: r.last_at || null,
  }));
}

// --- Cost splitting -------------------------------------------------------

/**
 * Mark whether a member has paid their share of the court cost. The host may
 * update anyone; a player may only update their own status.
 */
export async function setMemberPaid(gameId, actorId, memberId, paid) {
  const game = await getGameRow(gameId);
  if (!game) return { ok: false, code: 404, error: "Game not found." };
  if (game.host_id !== actorId && actorId !== memberId)
    return { ok: false, code: 403, error: "Only the host can update others' payment." };
  const { rowCount } = await query(
    "UPDATE game_members SET paid = $1 WHERE game_id = $2 AND user_id = $3",
    [paid === true, gameId, memberId]
  );
  if (rowCount === 0)
    return { ok: false, code: 404, error: "That player isn't in this game." };
  return { ok: true, game: await getGame(gameId) };
}

// --- Reviews ------------------------------------------------------------------

export async function pendingReviews(userId) {
  // Games the user played in (not hosted), ended >2h ago, <7 days ago, not yet reviewed.
  const { rows } = await query(`
    SELECT g.* FROM games g
    JOIN game_members m ON m.game_id = g.id AND m.user_id = $1 AND m.status = 'player'
    WHERE g.host_id <> $1
      AND CAST(g.date || 'T' || g.time || ':00+00' AS TIMESTAMPTZ) < NOW() - INTERVAL '2 hours'
      AND CAST(g.date || 'T' || g.time || ':00+00' AS TIMESTAMPTZ) > NOW() - INTERVAL '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM game_reviews r
        WHERE r.game_id = g.id AND r.reviewer_id = $1
      )
    ORDER BY g.date DESC
    LIMIT 5
  `, [userId]);
  return serializeGames(rows);
}

export async function createReview(gameId, reviewerId, { rating, comment }) {
  const game = await getGameRow(gameId);
  if (!game) return { ok: false, code: 404, error: 'Game not found.' };
  if (game.host_id === reviewerId) return { ok: false, code: 400, error: "You can't review your own game." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, code: 400, error: 'Rating must be 1–5.' };
  try {
    await query(
      `INSERT INTO game_reviews (id, game_id, reviewer_id, host_id, rating, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (game_id, reviewer_id) DO NOTHING`,
      [uid('rev'), gameId, reviewerId, game.host_id, rating, String(comment || '').trim(), new Date().toISOString()]
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, code: 500, error: 'Could not save review.' };
  }
}

export async function getGameReviews(gameId) {
  const { rows } = await query(`
    SELECT r.*, u.name AS reviewer_name
      FROM game_reviews r
      JOIN users u ON u.id = r.reviewer_id
     WHERE r.game_id = $1
     ORDER BY r.created_at DESC
  `, [gameId]);
  return rows.map(r => ({
    id: r.id,
    reviewerId: r.reviewer_id,
    reviewerName: r.reviewer_name,
    hostId: r.host_id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
  }));
}

export async function getHostRating(hostId) {
  const { rows } = await query(`
    SELECT COUNT(*)::int AS count, ROUND(AVG(rating)::numeric, 1)::float AS avg
      FROM game_reviews WHERE host_id = $1
  `, [hostId]);
  return { count: rows[0].count, avg: rows[0].avg };
}

// --- Feedback -----------------------------------------------------------------

export async function createFeedback(userId, { type, subject, body }) {
  await query(
    `INSERT INTO feedback (id, user_id, type, subject, body, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [uid('fb'), userId || null, type, subject || '', body, new Date().toISOString()]
  );
}

// --- Account deletion ---------------------------------------------------------

export async function deleteAccount(userId) {
  await query('DELETE FROM users WHERE id = $1', [userId]);
}

// --- Highlights ---------------------------------------------------------------

// --- Player-to-player ratings -------------------------------------------------

export async function getPlayerRating(userId) {
  const { rows } = await query(`
    SELECT COUNT(*)::int AS count, ROUND(AVG(rating)::numeric, 1)::float AS avg
      FROM player_ratings WHERE rated_id = $1
  `, [userId]);
  return { count: rows[0].count, avg: rows[0].avg };
}

/** All players (excluding requester) in a game, with whether the requester has already rated them. */
export async function getRatables(gameId, userId) {
  const { rows } = await query(
    `SELECT u.id, u.name
       FROM game_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.game_id = $1 AND m.user_id <> $2 AND m.status = 'player'`,
    [gameId, userId]
  );
  const { rows: rated } = await query(
    'SELECT rated_id, rating FROM player_ratings WHERE game_id = $1 AND rater_id = $2',
    [gameId, userId]
  );
  const myRatings = Object.fromEntries(rated.map((r) => [r.rated_id, r.rating]));
  return rows.map((r) => ({ id: r.id, name: r.name, myRating: myRatings[r.id] || null }));
}

export async function ratePlayer(gameId, raterId, ratedId, rating) {
  if (raterId === ratedId) return { ok: false, code: 400, error: "Can't rate yourself." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, code: 400, error: 'Rating must be 1–5.' };
  const { rows: rater } = await query(
    "SELECT 1 FROM game_members WHERE game_id = $1 AND user_id = $2 AND status = 'player'",
    [gameId, raterId]
  );
  if (!rater.length) return { ok: false, code: 403, error: 'You were not a player in this game.' };
  const { rows: rated } = await query(
    "SELECT 1 FROM game_members WHERE game_id = $1 AND user_id = $2 AND status = 'player'",
    [gameId, ratedId]
  );
  if (!rated.length) return { ok: false, code: 404, error: 'That player was not in this game.' };
  await query(
    `INSERT INTO player_ratings (id, game_id, rater_id, rated_id, rating, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (game_id, rater_id, rated_id) DO UPDATE SET rating = EXCLUDED.rating`,
    [uid('pr'), gameId, raterId, ratedId, rating, new Date().toISOString()]
  );
  return { ok: true };
}

function serializeHighlight(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    caption: row.caption,
    videoUrl: row.video_url,
    thumbUrl: row.thumb_url,
    mediaType: row.media_type || 'video',
    createdAt: row.created_at,
    likesCount: Number(row.likes_count || 0),
    likedBy: row.liked_by || [],
    commentsCount: Number(row.comments_count || 0),
  };
}

const HL_SELECT = `
  SELECT h.*, u.name AS user_name,
         (SELECT COUNT(*) FROM highlight_likes WHERE highlight_id = h.id)::int AS likes_count,
         (SELECT COUNT(*) FROM highlight_comments WHERE highlight_id = h.id)::int AS comments_count,
         ARRAY(SELECT user_id FROM highlight_likes WHERE highlight_id = h.id) AS liked_by
    FROM highlights h JOIN users u ON u.id = h.user_id
`;

export async function listHighlights(limit = 20, offset = 0, viewerId = null) {
  const params = [limit, offset];
  let blockClause = "";
  if (viewerId) {
    params.push(viewerId);
    blockClause = ` WHERE h.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $${params.length})`;
  }
  const { rows } = await query(
    `${HL_SELECT}${blockClause} ORDER BY h.created_at DESC LIMIT $1 OFFSET $2`,
    params
  );
  return rows.map(serializeHighlight);
}

export async function createHighlight(userId, { caption, videoUrl, thumbUrl, mediaType }) {
  const id = uid("hl");
  await query(
    `INSERT INTO highlights (id, user_id, caption, video_url, thumb_url, media_type, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, userId, caption || "", videoUrl, thumbUrl || "", mediaType || "video", new Date().toISOString()]
  );
  const { rows } = await query(`${HL_SELECT} WHERE h.id = $1`, [id]);
  return serializeHighlight(rows[0]);
}

export async function deleteHighlight(id, userId) {
  const { rows } = await query("SELECT user_id FROM highlights WHERE id = $1", [id]);
  if (!rows[0]) return { ok: false, code: 404, error: "Highlight not found." };
  if (rows[0].user_id !== userId)
    return { ok: false, code: 403, error: "You can't delete someone else's highlight." };
  await query("DELETE FROM highlights WHERE id = $1", [id]);
  return { ok: true };
}

export async function toggleHighlightLike(highlightId, userId) {
  const { rows: ex } = await query(
    "SELECT 1 FROM highlight_likes WHERE highlight_id = $1 AND user_id = $2",
    [highlightId, userId]
  );
  if (ex.length > 0) {
    await query(
      "DELETE FROM highlight_likes WHERE highlight_id = $1 AND user_id = $2",
      [highlightId, userId]
    );
  } else {
    await query(
      "INSERT INTO highlight_likes (highlight_id, user_id) VALUES ($1, $2)",
      [highlightId, userId]
    );
  }
  const { rows } = await query(`${HL_SELECT} WHERE h.id = $1`, [highlightId]);
  if (!rows[0]) return null;
  return serializeHighlight(rows[0]);
}

export async function getUserHighlights(userId) {
  const { rows } = await query(
    `${HL_SELECT} WHERE h.user_id = $1 ORDER BY h.created_at DESC`,
    [userId]
  );
  return rows.map(serializeHighlight);
}

// --- Highlight comments (anyone can comment) ------------------------------

export async function listHighlightComments(highlightId, viewerId = null) {
  const params = [highlightId];
  let blockClause = "";
  if (viewerId) {
    params.push(viewerId);
    blockClause = ` AND c.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $${params.length})`;
  }
  const { rows } = await query(
    `SELECT c.id, c.user_id, c.body, c.created_at, u.name AS user_name
       FROM highlight_comments c
       JOIN users u ON u.id = c.user_id
      WHERE c.highlight_id = $1${blockClause}
      ORDER BY c.created_at ASC`,
    params
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    body: r.body,
    createdAt: r.created_at,
  }));
}

export async function addHighlightComment(highlightId, userId, body) {
  const { rows: hl } = await query(
    "SELECT user_id FROM highlights WHERE id = $1",
    [highlightId]
  );
  if (!hl[0]) return { ok: false, code: 404, error: "Highlight not found." };
  const id = uid("hlc");
  await query(
    `INSERT INTO highlight_comments (id, highlight_id, user_id, body, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, highlightId, userId, body, new Date().toISOString()]
  );
  // Notify the highlight owner, unless they commented on their own clip.
  if (hl[0].user_id !== userId) {
    const actor = await findUserById(userId);
    await notifyUsers(
      [hl[0].user_id],
      "highlight_comment",
      `${actor ? actor.name : "Someone"} commented on your highlight`,
      null
    );
  }
  return { ok: true, comments: await listHighlightComments(highlightId) };
}

export async function deleteHighlightComment(highlightId, commentId, userId) {
  const { rows } = await query(
    `SELECT c.user_id AS commenter, h.user_id AS owner
       FROM highlight_comments c JOIN highlights h ON h.id = c.highlight_id
      WHERE c.id = $1 AND c.highlight_id = $2`,
    [commentId, highlightId]
  );
  if (!rows[0]) return { ok: false, code: 404, error: "Comment not found." };
  if (rows[0].commenter !== userId && rows[0].owner !== userId)
    return { ok: false, code: 403, error: "You can't delete this comment." };
  await query("DELETE FROM highlight_comments WHERE id = $1", [commentId]);
  return { ok: true, comments: await listHighlightComments(highlightId) };
}

// --------------------------------------------------------------------------

// --- Password reset -----------------------------------------------------------

export async function createPasswordResetToken(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await query("DELETE FROM password_reset_tokens WHERE user_id = $1", [userId]);
  await query(
    "INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)",
    [token, userId, expiresAt]
  );
  return token;
}

export async function verifyPasswordResetToken(token) {
  const { rows } = await query(
    "SELECT * FROM password_reset_tokens WHERE token = $1 AND expires_at > $2",
    [token, new Date().toISOString()]
  );
  return rows[0] || null;
}

export async function consumePasswordResetToken(token) {
  await query("DELETE FROM password_reset_tokens WHERE token = $1", [token]);
}

export async function updateUserPassword(userId, passwordHash) {
  await query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);
}

// --- Google OAuth -------------------------------------------------------------

export async function findOrCreateGoogleUser(googleId, email, name) {
  const { rows: byGoogle } = await query(
    "SELECT * FROM users WHERE google_id = $1",
    [googleId]
  );
  if (byGoogle[0]) return byGoogle[0];

  const { rows: byEmail } = await query(
    "SELECT * FROM users WHERE email = $1",
    [email.toLowerCase()]
  );
  if (byEmail[0]) {
    await query("UPDATE users SET google_id = $1 WHERE id = $2", [googleId, byEmail[0].id]);
    return byEmail[0];
  }

  const id = uid("user");
  await query(
    `INSERT INTO users (id, email, password_hash, name, skill, home_area, created_at, google_id)
     VALUES ($1, $2, '', $3, 'Intermediate', '', $4, $5)`,
    [id, email.toLowerCase(), name, new Date().toISOString(), googleId]
  );
  return findUserById(id);
}

// --------------------------------------------------------------------------

// --- Waitlist -----------------------------------------------------------------

export async function addWaitlistEntry(email, name = "") {
  const id = uid("wl");
  try {
    await query(
      "INSERT INTO waitlist (id, email, name) VALUES ($1, $2, $3)",
      [id, email.toLowerCase().trim(), name.trim()]
    );
    return { ok: true, alreadyExists: false };
  } catch (err) {
    if (err.code === "23505") return { ok: true, alreadyExists: true }; // duplicate email
    throw err;
  }
}

export async function getWaitlistCount() {
  const { rows } = await query("SELECT COUNT(*)::int AS count FROM waitlist");
  return rows[0].count;
}

export async function getWaitlistEntries() {
  const { rows } = await query(
    "SELECT id, email, name, created_at FROM waitlist ORDER BY created_at DESC"
  );
  return rows;
}

// --------------------------------------------------------------------------

export async function deleteComment(gameId, commentId, userId) {
  const { rows } = await query(
    "SELECT c.user_id, g.host_id FROM game_comments c JOIN games g ON g.id = c.game_id WHERE c.id = $1 AND c.game_id = $2",
    [commentId, gameId]
  );
  if (rows.length === 0) return { ok: false, code: 404, error: "Comment not found." };
  // The author or the game's host may delete a comment.
  if (rows[0].user_id !== userId && rows[0].host_id !== userId)
    return { ok: false, code: 403, error: "You can't delete this comment." };
  await query("DELETE FROM game_comments WHERE id = $1", [commentId]);
  return { ok: true, comments: await listComments(gameId) };
}
