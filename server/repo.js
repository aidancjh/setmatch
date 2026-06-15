// Repository: all SQL lives here. Returns objects shaped exactly like the
// frontend's TypeScript types (Game, Player, Profile) so the React app needs no
// changes to how it reads data. All functions are async (Postgres is networked).
import crypto from "node:crypto";
import { query, uid } from "./db.js";

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
  const hostedUpcoming = await Promise.all(rows.map(serializeGame));
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

/** Promote any emails listed in ADMIN_EMAILS (comma-separated) to admin. */
export async function promoteAdminsFromEnv() {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
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

export async function adminStats() {
  const one = async (sql, params = []) =>
    Number((await query(sql, params)).rows[0].c);
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  return {
    users: await one("SELECT COUNT(*) AS c FROM users"),
    newUsers7d: await one(
      "SELECT COUNT(*) AS c FROM users WHERE created_at >= $1",
      [weekAgo]
    ),
    games: await one("SELECT COUNT(*) AS c FROM games"),
    upcomingGames: await one(
      "SELECT COUNT(*) AS c FROM games WHERE date >= $1",
      [today]
    ),
    comments: await one("SELECT COUNT(*) AS c FROM game_comments"),
  };
}

export async function adminListUsers() {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.skill, u.created_at,
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
    hosted: Number(r.hosted),
    joined: Number(r.joined),
  }));
}

export async function adminListGames() {
  const { rows } = await query("SELECT * FROM games ORDER BY date DESC");
  return Promise.all(rows.map(serializeGame));
}

export async function setUserRole(userId, role) {
  if (!["user", "staff", "admin"].includes(role)) return null;
  await query("UPDATE users SET role = $1 WHERE id = $2", [role, userId]);
  return findUserById(userId);
}

export async function adminDeleteGame(gameId) {
  await query("DELETE FROM games WHERE id = $1", [gameId]);
}

// --- Notifications --------------------------------------------------------

export async function createNotification(userId, type, message, gameId) {
  await query(
    `INSERT INTO notifications (id, user_id, type, message, game_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [uid("ntf"), userId, type, message, gameId ?? null, new Date().toISOString()]
  );
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

// --- Games ----------------------------------------------------------------

async function memberPlayers(gameId, status) {
  const { rows } = await query(
    `SELECT u.id, u.name, m.paid
       FROM game_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.game_id = $1 AND m.status = $2
      ORDER BY m.seq ASC`,
    [gameId, status]
  );
  return rows.map((r) => ({ id: r.id, name: r.name, paid: r.paid === true }));
}

async function interestedIds(gameId) {
  const { rows } = await query(
    "SELECT user_id FROM game_interest WHERE game_id = $1",
    [gameId]
  );
  return rows.map((r) => r.user_id);
}

function parseJsonArr(val) {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

/** Build the full Game object the frontend expects from a games row. */
async function serializeGame(row) {
  if (!row) return null;
  const host = await findUserById(row.host_id);
  const [players, waitlist, interested] = await Promise.all([
    memberPlayers(row.id, "player"),
    memberPlayers(row.id, "waitlist"),
    interestedIds(row.id),
  ]);
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    skill: row.skill,
    gender: row.gender || "Open",
    netHeight: row.net_height || "Venue Standard",
    positionsNeeded: parseJsonArr(row.positions_needed),
    rotationType: row.rotation_type || "Standard",
    courtFee: row.court_fee || "",
    courtCost: Number(row.court_cost || 0),
    region: row.region || "",
    date: row.date,
    time: row.time,
    endTime: row.end_time || "",
    location: row.location,
    area: row.area,
    totalSlots: row.total_slots,
    preFilled: row.pre_filled || 0,
    hostId: row.host_id,
    hostName: host ? host.name : "Unknown",
    notes: row.notes,
    players,
    waitlist,
    interestedIds: interested,
    createdAt: row.created_at,
  };
}

export async function listGames() {
  const { rows } = await query("SELECT * FROM games");
  return Promise.all(rows.map(serializeGame));
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
        gender, net_height, positions_needed, rotation_type, court_fee, court_cost, region, created_at)
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
      input.courtFee || "",
      Number(input.courtCost) || 0,
      input.region || "",
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

async function nextSeq(gameId) {
  const { rows } = await query(
    "SELECT COALESCE(MAX(seq), -1) AS m FROM game_members WHERE game_id = $1",
    [gameId]
  );
  return Number(rows[0].m) + 1;
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
 */
async function promoteWaitlistToFill(gameId, totalSlots) {
  const promoted = [];
  while ((await playerCount(gameId)) < totalSlots) {
    const { rows } = await query(
      `SELECT user_id FROM game_members
        WHERE game_id = $1 AND status = 'waitlist'
        ORDER BY seq ASC LIMIT 1`,
      [gameId]
    );
    if (rows.length === 0) break;
    await query(
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
  const { rows: existing } = await query(
    "SELECT status FROM game_members WHERE game_id = $1 AND user_id = $2",
    [gameId, userId]
  );
  if (existing.length > 0) return getGame(gameId); // already joined/waitlisted

  const status =
    (await playerCount(gameId)) < game.total_slots ? "player" : "waitlist";
  await query(
    "INSERT INTO game_members (game_id, user_id, status, seq) VALUES ($1, $2, $3, $4)",
    [gameId, userId, status, await nextSeq(gameId)]
  );
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
  await query("DELETE FROM game_members WHERE game_id = $1 AND user_id = $2", [
    gameId,
    userId,
  ]);
  const promoted = await promoteWaitlistToFill(gameId, game.total_slots);

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

  await query(
    `UPDATE games
        SET title = $1, type = $2, skill = $3, date = $4, time = $5, end_time = $6,
            location = $7, area = $8, total_slots = $9, notes = $10,
            gender = $11, net_height = $12, positions_needed = $13,
            rotation_type = $14, court_fee = $15, court_cost = $16, region = $17
      WHERE id = $18`,
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
      input.courtFee || "",
      Number(input.courtCost) || 0,
      input.region || "",
      gameId,
    ]
  );
  const promoted = await promoteWaitlistToFill(gameId, input.totalSlots);
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

// --- Comments (per-game discussion) ---------------------------------------

export async function listComments(gameId) {
  const { rows } = await query(
    `SELECT c.id, c.user_id, c.body, c.created_at, u.name AS user_name
       FROM game_comments c
       JOIN users u ON u.id = c.user_id
      WHERE c.game_id = $1
      ORDER BY c.created_at ASC`,
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
  return Promise.all(rows.map(serializeGame));
}

export async function createReview(gameId, reviewerId, { rating, comment }) {
  const game = await getGameRow(gameId);
  if (!game) return { ok: false, code: 404, error: 'Game not found.' };
  if (game.host_id === reviewerId) return { ok: false, code: 400, error: "You can't review your own game." };
  if (rating < 1 || rating > 5) return { ok: false, code: 400, error: 'Rating must be 1–5.' };
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
  if (rating < 1 || rating > 5) return { ok: false, code: 400, error: 'Rating must be 1–5.' };
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

export async function listHighlights(limit = 20, offset = 0) {
  const { rows } = await query(
    `${HL_SELECT} ORDER BY h.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
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

export async function listHighlightComments(highlightId) {
  const { rows } = await query(
    `SELECT c.id, c.user_id, c.body, c.created_at, u.name AS user_name
       FROM highlight_comments c
       JOIN users u ON u.id = c.user_id
      WHERE c.highlight_id = $1
      ORDER BY c.created_at ASC`,
    [highlightId]
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
