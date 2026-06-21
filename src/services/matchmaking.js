const pool = require("../db");

const { scheduleTimeExpiry } = require("./duelService");

const queue = []; // { socket, userId, rating, difficulty, joinedAt }

function addToQueue(socket, entry) {
  removeFromQueue(socket.id);
  queue.push({
    socket,
    joinedAt: Date.now(),
    ...entry,
  });
}

function removeFromQueue(socketId) {
  const idx = queue.findIndex((e) => e.socket.id === socketId);

  if (idx !== -1) {
    queue.splice(idx, 1);
  }

  //   console.log("queue size:", queue.length);   for testing queues
}

function ratingBandFor(entry) {
  const waitedSec = (Date.now() - entry.joinedAt) / 1000;

  return 100 + Math.floor(waitedSec / 20) * 100;
}

async function tryMatch(io) {
  for (let i = 0; i < queue.length; i++) {
    for (let j = i + 1; j < queue.length; j++) {
      const a = queue[i];
      const b = queue[j];

      const band = Math.max(ratingBandFor(a), ratingBandFor(b));

      if (Math.abs(a.rating - b.rating) <= band) {
        await pairUp(io, a, b);

        queue.splice(j, 1);
        queue.splice(i, 1);

        return tryMatch(io);
      }
    }
  }
}

async function pairUp(io, a, b) {
  const pref = a.difficulty !== "any" ? a.difficulty : b.difficulty;

  const {
    rows: [{ id: problemId }],
  } = await pool.query(
    `
      select id
      from problems
      where ($1 = 'any' or difficulty = $1)
      order by random()
      limit 1
    `,
    [pref],
  );

  const {
    rows: [match],
  } = await pool.query(
    `
      insert into matches
      (
        problem_id,
        player_one_id,
        player_two_id,
        status,
        started_at
      )
      values
      (
        $1,
        $2,
        $3,
        'active',
        now()
      )
      returning id
    `,
    [problemId, a.userId, b.userId],
  );

  scheduleTimeExpiry(io, match.id, 30 * 60 * 1000);

  a.socket.join(`match:${match.id}`);
  b.socket.join(`match:${match.id}`);

  a.socket.emit("match:found", {
    matchId: match.id,
    problemId,
  });

  b.socket.emit("match:found", {
    matchId: match.id,
    problemId,
  });
}

module.exports = {
  addToQueue,
  removeFromQueue,
  tryMatch,
  queue,
};
