
require("dotenv").config();

const { createClient } = require("@libsql/client");

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function testConnection() {
  try {
    const result = await db.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    );

    console.log("Turso connected successfully!");
    console.log("Tables found:");

    result.rows.forEach((row) => {
      console.log("-", row.name);
    });
  } catch (error) {
    console.error("Connection failed:", error.message);
  } finally {
    await db.close();
  }
}

testConnection();
