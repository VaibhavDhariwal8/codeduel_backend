const pool = require("../db");
const { executeCode } = require("./pistonClient");

async function handleSubmit(io, socket, { matchId, code, language }, callback) {
  const {
    rows: [match],
  } = await pool.query(
    `select id, problem_id, player_one_id, player_two_id, status from matches where id = $1`,
    [matchId],
  );
  if (!match || match.status !== "active")
    return callback({ error: "match not active" });

  const { rows: tests } = await pool.query(
    `select id, input, expected_output, ordinal from test_cases where problem_id = $1 order by ordinal`,
    [match.problem_id],
  );

  const {
    rows: [submission],
  } = await pool.query(
    `insert into submissions (match_id, user_id, language, code, tests_total) values ($1,$2,$3,$4,$5) returning id`,
    [matchId, socket.userId, language, code, tests.length],
  );

  let passedCount = 0;
  for (const t of tests) {
    const output = await executeCode({ language, code, stdin: t.input });
    const actual = (output.run?.stdout || "").trim();
    const passed = actual === t.expected_output.trim();
    if (passed) passedCount++;
    await pool.query(
      `insert into submission_test_results (submission_id, test_case_id, passed, runtime_ms, ordinal) values ($1,$2,$3,$4,$5)`,
      [submission.id, t.id, passed, output.run?.time, t.ordinal],
    );
  }
  await pool.query(`update submissions set tests_passed = $1 where id = $2`, [
    passedCount,
    submission.id,
  ]);

  io.to(`match:${matchId}`).emit("duel:opponent:progress", {
    submitterId: socket.userId,
    testsPassed: passedCount,
    testsTotal: tests.length,
  });
  callback({ testsPassed: passedCount, testsTotal: tests.length });

  if (passedCount === tests.length) {
    await finishMatch(io, matchId, {
      resultType: "solved",
      winnerId: socket.userId,
    });
  }
}

async function finishMatch(
  io,
  matchId,
  { resultType, winnerId, draw = false },
) {
  const {
    rows: [match],
  } = await pool.query(
    `update matches set status='completed', result_type=$1, winner_id=$2, ended_at=now() where id=$3 and status='active' returning *`,
    [resultType, winnerId || null, matchId],
  );
  if (!match) return; // already finished via another path — race-safe no-op

  const {
    rows: [p1],
  } = await pool.query("select id, rating from users where id = $1", [
    match.player_one_id,
  ]);
  const {
    rows: [p2],
  } = await pool.query("select id, rating from users where id = $1", [
    match.player_two_id,
  ]);
  const K = 32;
  const expectedP1 = 1 / (1 + Math.pow(10, (p2.rating - p1.rating) / 400));
  const scoreP1 = draw ? 0.5 : winnerId === p1.id ? 1 : 0;
  const newP1Rating = Math.round(p1.rating + K * (scoreP1 - expectedP1));
  const newP2Rating = Math.round(
    p2.rating + K * (1 - scoreP1 - (1 - expectedP1)),
  );

  await pool.query(
    "update users set rating=$1, wins=wins+$2, losses=losses+$3 where id=$4",
    [newP1Rating, scoreP1 === 1 ? 1 : 0, scoreP1 === 0 ? 1 : 0, p1.id],
  );
  await pool.query(
    "update users set rating=$1, wins=wins+$2, losses=losses+$3 where id=$4",
    [newP2Rating, scoreP1 === 0 ? 1 : 0, scoreP1 === 1 ? 1 : 0, p2.id],
  );
  await pool.query(
    "insert into rating_history (user_id, match_id, rating_before, rating_after) values ($1,$2,$3,$4)",
    [p1.id, matchId, p1.rating, newP1Rating],
  );
  await pool.query(
    "insert into rating_history (user_id, match_id, rating_before, rating_after) values ($1,$2,$3,$4)",
    [p2.id, matchId, p2.rating, newP2Rating],
  );

  io.to(`match:${matchId}`).emit("match:ended", {
    winnerId,
    resultType,
    ratingDeltas: {
      [p1.id]: newP1Rating - p1.rating,
      [p2.id]: newP2Rating - p2.rating,
    },
  });
}

function scheduleTimeExpiry(io, matchId, delayMs) {
  setTimeout(async () => {
    const {
      rows: [match],
    } = await pool.query(
      "select status, player_one_id, player_two_id from matches where id=$1",
      [matchId],
    );
    if (!match || match.status !== "active") return;
    const { rows: best } = await pool.query(
      `select user_id, max(tests_passed) as best from submissions where match_id=$1 group by user_id`,
      [matchId],
    );
    const scoreFor = (uid) => best.find((b) => b.user_id === uid)?.best || 0;
    const p1Score = scoreFor(match.player_one_id),
      p2Score = scoreFor(match.player_two_id);
    if (p1Score === p2Score)
      await finishMatch(io, matchId, { resultType: "draw", draw: true });
    else
      await finishMatch(io, matchId, {
        resultType: "time_expired",
        winnerId: p1Score > p2Score ? match.player_one_id : match.player_two_id,
      });
  }, delayMs);
}

module.exports = { handleSubmit, scheduleTimeExpiry, finishMatch };
