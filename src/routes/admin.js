const express = require("express");
const pool = require("../db");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { finishMatch } = require("../services/duelService");
const router = express.Router();

router.get("/reports", requireAuth, requireAdmin, async (req, res) => {
  const { rows: reports } = await pool.query(
    `select r.id, r.reason, r.details, r.created_at,
            ru.username as reporter_username, ru.id as reporter_id,
            tu.username as reported_username, tu.id as reported_id
     from reports r
     join users ru on ru.id = r.reporter_id
     join users tu on tu.id = r.reported_user_id
     where r.status = 'open' order by r.created_at asc`,
  );

  for (const r of reports) {
    const {
      rows: [counts],
    } = await pool.query(
      `select count(*)::int as total_reports, count(distinct reporter_id)::int as distinct_reporters
       from reports where reported_user_id = $1`,
      [r.reported_id],
    );
    const {
      rows: [flagged],
    } = await pool.query(
      `select count(*)::int as flagged_count from flagged_submission_pairs fp
       join submissions s on s.id = fp.submission_a_id or s.id = fp.submission_b_id
       where s.user_id = $1`,
      [r.reported_id],
    );
    const {
      rows: [h2h],
    } = await pool.query(
      `select count(*)::int as games_played, count(*) filter (where winner_id = $1)::int as reported_wins
       from matches where status='completed' and
       ((player_one_id=$1 and player_two_id=$2) or (player_one_id=$2 and player_two_id=$1))`,
      [r.reported_id, r.reporter_id],
    );
    Object.assign(r, {
      totalReports: counts.total_reports,
      distinctReporters: counts.distinct_reporters,
      flaggedCount: flagged.flagged_count,
      headToHead: h2h,
    });
  }
  res.json(reports);
});

router.post(
  "/reports/:id/dismiss",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    await pool.query(
      `update reports set status='dismissed', reviewed_by=$1, reviewed_at=now() where id=$2`,
      [req.userId, req.params.id],
    );
    res.json({ ok: true });
  },
);

router.post("/reports/:id/ban", requireAuth, requireAdmin, async (req, res) => {
  const {
    rows: [report],
  } = await pool.query(`select reported_user_id from reports where id=$1`, [
    req.params.id,
  ]);
  if (!report) return res.status(404).json({ error: "not found" });

  await pool.query(`update users set is_banned=true where id=$1`, [
    report.reported_user_id,
  ]);
  await pool.query(
    `update reports set status='reviewed', reviewed_by=$1, reviewed_at=now() where id=$2`,
    [req.userId, req.params.id],
  );

  const io = req.app.get("io");
  io.in(`user:${report.reported_user_id}`).disconnectSockets(true);

  const {
    rows: [activeMatch],
  } = await pool.query(
    `select id, player_one_id, player_two_id from matches where status='active' and (player_one_id=$1 or player_two_id=$1)`,
    [report.reported_user_id],
  );
  if (activeMatch) {
    const winnerId =
      activeMatch.player_one_id === report.reported_user_id
        ? activeMatch.player_two_id
        : activeMatch.player_one_id;
    await finishMatch(io, activeMatch.id, { resultType: "forfeit", winnerId });
  }
  res.json({ ok: true });
});
module.exports = router;
