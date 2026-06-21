const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // fine for dev; use Supabase's CA cert if you harden this later
});
module.exports = pool;
