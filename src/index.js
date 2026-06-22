require("dotenv").config();

const pool = require("./db");

const {
  addToQueue,
  removeFromQueue,
  tryMatch,
  queue,
} = require("./services/matchmaking");

const {
  handleSubmit,
  finishMatch,
  scheduleTimeExpiry,
} = require("./services/duelService");

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const problemsRouter = require("./routes/problems");
const { executeCode } = require("./services/pistonClient");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/problems", problemsRouter);
app.use("/api/matches", require("./routes/matches"));
app.use("/api/friends", require("./routes/friends"));
app.use("/api/reports", require("./routes/reports"));

// Temporary route to verify Piston connectivity
app.post("/api/_test-exec", async (req, res) => {
  try {
    const result = await executeCode({
      language: "python",
      code: req.body.code,
    });

    res.json(result);
  } catch (err) {
    console.log(err.response?.data || err);

    res.status(500).json({
      error: err.message,
    });
  }
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error("missing token"));
  }

  try {
    // TODO: Replace jwt.decode() with proper Supabase JWKS verification (ES256)
    socket.userId = jwt.decode(token).sub;

    next();
  } catch {
    next(new Error("invalid token"));
  }
});

const lastSubmitAt = new Map();

io.on("connection", (socket) => {
  console.log("socket connected:", socket.userId);

  socket.on("duel:run:custom", async ({ language, code, stdin }, callback) => {
    try {
      const output = await executeCode({
        language,
        code,
        stdin,
      });

      callback({
        stdout: output.run?.stdout,
        stderr: output.run?.stderr,
        exitCode: output.run?.code,
      });
    } catch (err) {
      callback({
        error: err.message,
      });
    }
  });

  socket.on("duel:join", async ({ matchId }) => {
    const {
      rows: [match],
    } = await pool.query(
      "select player_one_id, player_two_id from matches where id=$1",
      [matchId],
    );

    if (
      match &&
      [match.player_one_id, match.player_two_id].includes(socket.userId)
    ) {
      socket.join(`match:${matchId}`);
    }

    console.log("JOINED ROOM", socket.userId, `match:${matchId}`);
  });

  socket.on("anticheat:paste_attempt", ({ matchId, language }) => {
    console.log(
      `[anti-cheat] paste blocked: user=${socket.userId} match=${matchId} lang=${language}`,
    );
  });

  socket.on("duel:submit", (payload, callback) => {
    const last = lastSubmitAt.get(socket.userId) || 0;

    if (Date.now() - last < 3000) {
      return callback({
        error: "Submitting too fast — wait a moment.",
      });
    }

    lastSubmitAt.set(socket.userId, Date.now());

    handleSubmit(io, socket, payload, callback);
  });

  socket.on("duel:forfeit", async ({ matchId }) => {
    const {
      rows: [match],
    } = await pool.query(
      "select player_one_id, player_two_id from matches where id=$1",
      [matchId],
    );

    if (!match) return;

    const winnerId =
      match.player_one_id === socket.userId
        ? match.player_two_id
        : match.player_one_id;

    await finishMatch(io, matchId, {
      resultType: "forfeit",
      winnerId,
    });
  });

  socket.on("duel:run", async ({ matchId, code, language }, callback) => {
    const {
      rows: [match],
    } = await pool.query("select problem_id from matches where id = $1", [
      matchId,
    ]);

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

    const results = [];

    for (const test of sampleTests) {
      const output = await executeCode({
        language,
        code,
        stdin: test.input,
      });

      const actual = (output.run?.stdout || "").trim();

      results.push({
        ordinal: test.ordinal,
        passed: actual === test.expected_output.trim(),
        actualOutput: actual,
        runtimeMs: output.run?.wall_time,
      });
    }

    callback({ results });
  });

  socket.on("queue:join", async ({ difficulty = "any" }) => {
    const {
      rows: [user],
    } = await pool.query("select rating from users where id = $1", [
      socket.userId,
    ]);

    addToQueue(socket, {
      userId: socket.userId,
      rating: user.rating,
      difficulty,
    });

    socket.emit("queue:waiting", {
      position: queue.length,
    });

    tryMatch(io);
  });

  socket.on("queue:leave", () => {
    removeFromQueue(socket.id);
  });

  socket.on("disconnect", () => {
    removeFromQueue(socket.id);

    console.log("socket disconnected:", socket.userId);
  });

  socket.on("rematch:request", ({ matchId }) => {
    console.log("REMATCH REQUEST", matchId, socket.userId);

    socket.to(`match:${matchId}`).emit("rematch:requested", {
      fromUserId: socket.userId,
    });
  });

  socket.on("rematch:decline", ({ matchId }) => {
    console.log("REMATCH DECLINE", matchId);

    socket.to(`match:${matchId}`).emit("rematch:declined");
  });

  socket.on("rematch:accept", async ({ matchId }) => {
    console.log("REMATCH ACCEPT", matchId);
    const {
      rows: [old],
    } = await pool.query(
      `
      select player_one_id, player_two_id
      from matches
      where id = $1
    `,
      [matchId],
    );

    if (!old) return;

    const {
      rows: [{ id: problemId }],
    } = await pool.query(
      `
      select id
      from problems
      order by random()
      limit 1
    `,
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
        started_at,
        rematch_of_match_id
      )
      values
      (
        $1,
        $2,
        $3,
        'active',
        now(),
        $4
      )
      returning id
    `,
      [problemId, old.player_one_id, old.player_two_id, matchId],
    );

    scheduleTimeExpiry(io, match.id, 30 * 60 * 1000);

    io.to(`match:${matchId}`).emit("rematch:accepted", {
      matchId: match.id,
    });
  });
});

setInterval(() => {
  tryMatch(io);
}, 2000);

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`backend on ${PORT}`);
});
