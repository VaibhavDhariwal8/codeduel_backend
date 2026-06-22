const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `select m.id, m.result_type, m.winner_id, m.ended_at, p.title as problem_title, p.difficulty,
            case when m.player_one_id = $1 then u2.username else u1.username end as opponent_username
     from matches m
     join problems p on p.id = m.problem_id
     join users u1 on u1.id = m.player_one_id
     join users u2 on u2.id = m.player_two_id
     where (m.player_one_id = $1 or m.player_two_id = $1) and m.status = 'completed'
     order by m.ended_at desc limit 20`,
    [req.userId],
  );
  res.json(rows.map((r) => ({ ...r, youWon: r.winner_id === req.userId })));
});
module.exports = router;
