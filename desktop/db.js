
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createClient } = require("@libsql/client");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    normalized_phone TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sms_consent INTEGER NOT NULL DEFAULT 0 CHECK (sms_consent IN (0, 1)),
    whatsapp_consent INTEGER NOT NULL DEFAULT 0 CHECK (whatsapp_consent IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    duration_days INTEGER NOT NULL CHECK (duration_days > 0),
    price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS memberships (
    id INTEGER PRIMARY KEY,
    member_id INTEGER NOT NULL REFERENCES members(id),
    plan_id INTEGER REFERENCES plans(id),
    plan_name TEXT NOT NULL,
    price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY,
    membership_id INTEGER NOT NULL REFERENCES memberships(id),
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    payment_date TEXT NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'bank_transfer', 'upi', 'other')),
    reference TEXT NOT NULL DEFAULT '',
    recorded_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY,
    membership_id INTEGER NOT NULL REFERENCES memberships(id),
    channel TEXT NOT NULL CHECK (channel IN ('sms', 'whatsapp')),
    status TEXT NOT NULL CHECK (status IN ('prepared', 'sent', 'failed')),
    message TEXT NOT NULL,
    outcome_note TEXT NOT NULL DEFAULT '',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

function createDatabase(databasePath) {
  const url = databasePath === ":memory:"
    ? "file::memory:"
    : pathToFileURL(path.resolve(databasePath)).href;
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  }
  return createClient({ url });
}

async function initializeDatabase(database) {
  await database.execute("PRAGMA foreign_keys = ON");
  await database.executeMultiple(SCHEMA);
  await database.execute("SELECT 1");
}

module.exports = {
  createDatabase,
  initializeDatabase,
};
