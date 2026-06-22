const express = require("express");
const pool = require("../db");
const { requireAuth } = require("../middleware/auth");
const { isOnline } = require("../services/presence");

const router = express.Router();

router.get("/online", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `
      select
        case
          when requester_id = $1 then addressee_id
          else requester_id
        end as friend_id,

        case
          when requester_id = $1 then u2.username
          else u1.username
        end as username

      from friendships f
      join users u1 on u1.id = f.requester_id
      join users u2 on u2.id = f.addressee_id

      where status = 'accepted'
        and (requester_id = $1 or addressee_id = $1)
    `,
    [req.userId],
  );

  res.json(
    rows.map((r) => ({
      ...r,
      online: isOnline(r.friend_id),
    })),
  );
});

router.get("/", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `select f.id, f.status, f.requester_id, f.addressee_id,
            case when f.requester_id = $1 then u2.username else u1.username end as other_username,
            case when f.requester_id = $1 then f.addressee_id else f.requester_id end as other_user_id
     from friendships f
     join users u1 on u1.id = f.requester_id
     join users u2 on u2.id = f.addressee_id
     where f.requester_id = $1 or f.addressee_id = $1
     order by f.created_at desc`,
    [req.userId],
  );

  res.json(rows);
});

router.post("/requests", requireAuth, async (req, res) => {
  const { username } = req.body;

  const {
    rows: [target],
  } = await pool.query("select id from users where username = $1", [username]);

  if (!target) return res.status(404).json({ error: "user not found" });

  if (target.id === req.userId)
    return res.status(400).json({ error: "can't friend yourself" });

  try {
    const {
      rows: [row],
    } = await pool.query(
      `insert into friendships (requester_id, addressee_id, status)
       values ($1,$2,'pending')
       returning id`,
      [req.userId, target.id],
    );

    res.json(row);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "request already exists" });
    }

    throw err;
  }
});

router.post("/requests/:id/accept", requireAuth, async (req, res) => {
  const {
    rows: [row],
  } = await pool.query(
    `update friendships
     set status='accepted', responded_at=now()
     where id=$1 and addressee_id=$2
     returning id`,
    [req.params.id, req.userId],
  );

  if (!row) return res.status(404).json({ error: "not found" });

  res.json({ ok: true });
});

router.post("/requests/:id/decline", requireAuth, async (req, res) => {
  await pool.query(
    `update friendships
     set status='declined', responded_at=now()
     where id=$1 and addressee_id=$2`,
    [req.params.id, req.userId],
  );

  res.json({ ok: true });
});

router.delete("/:userId", requireAuth, async (req, res) => {
  await pool.query(
    `delete from friendships
     where (requester_id=$1 and addressee_id=$2)
        or (requester_id=$2 and addressee_id=$1)`,
    [req.userId, req.params.userId],
  );

  res.json({ ok: true });
});

module.exports = router;
