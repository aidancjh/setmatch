// Every /api/admin/* route. Mounted by BOTH nowhere else — only
// server/admin-server.js mounts this, behind requireAdminAuth. The consumer
// app (server/index.js) no longer serves any /api/admin/* route at all.
import { Router } from "express";
import { h } from "./lib/asyncHandler.js";
import { requireAdminAuth } from "./adminAuth.js";
import { queryWaitlistFunnel } from "./posthog.js";
import * as repo from "./repo.js";

const router = Router();
router.use(requireAdminAuth);

router.get(
  "/whoami",
  h(async (req, res) => {
    const user = await repo.findUserById(req.userId);
    res.json(repo.publicUser(user));
  })
);

router.get("/stats", h(async (_req, res) => res.json(await repo.adminStats())));

router.get("/users", h(async (_req, res) => res.json(await repo.adminListUsers())));

router.patch(
  "/users/:id/role",
  h(async (req, res) => {
    const user = await repo.setUserRole(req.params.id, req.body && req.body.role);
    if (!user) return res.status(400).json({ error: "Invalid role." });
    await repo.logAdminAction(req.userId, "set_role", `Set ${user.name}'s role to ${user.role}`);
    res.json(repo.publicUser(user));
  })
);

router.get("/games", h(async (_req, res) => res.json(await repo.adminListGames())));

router.delete(
  "/games/:id",
  h(async (req, res) => {
    const title = await repo.adminDeleteGame(req.params.id);
    await repo.logAdminAction(req.userId, "delete_game", `Deleted game "${title}"`);
    res.status(204).end();
  })
);

router.patch(
  "/users/:id/suspend",
  h(async (req, res) => {
    const target = await repo.findUserById(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found." });
    if ((target.role || "user") === "admin")
      return res.status(400).json({ error: "Admin accounts can't be suspended." });
    const user = await repo.setUserSuspended(req.params.id, req.body && req.body.suspended === true);
    await repo.logAdminAction(
      req.userId,
      "suspend_user",
      `${user.suspended ? "Suspended" : "Unsuspended"} ${user.name} (${user.email})`
    );
    res.json(repo.publicUser(user));
  })
);

router.delete(
  "/users/:id",
  h(async (req, res) => {
    const target = await repo.findUserById(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found." });
    if ((target.role || "user") === "admin")
      return res.status(400).json({ error: "Admin accounts can't be deleted here." });
    await repo.adminDeleteUser(req.params.id);
    await repo.logAdminAction(req.userId, "delete_user", `Removed ${target.name} (${target.email})`);
    res.status(204).end();
  })
);

router.get("/highlights", h(async (_req, res) => res.json(await repo.adminListHighlights())));

router.delete(
  "/highlights/:id",
  h(async (req, res) => {
    const owner = await repo.adminDeleteHighlight(req.params.id);
    await repo.logAdminAction(req.userId, "delete_highlight", `Deleted highlight by ${owner}`);
    res.status(204).end();
  })
);

router.get("/comments", h(async (_req, res) => res.json(await repo.adminListComments())));

router.delete(
  "/comments/:kind/:id",
  h(async (req, res) => {
    const kind = req.params.kind === "highlight" ? "highlight" : "game";
    await repo.adminDeleteComment(kind, req.params.id);
    await repo.logAdminAction(req.userId, "delete_comment", `Deleted a ${kind} comment`);
    res.status(204).end();
  })
);

router.post(
  "/seed-past-data",
  h(async (req, res) => {
    const { seedPastData } = await import("./seed.js");
    await seedPastData();
    await repo.logAdminAction(req.userId, "seed_past_data", "Ran: seed past data");
    res.json({ ok: true });
  })
);

router.get("/feedback", h(async (_req, res) => res.json(await repo.adminListFeedback())));

router.patch(
  "/feedback/:id/resolve",
  h(async (req, res) => {
    const resolved = !!(req.body && req.body.resolved);
    await repo.setFeedbackResolved(req.params.id, resolved);
    await repo.logAdminAction(
      req.userId,
      "feedback_resolve",
      `Marked feedback ${resolved ? "resolved" : "open"}`
    );
    res.json({ ok: true, resolved });
  })
);

router.delete(
  "/feedback/:id",
  h(async (req, res) => {
    await repo.adminDeleteFeedback(req.params.id);
    await repo.logAdminAction(req.userId, "feedback_delete", "Deleted a feedback item");
    res.status(204).end();
  })
);

router.get("/audit", h(async (_req, res) => res.json(await repo.adminListAudit())));

router.get("/reports", h(async (_req, res) => res.json(await repo.adminListReports())));

router.patch(
  "/reports/:id",
  h(async (req, res) => {
    const status = req.body && req.body.status;
    if (!(await repo.adminSetReportStatus(req.params.id, status)))
      return res.status(400).json({ error: "Invalid status." });
    await repo.logAdminAction(req.userId, "report_status", `Marked a report ${status}`);
    res.json({ ok: true, status });
  })
);

router.post(
  "/broadcast",
  h(async (req, res) => {
    const message = (req.body && req.body.message ? String(req.body.message) : "").trim();
    if (!message) return res.status(400).json({ error: "Message is required." });
    if (message.length > 280)
      return res.status(400).json({ error: "Keep announcements under 280 characters." });
    const count = await repo.broadcastAnnouncement(message);
    await repo.logAdminAction(req.userId, "broadcast", `Sent announcement to ${count} users: "${message.slice(0, 80)}"`);
    res.json({ ok: true, count });
  })
);

router.get("/flags", h(async (_req, res) => res.json(await repo.getFlags())));

router.patch(
  "/flags/:key",
  h(async (req, res) => {
    const key = req.params.key;
    if (!["maintenance_mode", "signups_enabled"].includes(key))
      return res.status(400).json({ error: "Unknown flag." });
    const enabled = !!(req.body && req.body.enabled);
    await repo.setFlag(key, enabled);
    await repo.logAdminAction(req.userId, "set_flag", `Set ${key} to ${enabled ? "ON" : "OFF"}`);
    res.json({ ok: true, key, enabled });
  })
);

// --- Waitlist funnel analytics --------------------------------------------
// submittedDb (from our own waitlist table) is the source of truth for actual
// submissions; submittedPosthog is informational only (PostHog can undercount
// due to ad blockers / consent declines).
router.get(
  "/analytics/funnel",
  h(async (_req, res) => {
    const [{ visits, started, submittedPosthog }, submittedDb, rawBySource] = await Promise.all([
      queryWaitlistFunnel(),
      repo.getWaitlistCount(),
      repo.getWaitlistCountsBySource(),
    ]);
    const startedRate = visits > 0 ? Math.round((started / visits) * 100) : 0;
    const submittedRate = visits > 0 ? Math.round((submittedDb / visits) * 100) : 0;
    // Per-channel attribution from our own DB (utm_source captured at signup).
    // Percentages are of *real* signups only — the 'test' bucket (our own
    // testing) is excluded from the denominator.
    const realTotal = rawBySource
      .filter((r) => r.source !== "test")
      .reduce((sum, r) => sum + r.count, 0);
    const bySource = rawBySource.map((r) => ({
      source: r.source,
      count: r.count,
      percent:
        r.source === "test" || realTotal === 0
          ? null
          : Math.round((r.count / realTotal) * 1000) / 10, // one decimal place
    }));
    res.json({ visits, started, submittedDb, submittedPosthog, startedRate, submittedRate, bySource });
  })
);

export default router;
