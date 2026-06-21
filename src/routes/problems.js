const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const { difficulty } = req.query;
  let query = `select p.id, p.title, p.difficulty, array_agg(t.name) as tags
    from problems p
    left join problem_tags pt on pt.problem_id = p.id
    left join tags t on t.id = pt.tag_id`;
  const params = [];
  if (difficulty) {
    params.push(difficulty);
    query += ` where p.difficulty = $1`;
  }
  query += " group by p.id order by p.title";
  const { rows } = await pool.query(query, params);
  res.json(rows);
});

router.get("/:id", requireAuth, async (req, res) => {
  const {
    rows: [problem],
  } = await pool.query(
    "select id, title, difficulty, statement from problems where id = $1",
    [req.params.id],
  );
  if (!problem) return res.status(404).json({ error: "not found" });
  const { rows: sampleTests } = await pool.query(
    `select id, input, expected_output, ordinal from test_cases where problem_id = $1 and visibility = 'sample' order by ordinal`,
    [req.params.id],
  );
  res.json({ ...problem, sampleTests });
});

module.exports = router;
