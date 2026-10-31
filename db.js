
require("dotenv").config();

const { createClient } = require("@libsql/client");

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  throw new Error("Missing Turso database credentials in .env");
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Fetch one record
async function get(sql, args = []) {
  const result = await db.execute({ sql, args });
  return result.rows[0] || null;
}

// Fetch multiple records
async function all(sql, args = []) {
  const result = await db.execute({ sql, args });
  return result.rows;
}

// Insert, update or delete records
async function run(sql, args = []) {
  const result = await db.execute({ sql, args });

  return {
    lastInsertRowid: Number(result.lastInsertRowid),
    changes: Number(result.rowsAffected),
  };
}

// Check the database connection
async function initializeDatabase() {
  await db.execute("PRAGMA foreign_keys = ON");
  await get("SELECT 1");
  console.log("Turso database initialized successfully.");
}

module.exports = {
  db,
  get,
  all,
  run,
  initializeDatabase,
};
