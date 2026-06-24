const express = require("express");
const crypto = require("crypto");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const { scheduleTimeExpiry } = require("../services/duelService");
const router = express.Router();

router.post("/", requireAuth, async (req, res) => {
  const { difficulty = "any" } = req.body;
  const token = crypto.randomBytes(8).toString("hex");
  const {
    rows: [invite],
  } = await pool.query(
    `insert into custom_duel_invites (inviter_id, invite_token, difficulty_pref, expires_at)
     values ($1,$2,$3, now() + interval '1 hour') returning invite_token`,
    [req.userId, token, difficulty],
  );
  res.json({ token: invite.invite_token });
});

router.get("/:token", requireAuth, async (req, res) => {
  const {
    rows: [invite],
  } = await pool.query(
    `select ci.status, ci.difficulty_pref, ci.expires_at, ci.inviter_id, u.username as inviter_username
     from custom_duel_invites ci join users u on u.id = ci.inviter_id where ci.invite_token = $1`,
    [req.params.token],
  );
  if (!invite) return res.status(404).json({ error: "invite not found" });
  const expired =
    invite.status === "pending" && new Date(invite.expires_at) < new Date();
  res.json({
    ...invite,
    expired,
    isOwnInvite: invite.inviter_id === req.userId,
  });
});

router.post("/:token/accept", requireAuth, async (req, res) => {
  const {
    rows: [invite],
  } = await pool.query(
    `select * from custom_duel_invites where invite_token=$1`,
    [req.params.token],
  );
  if (!invite) return res.status(404).json({ error: "invite not found" });
  if (invite.status !== "pending")
    return res.status(409).json({ error: "invite no longer available" });
  if (new Date(invite.expires_at) < new Date())
    return res.status(409).json({ error: "invite expired" });
  if (invite.inviter_id === req.userId)
    return res.status(400).json({ error: "can't accept your own invite" });

  const {
    rows: [{ id: problemId }],
  } = await pool.query(
    `select id from problems where ($1='any' or difficulty=$1) order by random() limit 1`,
    [invite.difficulty_pref],
  );
  const {
    rows: [match],
  } = await pool.query(
    `insert into matches (problem_id, player_one_id, player_two_id, status, started_at)
     values ($1,$2,$3,'active',now()) returning id`,
    [problemId, invite.inviter_id, req.userId],
  );
  await pool.query(
    `update custom_duel_invites set invitee_id=$1, status='accepted', resulting_match_id=$2 where id=$3`,
    [req.userId, match.id, invite.id],
  );

  scheduleTimeExpiry(req.app.get("io"), match.id, 30 * 60 * 1000);
  req.app
    .get("io")
    .to(`user:${invite.inviter_id}`)
    .emit("invite:accepted", { matchId: match.id });
  res.json({ matchId: match.id });
});

module.exports = router;
