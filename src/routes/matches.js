const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/:id", requireAuth, async (req, res) => {
  const {
    rows: [match],
  } = await pool.query(
    `
      select
        id,
        problem_id,
        player_one_id,
        player_two_id,
        status,
        started_at
      from matches
      where id = $1
    `,
    [req.params.id],
  );

  if (!match) {
    return res.status(404).json({
      error: "not found",
    });
  }

  if (![match.player_one_id, match.player_two_id].includes(req.userId)) {
    return res.status(403).json({
      error: "not a participant",
    });
  }

  const {
    rows: [problem],
  } = await pool.query(
    `
      select
        id,
        title,
        difficulty,
        statement
      from problems
      where id = $1
    `,
    [match.problem_id],
  );

  const { rows: sampleTests } = await pool.query(
    `
      select
        id,
        input,
        expected_output,
        ordinal
      from test_cases
      where problem_id = $1
        and visibility = 'sample'
      order by ordinal
    `,
    [match.problem_id],
  );

  res.json({
    match,
    problem,
    sampleTests,
  });
});

module.exports = router;
