const { getPool, SCHEMA_SQL } = require("../lib/db");

// One-time migration endpoint. Call POST /api/migrate to create the table.
// Protect with a secret token in production.
module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!process.env.MIGRATION_SECRET || token !== process.env.MIGRATION_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const pool = getPool();
  await pool.query(SCHEMA_SQL);
  return res.status(200).json({ ok: true, message: "Schema applied" });
};
