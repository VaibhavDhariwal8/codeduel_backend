const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/", requireAuth, async (req, res) => {
  const { reportedUserId, matchId, reason, details } = req.body;

  if (reportedUserId === req.userId) {
    return res.status(400).json({ error: "can't report yourself" });
  }

  const {
    rows: [row],
  } = await pool.query(
    `insert into reports
      (reporter_id, reported_user_id, match_id, reason, details)
     values ($1,$2,$3,$4,$5)
     returning id`,
    [req.userId, reportedUserId, matchId || null, reason, details || null],
  );

  res.json(row);
});

module.exports = router;
