// PostgreSQL connection pool + schema.
// Connection comes from the DATABASE_URL env var (set in .env locally, and by
// the host in production). Set DATABASE_SSL=true for managed databases that
// require TLS (most cloud Postgres do; local Postgres does not).
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "[db] Missing DATABASE_URL. Create a .env file (see .env.example) or set it in your host."
  );
  process.exit(1);
}

export const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

/** Run a parameterized query and return the pg result. */
export function query(text, params) {
  return pool.query(text, params);
}

/** Create tables if they don't exist yet. Safe to run on every startup. */
export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      skill         TEXT NOT NULL DEFAULT 'Intermediate',
      home_area     TEXT NOT NULL DEFAULT '',
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS games (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      type        TEXT NOT NULL,
      skill       TEXT NOT NULL,
      date        TEXT NOT NULL,
      time        TEXT NOT NULL,
      location    TEXT NOT NULL,
      area        TEXT NOT NULL,
      total_slots INTEGER NOT NULL,
      host_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notes       TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_members (
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status  TEXT NOT NULL DEFAULT 'player',
      seq     INTEGER NOT NULL,
      PRIMARY KEY (game_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS game_interest (
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (game_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS game_comments (
      id         TEXT PRIMARY KEY,
      game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    -- game_id is nullable + SET NULL so "your game was cancelled" notifications
    -- survive after the game is deleted.
    CREATE TABLE IF NOT EXISTS notifications (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      message    TEXT NOT NULL,
      game_id    TEXT REFERENCES games(id) ON DELETE SET NULL,
      read       BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
    CREATE INDEX IF NOT EXISTS idx_members_game ON game_members(game_id);
    CREATE INDEX IF NOT EXISTS idx_comments_game ON game_comments(game_id);
    CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id, created_at);
  `);
}

export function uid(prefix = "id") {
  const rand = Math.random().toString(36).slice(2, 9);
  const time = Date.now().toString(36);
  return `${prefix}_${rand}${time}`;
}
