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

    -- Idempotency keys so a retried "create game" can't double-post.
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key        TEXT PRIMARY KEY,
      game_id    TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_games_date ON games(date);
    CREATE INDEX IF NOT EXISTS idx_members_game ON game_members(game_id);
    CREATE INDEX IF NOT EXISTS idx_comments_game ON game_comments(game_id);
    CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id, created_at);
  `);

  // --- Migrations (idempotent; safe to run on every startup) ---------------
  // Role-based authorization: 'user' | 'staff' | 'admin'.
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'"
  );

  // Pre-filled spots, reviews, feedback, account deletion support.
  await pool.query(`
    ALTER TABLE games ADD COLUMN IF NOT EXISTS pre_filled INTEGER NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_reviews (
      id          TEXT PRIMARY KEY,
      game_id     TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      host_id     TEXT NOT NULL,
      rating      INT  NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment     TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL,
      UNIQUE (game_id, reviewer_id)
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id         TEXT PRIMARY KEY,
      user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
      type       TEXT NOT NULL,
      subject    TEXT NOT NULL DEFAULT '',
      body       TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reviews_game ON game_reviews(game_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_host ON game_reviews(host_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON game_reviews(reviewer_id);
  `);

  // Profile bio and avatar.
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT ''"
  );
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT ''"
  );

  // Google OAuth + password reset via email.
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT"
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    )
  `);

  // Sports highlights / clips feed.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS highlights (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      caption     TEXT NOT NULL DEFAULT '',
      video_url   TEXT NOT NULL,
      thumb_url   TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS highlight_likes (
      highlight_id TEXT NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (highlight_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_highlights_created ON highlights(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_highlights_user    ON highlights(user_id);
    CREATE INDEX IF NOT EXISTS idx_hl_likes           ON highlight_likes(highlight_id);
  `);

  // Feature: gender and net height on games.
  await pool.query(
    "ALTER TABLE games ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT 'Open'"
  );
  await pool.query(
    "ALTER TABLE games ADD COLUMN IF NOT EXISTS net_height TEXT NOT NULL DEFAULT 'Venue Standard'"
  );

  // Feature: birthdate and gender on user profiles.
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS birthdate TEXT");
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS user_gender TEXT NOT NULL DEFAULT ''"
  );
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS show_age BOOLEAN NOT NULL DEFAULT TRUE"
  );
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS show_gender BOOLEAN NOT NULL DEFAULT TRUE"
  );

  // Feature: positions, rotation, end time on games; favorite positions on users.
  // (The old free-text "court_fee" column was dropped — superseded by cost_per_person.)
  await pool.query(
    "ALTER TABLE games ADD COLUMN IF NOT EXISTS positions_needed TEXT NOT NULL DEFAULT '[]'"
  );
  await pool.query(
    "ALTER TABLE games ADD COLUMN IF NOT EXISTS rotation_type TEXT NOT NULL DEFAULT 'Standard'"
  );
  await pool.query(
    "ALTER TABLE games ADD COLUMN IF NOT EXISTS end_time TEXT NOT NULL DEFAULT ''"
  );
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS favorite_positions TEXT NOT NULL DEFAULT '[]'"
  );

  // Feature: media type on highlights (video or photo).
  await pool.query(
    "ALTER TABLE highlights ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'video'"
  );

  // Feature: player-to-player ratings after games.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_ratings (
      id         TEXT PRIMARY KEY,
      game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      rater_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rated_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating     INT  NOT NULL CHECK (rating BETWEEN 1 AND 5),
      created_at TEXT NOT NULL,
      UNIQUE (game_id, rater_id, rated_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pr_rated ON player_ratings(rated_id);
    CREATE INDEX IF NOT EXISTS idx_pr_game  ON player_ratings(game_id);
  `);

  // Feature: members-only group chat per game.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id         TEXT PRIMARY KEY,
      game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_game ON messages(game_id, created_at);
  `);

  // Feature: cost per person on a game. Renamed from the old "court_cost"
  // (which held a total to split); now holds the amount each player pays.
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'games' AND column_name = 'court_cost')
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'games' AND column_name = 'cost_per_person') THEN
        ALTER TABLE games RENAME COLUMN court_cost TO cost_per_person;
      END IF;
    END $$;
  `);
  await pool.query(
    "ALTER TABLE games ADD COLUMN IF NOT EXISTS cost_per_person NUMERIC NOT NULL DEFAULT 0"
  );
  // `paid` flag kept on game_members for backward compatibility (no longer surfaced in the UI).
  await pool.query(
    "ALTER TABLE game_members ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT FALSE"
  );

  // Feature: profile banner background (color or image).
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_color TEXT NOT NULL DEFAULT ''"
  );
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_image TEXT NOT NULL DEFAULT ''"
  );

  // Feature: region (North/South/East/West) on games for area filtering.
  await pool.query(
    "ALTER TABLE games ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT ''"
  );

  // Admin moderation: suspended users are blocked from signing in / using the API.
  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT FALSE"
  );

  // Admin Phase 2: feedback inbox (mark items handled) + audit log of admin actions.
  await pool.query(
    "ALTER TABLE feedback ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT FALSE"
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_audit (
      id         TEXT PRIMARY KEY,
      admin_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
      action     TEXT NOT NULL,
      detail     TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_audit ON admin_audit(created_at DESC);
  `);

  // Admin Phase 3: user reports queue + feature flags / maintenance mode.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id          TEXT PRIMARY KEY,
      reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      target_type TEXT NOT NULL,
      target_id   TEXT NOT NULL,
      reason      TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'open',
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feature_flags (
      key        TEXT PRIMARY KEY,
      enabled    BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TEXT NOT NULL
    );
  `);
  // Seed the known flags (no-op if they already exist).
  await pool.query(
    `INSERT INTO feature_flags (key, enabled, updated_at) VALUES
       ('maintenance_mode', FALSE, $1),
       ('signups_enabled', TRUE, $1)
     ON CONFLICT (key) DO NOTHING`,
    [new Date().toISOString()]
  );

  // Feature: comments on highlights (anyone can comment).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS highlight_comments (
      id           TEXT PRIMARY KEY,
      highlight_id TEXT NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body         TEXT NOT NULL,
      created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hl_comments ON highlight_comments(highlight_id, created_at);
  `);

  // Waitlist: email capture for pre-launch signups.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id         TEXT PRIMARY KEY,
      email      TEXT UNIQUE NOT NULL,
      name       TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export function uid(prefix = "id") {
  const rand = Math.random().toString(36).slice(2, 9);
  const time = Date.now().toString(36);
  return `${prefix}_${rand}${time}`;
}
