require("dotenv").config();

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
    socket.userId = jwt.decode(token).sub;

    next();
  } catch {
    next(new Error("invalid token"));
  }
});

io.on("connection", (socket) => {
  console.log("socket connected:", socket.userId);

  socket.on("disconnect", () => {
    console.log("socket disconnected:", socket.userId);
  });
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`backend on ${PORT}`);
});
