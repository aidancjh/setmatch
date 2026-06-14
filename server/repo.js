// Repository: all SQL lives here. Returns objects shaped exactly like the
// frontend's TypeScript types (Game, Player, Profile) so the React app needs no
// changes to how it reads data. All functions are async (Postgres is networked).
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

export async function updateUser(id, { name, skill, homeArea }) {
  const cur = await findUserById(id);
  if (!cur) return null;
  await query("UPDATE users SET name = $1, skill = $2, home_area = $3 WHERE id = $4", [
    name ?? cur.name,
    skill ?? cur.skill,
    homeArea ?? cur.home_area,
    id,
  ]);
  return findUserById(id);
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
  return {
    id: u.id,
    name: u.name,
    skill: u.skill,
    homeArea: u.home_area,
    memberSince: u.created_at,
    gamesHosted: hosted,
    gamesPlayed: played,
    hostedUpcoming,
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
    role: row.role || "user",
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
    `SELECT u.id, u.name
       FROM game_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.game_id = $1 AND m.status = $2
      ORDER BY m.seq ASC`,
    [gameId, status]
  );
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

async function interestedIds(gameId) {
  const { rows } = await query(
    "SELECT user_id FROM game_interest WHERE game_id = $1",
    [gameId]
  );
  return rows.map((r) => r.user_id);
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
    date: row.date,
    time: row.time,
    location: row.location,
    area: row.area,
    totalSlots: row.total_slots,
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
       (id, title, type, skill, date, time, location, area, total_slots, host_id, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      input.title,
      input.type,
      input.skill,
      input.date,
      input.time,
      input.location,
      input.area,
      input.totalSlots,
      hostId,
      input.notes || "",
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
        SET title = $1, type = $2, skill = $3, date = $4, time = $5,
            location = $6, area = $7, total_slots = $8, notes = $9
      WHERE id = $10`,
    [
      input.title,
      input.type,
      input.skill,
      input.date,
      input.time,
      input.location,
      input.area,
      input.totalSlots,
      input.notes || "",
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

// --- Highlights ---------------------------------------------------------------

function serializeHighlight(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    caption: row.caption,
    videoUrl: row.video_url,
    thumbUrl: row.thumb_url,
    createdAt: row.created_at,
    likesCount: Number(row.likes_count || 0),
    likedBy: row.liked_by || [],
  };
}

const HL_SELECT = `
  SELECT h.*, u.name AS user_name,
         (SELECT COUNT(*) FROM highlight_likes WHERE highlight_id = h.id)::int AS likes_count,
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

export async function createHighlight(userId, { caption, videoUrl, thumbUrl }) {
  const id = uid("hl");
  await query(
    `INSERT INTO highlights (id, user_id, caption, video_url, thumb_url, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, userId, caption || "", videoUrl, thumbUrl || "", new Date().toISOString()]
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
