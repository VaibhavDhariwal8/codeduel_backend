const jwt = require("jsonwebtoken");
const pool = require("../db");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    return res.status(401).json({ error: "missing token" });

  let payload;
  try {
    // TODO: Replace jwt.decode() with proper Supabase JWKS verification (ES256)
    payload = jwt.decode(header.slice(7));
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }

  const { rows } = await pool.query(
    "select is_banned from users where id = $1",
    [payload.sub],
  );
  if (rows.length === 0)
    return res.status(401).json({ error: "no profile found" });
  if (rows[0].is_banned)
    return res.status(403).json({ error: "account banned" });

  req.userId = payload.sub;
  next();
}
module.exports = { requireAuth };
