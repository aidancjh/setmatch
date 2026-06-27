import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as repo from "../server/repo.js";
import { initSchema, query } from "../server/db.js";

// Concurrency regression for the join-race oversell bug: two players racing for
// the last open slot must NOT both end up confirmed. This needs a REAL Postgres
// (the FOR UPDATE row lock is what provides the guarantee), so it is gated:
//
//   RUN_DB_TESTS=1 DATABASE_URL=postgres://user:pass@host/throwaway npm test
//
// Without RUN_DB_TESTS it is skipped, so the normal pure-logic suite still runs
// anywhere with no database.
const RUN = process.env.RUN_DB_TESTS === "1";

const HOST = "user_test_race_host";
const A = "user_test_race_a";
const B = "user_test_race_b";

async function makeUser(id, email, name) {
  await query(
    `INSERT INTO users (id, email, password_hash, name, created_at)
     VALUES ($1, $2, 'x', $3, $4) ON CONFLICT (id) DO NOTHING`,
    [id, email, name, new Date().toISOString()]
  );
}

describe.skipIf(!RUN)("joinGame concurrency (real DB)", () => {
  let gameId;

  beforeAll(async () => {
    await initSchema();
    await makeUser(HOST, "race_host@test.local", "Race Host");
    await makeUser(A, "race_a@test.local", "Racer A");
    await makeUser(B, "race_b@test.local", "Racer B");
    // total_slots = 2; the host occupies slot 0, leaving exactly ONE open slot.
    const game = await repo.createGame(HOST, {
      title: "Race Test Game",
      type: "Indoor",
      skill: "All Levels",
      date: "2999-01-01",
      time: "18:00",
      endTime: "20:00",
      location: "Test Court",
      area: "Test Area",
      totalSlots: 2,
      preFilled: 0,
      notes: "",
      gender: "Open",
      netHeight: "Venue Standard",
      positionsNeeded: [],
      rotationType: "Standard",
      costPerPerson: 0,
      region: "",
    });
    gameId = game.id;
  });

  afterAll(async () => {
    if (gameId) await query("DELETE FROM games WHERE id = $1", [gameId]);
    await query("DELETE FROM users WHERE id = ANY($1)", [[HOST, A, B]]);
  });

  it("never oversells the last slot under concurrent joins", async () => {
    // Fire both joins simultaneously.
    await Promise.all([repo.joinGame(gameId, A), repo.joinGame(gameId, B)]);

    const game = await repo.getGame(gameId);
    // Host + exactly one racer are confirmed; the other is waitlisted.
    expect(game.players).toHaveLength(2);
    expect(game.waitlist).toHaveLength(1);

    const racerStatuses = [A, B].map((id) =>
      game.players.some((p) => p.id === id)
        ? "player"
        : game.waitlist.some((w) => w.id === id)
        ? "waitlist"
        : "missing"
    );
    expect(racerStatuses.filter((s) => s === "player")).toHaveLength(1);
    expect(racerStatuses.filter((s) => s === "waitlist")).toHaveLength(1);
  });
});
