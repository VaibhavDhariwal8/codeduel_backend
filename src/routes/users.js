const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

router.get("/leaderboard", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `
    select
      username,
      rating,
      wins,
      losses,
      row_number() over (order by rating desc) as rank
    from users
    order by rating desc
    limit 50
    `,
  );

  res.json(rows);
});

router.get("/:identifier/profile", requireAuth, async (req, res) => {
  const { identifier } = req.params;
  const query =
    identifier === "me"
      ? "select id, username, rating, wins, losses, created_at from users where id = $1"
      : "select id, username, rating, wins, losses, created_at from users where username = $1";
  const {
    rows: [user],
  } = await pool.query(query, [identifier === "me" ? req.userId : identifier]);
  if (!user) return res.status(404).json({ error: "not found" });

  const { rows: recentMatches } = await pool.query(
    `select m.id, m.result_type, m.winner_id, m.ended_at, p.title as problem_title,
            case when m.player_one_id = $1 then u2.username else u1.username end as opponent_username
     from matches m
     join problems p on p.id = m.problem_id
     join users u1 on u1.id = m.player_one_id
     join users u2 on u2.id = m.player_two_id
     where (m.player_one_id = $1 or m.player_two_id = $1) and m.status = 'completed'
     order by m.ended_at desc limit 10`,
    [user.id],
  );
  res.json({ ...user, isOwnProfile: user.id === req.userId, recentMatches });
});
module.exports = router;
