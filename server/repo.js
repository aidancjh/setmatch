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

/** Strip the password hash before sending a user to the client. */
export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    skill: row.skill,
    homeArea: row.home_area,
  };
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

/** Promote waitlisted players (earliest first) until the game is full. */
async function promoteWaitlistToFill(gameId, totalSlots) {
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
  }
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
  return getGame(gameId);
}

export async function leaveGame(gameId, userId) {
  const game = await getGameRow(gameId);
  if (!game) return null;
  await query("DELETE FROM game_members WHERE game_id = $1 AND user_id = $2", [
    gameId,
    userId,
  ]);
  await promoteWaitlistToFill(gameId, game.total_slots);
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
  await promoteWaitlistToFill(gameId, input.totalSlots);
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
  await query("DELETE FROM games WHERE id = $1", [gameId]);
  return { ok: true };
}
