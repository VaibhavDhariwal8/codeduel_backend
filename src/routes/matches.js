const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const { generateAutopsy } = require("../services/aiAutopsy");

const router = express.Router();

router.get("/:id/autopsy", requireAuth, async (req, res) => {
  const {
    rows: [match],
  } = await pool.query(
    `select id, problem_id, player_one_id, player_two_id, status from matches where id=$1`,
    [req.params.id],
  );
  if (!match) return res.status(404).json({ error: "not found" });
  if (![match.player_one_id, match.player_two_id].includes(req.userId))
    return res.status(403).json({ error: "not a participant" });
  if (match.status !== "completed")
    return res.status(409).json({ error: "not finished yet" });

  const otherId =
    match.player_one_id === req.userId
      ? match.player_two_id
      : match.player_one_id;

  async function bestSubmission(userId) {
    const {
      rows: [sub],
    } = await pool.query(
      `select id, code, language, tests_passed, tests_total, ai_autopsy from submissions
       where match_id=$1 and user_id=$2 order by tests_passed desc, submitted_at desc limit 1`,
      [match.id, userId],
    );
    return sub || null;
  }

  const [yourSub, opponentSub] = await Promise.all([
    bestSubmission(req.userId),
    bestSubmission(otherId),
  ]);

  if (!yourSub)
    return res.json({
      unavailable: true,
      reason: "You never submitted a solution in this match.",
    });
  if (yourSub.ai_autopsy) return res.json(yourSub.ai_autopsy); // cached — no repeat API call

  const {
    rows: [problem],
  } = await pool.query("select statement from problems where id=$1", [
    match.problem_id,
  ]);

  let autopsy;
  try {
    autopsy = await generateAutopsy({
      problemStatement: problem.statement,
      yourCode: yourSub.code,
      yourLanguage: yourSub.language,
      yourPassed: yourSub.tests_passed,
      yourTotal: yourSub.tests_total,
      opponentCode: opponentSub?.code || "(no submission)",
      opponentLanguage: opponentSub?.language || "n/a",
      opponentPassed: opponentSub?.tests_passed || 0,
      opponentTotal: opponentSub?.tests_total || yourSub.tests_total,
    });
  } catch (err) {
    console.error("[ai-autopsy]", err.message);
    return res
      .status(502)
      .json({
        unavailable: true,
        reason: "Coach is unavailable right now — try again in a moment.",
      });
  }

  await pool.query("update submissions set ai_autopsy=$1 where id=$2", [
    autopsy,
    yourSub.id,
  ]);
  res.json(autopsy);
});

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

router.get("/:id/result", requireAuth, async (req, res) => {
  const {
    rows: [match],
  } = await pool.query(
    `select id, problem_id, player_one_id, player_two_id, status, result_type, winner_id, started_at, ended_at
     from matches where id = $1`,
    [req.params.id],
  );
  if (!match) return res.status(404).json({ error: "not found" });
  if (![match.player_one_id, match.player_two_id].includes(req.userId))
    return res.status(403).json({ error: "not a participant" });
  if (match.status !== "completed")
    return res.status(409).json({ error: "not finished yet" });

  const {
    rows: [problem],
  } = await pool.query("select title, difficulty from problems where id=$1", [
    match.problem_id,
  ]);
  const otherId =
    match.player_one_id === req.userId
      ? match.player_two_id
      : match.player_one_id;

  const { rows: users } = await pool.query(
    "select id, username, rating from users where id in ($1,$2)",
    [req.userId, otherId],
  );
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const { rows: deltas } = await pool.query(
    "select user_id, rating_before, rating_after from rating_history where match_id=$1",
    [match.id],
  );
  const deltaMap = Object.fromEntries(
    deltas.map((d) => [d.user_id, d.rating_after - d.rating_before]),
  );

  async function bestSubmission(userId) {
    const {
      rows: [sub],
    } = await pool.query(
      `select code, tests_passed, tests_total from submissions where match_id=$1 and user_id=$2
       order by tests_passed desc, submitted_at desc limit 1`,
      [match.id, userId],
    );
    return sub || null;
  }
  const [yourSub, opponentSub] = await Promise.all([
    bestSubmission(req.userId),
    bestSubmission(otherId),
  ]);

  res.json({
    problem,
    resultType: match.result_type,
    youWon: match.winner_id === req.userId,
    isDraw: match.result_type === "draw",
    timeTakenSec:
      match.started_at && match.ended_at
        ? Math.round(
            (new Date(match.ended_at) - new Date(match.started_at)) / 1000,
          )
        : null,
    you: {
      id: req.userId,
      username: userMap[req.userId].username,
      rating: userMap[req.userId].rating,
      ratingDelta: deltaMap[req.userId] || 0,
      submission: yourSub,
    },
    opponent: {
      id: otherId,
      username: userMap[otherId].username,
      rating: userMap[otherId].rating,
      ratingDelta: deltaMap[otherId] || 0,
      submission: opponentSub,
    },
  });
});

module.exports = router;
