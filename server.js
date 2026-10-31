const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { DatabaseSync } = require("node:sqlite");

const scrypt = promisify(crypto.scrypt);
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const DATABASE_PATH = process.env.DB_PATH || path.join(__dirname, "data", "gym.sqlite");
const PUBLIC_DIRECTORY = path.join(__dirname, "public");
const SESSION_LENGTH_DAYS = 7;
const PASSWORD_LENGTH = 10;

function openDatabase(databasePath = DATABASE_PATH) {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA foreign_keys = ON;
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
  `);
  return database;
}

function todayInIndia() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseDate(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw httpError(400, `${label} must be a date in YYYY-MM-DD format.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw httpError(400, `${label} is not a valid date.`);
  }
  return value;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizePhone(phone) {
  return phone.replace(/\D/g, "");
}

function parseMoney(value, label = "Amount") {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || !/^\d+(\.\d{1,2})?$/.test(String(value))
    || !Number.isSafeInteger(Math.round(amount * 100))) {
    throw httpError(400, `${label} must be zero or a positive amount with up to two decimal places.`);
  }
  return Math.round(amount * 100);
}

function cleanText(value, label, { required = false, maxLength = 200 } = {}) {
  if (typeof value !== "string") {
    throw httpError(400, `${label} must be text.`);
  }
  const cleanValue = value.trim();
  if (required && !cleanValue) {
    throw httpError(400, `${label} is required.`);
  }
  if (cleanValue.length > maxLength) {
    throw httpError(400, `${label} must be ${maxLength} characters or fewer.`);
  }
  return cleanValue;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isUniqueConstraint(error) {
  return error.code === "SQLITE_CONSTRAINT_UNIQUE" || error.errcode === 2067 || error.errcode === 1555;
}

function sendJson(response, statusCode, data, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  response.end(JSON.stringify(data));
}

function parseCookies(request) {
  const cookies = {};
  for (const part of (request.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0) {
      cookies[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return cookies;
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) {
      throw httpError(413, "Request body is too large.");
    }
  }
  if (!body) {
    return {};
  }
  try {
    return JSON.parse(body);
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

function createApplication({ databasePath = DATABASE_PATH, publicDirectory = PUBLIC_DIRECTORY } = {}) {
  const database = openDatabase(databasePath);

  function recordAudit(userId, action, entityType, entityId, details = "") {
    database.prepare(`
      INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, action, entityType, entityId, details);
  }

  async function getCurrentUser(request) {
    const sessionToken = parseCookies(request).gym_session;
    if (!sessionToken) {
      return null;
    }
    const tokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");
    const user = database.prepare(`
      SELECT users.id, users.username, users.role
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > datetime('now')
        AND users.is_active = 1
    `).get(tokenHash);
    return user || null;
  }

  async function createSession(userId) {
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + SESSION_LENGTH_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);
    database.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .run(tokenHash, userId, expiresAt);
    return token;
  }

  function sessionCookie(token, request) {
    const secure = request.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
    return `gym_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_LENGTH_DAYS * 24 * 60 * 60}${secure}`;
  }

  function membershipStatus(membership, today = todayInIndia()) {
    if (membership.is_active === 0) {
      return "inactive";
    }
    if (membership.start_date > today) {
      return "upcoming";
    }
    if (membership.end_date < today) {
      return "expired";
    }
    if (membership.end_date <= addDays(today, 14)) {
      return "expiring";
    }
    return "active";
  }

  async function handleApi(request, response, url) {
    const { pathname } = url;
    const method = request.method;

    if (method === "GET" && pathname === "/api/setup-status") {
      const ownerExists = database.prepare("SELECT 1 FROM users LIMIT 1").get();
      return sendJson(response, 200, { needsSetup: !ownerExists });
    }

    if (method === "POST" && pathname === "/api/setup") {
      if (database.prepare("SELECT 1 FROM users LIMIT 1").get()) {
        throw httpError(409, "Initial setup has already been completed.");
      }
      const body = await readJson(request);
      const username = cleanText(body.username, "Username", { required: true, maxLength: 50 });
      const password = cleanText(body.password, "Password", { required: true, maxLength: 200 });
      if (password.length < PASSWORD_LENGTH) {
        throw httpError(400, `Password must be at least ${PASSWORD_LENGTH} characters.`);
      }
      const salt = crypto.randomBytes(16).toString("hex");
      const passwordHash = await scrypt(password, salt, 64);
      if (database.prepare("SELECT 1 FROM users LIMIT 1").get()) {
        throw httpError(409, "Initial setup has already been completed.");
      }
      const result = database.prepare(`
        INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'owner')
      `).run(username, `${salt}:${passwordHash.toString("hex")}`);
      recordAudit(Number(result.lastInsertRowid), "created", "user", Number(result.lastInsertRowid), "Initial owner account");
      return sendJson(response, 201, { message: "Owner account created. Please sign in." });
    }

    if (method === "POST" && pathname === "/api/login") {
      const body = await readJson(request);
      const username = cleanText(body.username, "Username", { required: true, maxLength: 50 });
      const password = cleanText(body.password, "Password", { required: true, maxLength: 200 });
      const user = database.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE AND is_active = 1").get(username);
      if (!user) {
        throw httpError(401, "The username or password is incorrect.");
      }
      const [salt, storedHash] = user.password_hash.split(":");
      const submittedHash = await scrypt(password, salt, 64);
      if (!crypto.timingSafeEqual(Buffer.from(storedHash, "hex"), submittedHash)) {
        throw httpError(401, "The username or password is incorrect.");
      }
      database.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
      const token = await createSession(user.id);
      recordAudit(user.id, "signed in", "user", user.id);
      return sendJson(response, 200, {
        user: { id: user.id, username: user.username, role: user.role },
      }, { "Set-Cookie": sessionCookie(token, request) });
    }

    if (method === "POST" && pathname === "/api/logout") {
      const currentUser = await getCurrentUser(request);
      const token = parseCookies(request).gym_session;
      if (token) {
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
      }
      if (currentUser) {
        recordAudit(currentUser.id, "signed out", "user", currentUser.id);
      }
      return sendJson(response, 200, { message: "Signed out." }, {
        "Set-Cookie": "gym_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      });
    }

    const user = await getCurrentUser(request);
    if (!user) {
      throw httpError(401, "Please sign in to continue.");
    }
    if (!pathname.startsWith("/api/")) {
      throw httpError(404, "API route not found.");
    }

    if (method !== "GET") {
      const requestOrigin = request.headers.origin;
      const host = request.headers.host;
      if (requestOrigin && host && new URL(requestOrigin).host !== host) {
        throw httpError(403, "This request did not come from this application.");
      }
    }

    if (method === "GET" && pathname === "/api/me") {
      return sendJson(response, 200, { user });
    }

    if (method === "POST" && pathname === "/api/backup") {
      if (user.role !== "owner") {
        throw httpError(403, "Only the owner can download a database backup.");
      }
      const filename = `goodform-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`;
      response.writeHead(200, {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      return response.end(Buffer.from(database.serialize()));
    }

    if (method === "POST" && pathname === "/api/users") {
      if (user.role !== "owner") {
        throw httpError(403, "Only the owner can create staff accounts.");
      }
      const body = await readJson(request);
      const username = cleanText(body.username, "Username", { required: true, maxLength: 50 });
      const password = cleanText(body.password, "Password", { required: true, maxLength: 200 });
      if (password.length < PASSWORD_LENGTH) {
        throw httpError(400, `Password must be at least ${PASSWORD_LENGTH} characters.`);
      }
      const salt = crypto.randomBytes(16).toString("hex");
      const passwordHash = await scrypt(password, salt, 64);
      let result;
      try {
        result = database.prepare(`
          INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'staff')
        `).run(username, `${salt}:${passwordHash.toString("hex")}`);
      } catch (error) {
        if (isUniqueConstraint(error)) {
          throw httpError(409, "That username is already in use.");
        }
        throw error;
      }
      const id = Number(result.lastInsertRowid);
      recordAudit(user.id, "created", "user", id, `Created staff account ${username}`);
      return sendJson(response, 201, { id, username, role: "staff" });
    }

    if (method === "GET" && pathname === "/api/users") {
      if (user.role !== "owner") {
        throw httpError(403, "Only the owner can manage staff accounts.");
      }
      const users = database.prepare(`
        SELECT id, username, role, is_active, created_at
        FROM users ORDER BY role, username COLLATE NOCASE
      `).all();
      return sendJson(response, 200, { users });
    }

    const userMatch = pathname.match(/^\/api\/users\/(\d+)$/);
    if (method === "PATCH" && userMatch) {
      if (user.role !== "owner") {
        throw httpError(403, "Only the owner can manage staff accounts.");
      }
      const targetId = Number(userMatch[1]);
      const target = database.prepare("SELECT id, username, role, is_active FROM users WHERE id = ?").get(targetId);
      if (!target) {
        throw httpError(404, "User account not found.");
      }
      if (target.role === "owner") {
        throw httpError(400, "The owner account cannot be changed here.");
      }
      const body = await readJson(request);
      if (Object.hasOwn(body, "isActive")) {
        const isActive = body.isActive ? 1 : 0;
        database.prepare("UPDATE users SET is_active = ? WHERE id = ?").run(isActive, targetId);
        if (!isActive) {
          database.prepare("DELETE FROM sessions WHERE user_id = ?").run(targetId);
        }
        recordAudit(user.id, isActive ? "activated" : "deactivated", "user", targetId, target.username);
      }
      if (Object.hasOwn(body, "password")) {
        const password = cleanText(body.password, "Password", { required: true, maxLength: 200 });
        if (password.length < PASSWORD_LENGTH) {
          throw httpError(400, `Password must be at least ${PASSWORD_LENGTH} characters.`);
        }
        const salt = crypto.randomBytes(16).toString("hex");
        const passwordHash = await scrypt(password, salt, 64);
        database.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
          .run(`${salt}:${passwordHash.toString("hex")}`, targetId);
        database.prepare("DELETE FROM sessions WHERE user_id = ?").run(targetId);
        recordAudit(user.id, "reset password for", "user", targetId, target.username);
      }
      if (!Object.hasOwn(body, "isActive") && !Object.hasOwn(body, "password")) {
        throw httpError(400, "Provide a new password or an active status.");
      }
      return sendJson(response, 200, { message: "Staff account updated." });
    }

    if (method === "GET" && pathname === "/api/dashboard") {
      const today = todayInIndia();
      const currentMemberships = database.prepare(`
        SELECT memberships.start_date, memberships.end_date
        FROM members
        LEFT JOIN memberships ON memberships.id = (
          SELECT id FROM memberships AS latest
          WHERE latest.member_id = members.id
          ORDER BY CASE
            WHEN latest.start_date <= ? AND latest.end_date >= ? THEN 0
            WHEN latest.start_date > ? THEN 1
            ELSE 2
          END, latest.start_date DESC, latest.id DESC LIMIT 1
        )
        WHERE members.is_active = 1
      `).all(today, today, today).filter((membership) => membership.end_date);
      const summary = {
        active_members: Number(database.prepare("SELECT COUNT(*) AS count FROM members WHERE is_active = 1").get().count),
        expiring_members: currentMemberships.filter((membership) =>
          membership.start_date <= today && membership.end_date >= today
            && membership.end_date <= addDays(today, 14)).length,
        expired_members: currentMemberships.filter((membership) => membership.end_date < today).length,
        today_revenue: database.prepare(`
          SELECT COALESCE(SUM(amount_paise), 0) AS total
          FROM payments WHERE payment_date = ?
        `).get(today).total,
      };
      const upcoming = database.prepare(`
        SELECT memberships.id AS membership_id, members.id AS member_id,
          members.name, members.phone, members.sms_consent, members.whatsapp_consent,
          memberships.plan_name, memberships.start_date, memberships.end_date
        FROM memberships JOIN members ON members.id = memberships.member_id
        WHERE members.is_active = 1 AND memberships.start_date <= ?
          AND memberships.id = (
            SELECT id FROM memberships AS latest
            WHERE latest.member_id = members.id
            ORDER BY CASE
              WHEN latest.start_date <= ? AND latest.end_date >= ? THEN 0
              WHEN latest.start_date > ? THEN 1
              ELSE 2
            END, latest.start_date DESC, latest.id DESC LIMIT 1
          ) AND memberships.end_date <= ?
        ORDER BY memberships.end_date ASC LIMIT 20
      `).all(today, today, today, today, addDays(today, 14));
      const reminders = database.prepare(`
        SELECT reminders.id, reminders.channel, reminders.status, reminders.created_at,
          members.name AS member_name, plans.name AS plan_name
        FROM reminders
        JOIN memberships ON memberships.id = reminders.membership_id
        JOIN members ON members.id = memberships.member_id
        LEFT JOIN plans ON plans.id = memberships.plan_id
        ORDER BY reminders.created_at DESC LIMIT 10
      `).all();
      return sendJson(response, 200, {
        today,
        summary,
        upcoming: upcoming.map((membership) => ({
          ...membership,
          status: membershipStatus(membership, today),
        })),
        reminders,
      });
    }

    if (method === "GET" && pathname === "/api/members") {
      const search = (url.searchParams.get("search") || "").trim();
      const today = todayInIndia();
      const members = database.prepare(`
        SELECT members.id, members.name, members.phone, members.email, members.is_active,
          memberships.plan_name, memberships.start_date, memberships.end_date,
          memberships.id AS membership_id
        FROM members
        LEFT JOIN memberships ON memberships.id = (
          SELECT id FROM memberships AS latest
          WHERE latest.member_id = members.id
          ORDER BY CASE
            WHEN latest.start_date <= ? AND latest.end_date >= ? THEN 0
            WHEN latest.start_date > ? THEN 1
            ELSE 2
          END, latest.start_date DESC, latest.id DESC LIMIT 1
        )
        WHERE (? = '' OR members.name LIKE ? OR members.phone LIKE ?)
        ORDER BY members.is_active DESC, members.name COLLATE NOCASE
        LIMIT 200
      `).all(today, today, today, search, `%${search}%`, `%${search}%`);
      return sendJson(response, 200, {
        members: members.map((member) => ({
          ...member,
          status: !member.is_active ? "inactive" : member.end_date
            ? membershipStatus(member, today)
            : "no membership",
        })),
      });
    }

    const memberMatch = pathname.match(/^\/api\/members\/(\d+)$/);
    if (method === "GET" && memberMatch) {
      const memberId = Number(memberMatch[1]);
      const member = database.prepare("SELECT * FROM members WHERE id = ?").get(memberId);
      if (!member) {
        throw httpError(404, "Member not found.");
      }
      const memberships = database.prepare(`
        SELECT memberships.*,
          COALESCE(SUM(payments.amount_paise), 0) AS paid_paise
        FROM memberships LEFT JOIN payments ON payments.membership_id = memberships.id
        WHERE memberships.member_id = ?
        GROUP BY memberships.id
        ORDER BY memberships.start_date DESC, memberships.id DESC
      `).all(memberId);
      const payments = database.prepare(`
        SELECT payments.id, payments.amount_paise, payments.payment_date, payments.method,
          payments.reference, users.username AS recorded_by, memberships.plan_name
        FROM payments
        JOIN memberships ON memberships.id = payments.membership_id
        JOIN users ON users.id = payments.recorded_by
        WHERE memberships.member_id = ?
        ORDER BY payments.payment_date DESC, payments.id DESC
      `).all(memberId);
      const today = todayInIndia();
      return sendJson(response, 200, {
        member,
        memberships: memberships.map((membership) => ({
          ...membership,
          balance_paise: Math.max(0, membership.price_paise - membership.paid_paise),
          status: membershipStatus(membership, today),
        })),
        payments,
      });
    }

    if (method === "POST" && pathname === "/api/members") {
      const body = await readJson(request);
      const name = cleanText(body.name, "Name", { required: true, maxLength: 100 });
      const phone = cleanText(body.phone, "Phone number", { required: true, maxLength: 30 });
      const normalizedPhone = normalizePhone(phone);
      if (normalizedPhone.length < 7 || normalizedPhone.length > 15) {
        throw httpError(400, "Enter a phone number containing 7 to 15 digits.");
      }
      const email = cleanText(body.email || "", "Email", { maxLength: 254 });
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw httpError(400, "Enter a valid email address.");
      }
      const notes = cleanText(body.notes || "", "Notes", { maxLength: 2000 });
      let membership = null;
      if (body.membership !== undefined && body.membership !== null) {
        if (typeof body.membership !== "object" || Array.isArray(body.membership)) {
          throw httpError(400, "Membership details must be an object.");
        }
        const planId = Number(body.membership.planId);
        if (!Number.isInteger(planId) || planId < 1) {
          throw httpError(400, "Choose one active membership plan.");
        }
        const plan = database.prepare("SELECT * FROM plans WHERE id = ? AND is_active = 1").get(planId);
        if (!plan) {
          throw httpError(400, "Choose one active membership plan.");
        }
        const startDate = parseDate(body.membership.startDate, "Membership start date");
        membership = {
          plan,
          startDate,
          endDate: addDays(startDate, plan.duration_days - 1),
        };
      }

      let payment = null;
      if (body.payment !== undefined && body.payment !== null) {
        if (!membership) {
          throw httpError(400, "Add a membership before recording its payment.");
        }
        if (typeof body.payment !== "object" || Array.isArray(body.payment)) {
          throw httpError(400, "Payment details must be an object.");
        }
        const amountPaise = parseMoney(body.payment.amount, "Payment amount");
        if (amountPaise === 0) {
          throw httpError(400, "Payment amount must be greater than zero.");
        }
        const paymentDate = parseDate(body.payment.paymentDate, "Payment date");
        const methodOptions = ["cash", "card", "bank_transfer", "upi", "other"];
        if (!methodOptions.includes(body.payment.method)) {
          throw httpError(400, "Choose a valid payment method.");
        }
        payment = {
          amountPaise,
          paymentDate,
          method: body.payment.method,
          reference: cleanText(body.payment.reference || "", "Reference", { maxLength: 100 }),
        };
      }

      database.exec("BEGIN IMMEDIATE");
      try {
        const result = database.prepare(`
          INSERT INTO members (name, phone, normalized_phone, email, notes, sms_consent, whatsapp_consent)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(name, phone, normalizedPhone, email, notes, body.smsConsent ? 1 : 0, body.whatsappConsent ? 1 : 0);
        const id = Number(result.lastInsertRowid);
        recordAudit(user.id, "created", "member", id, name);
        let membershipId = null;
        if (membership) {
          const membershipResult = database.prepare(`
            INSERT INTO memberships (member_id, plan_id, plan_name, price_paise, start_date, end_date, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            membership.plan.id,
            membership.plan.name,
            membership.plan.price_paise,
            membership.startDate,
            membership.endDate,
            user.id,
          );
          membershipId = Number(membershipResult.lastInsertRowid);
          recordAudit(
            user.id,
            "created",
            "membership",
            membershipId,
            `${membership.plan.name}: ${membership.startDate} to ${membership.endDate}`,
          );
        }
        let paymentId = null;
        if (payment && membershipId) {
          const paymentResult = database.prepare(`
            INSERT INTO payments (membership_id, amount_paise, payment_date, method, reference, recorded_by)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            membershipId,
            payment.amountPaise,
            payment.paymentDate,
            payment.method,
            payment.reference,
            user.id,
          );
          paymentId = Number(paymentResult.lastInsertRowid);
          recordAudit(user.id, "recorded", "payment", paymentId, `${payment.amountPaise} paise, ${payment.method}`);
        }
        database.exec("COMMIT");
        return sendJson(response, 201, {
          id,
          name,
          membership: membership ? {
            id: membershipId,
            planName: membership.plan.name,
            startDate: membership.startDate,
            endDate: membership.endDate,
          } : null,
          paymentId,
        });
      } catch (error) {
        database.exec("ROLLBACK");
        if (isUniqueConstraint(error)) {
          throw httpError(409, "A member with this phone number already exists. Search for them before creating another record.");
        }
        throw error;
      }
    }

    if (method === "PATCH" && memberMatch) {
      const memberId = Number(memberMatch[1]);
      if (!database.prepare("SELECT id FROM members WHERE id = ?").get(memberId)) {
        throw httpError(404, "Member not found.");
      }
      const body = await readJson(request);
      const fields = [];
      const values = [];
      for (const [field, label, maxLength] of [
        ["name", "Name", 100],
        ["email", "Email", 254],
        ["notes", "Notes", 2000],
      ]) {
        if (Object.hasOwn(body, field)) {
          const value = cleanText(body[field], label, { required: field === "name", maxLength });
          if (field === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            throw httpError(400, "Enter a valid email address.");
          }
          fields.push(`${field} = ?`);
          values.push(value);
        }
      }
      if (Object.hasOwn(body, "phone")) {
        const phone = cleanText(body.phone, "Phone number", { required: true, maxLength: 30 });
        const normalizedPhone = normalizePhone(phone);
        if (normalizedPhone.length < 7 || normalizedPhone.length > 15) {
          throw httpError(400, "Enter a phone number containing 7 to 15 digits.");
        }
        fields.push("phone = ?", "normalized_phone = ?");
        values.push(phone, normalizedPhone);
      }
      for (const [field, column] of [["smsConsent", "sms_consent"], ["whatsappConsent", "whatsapp_consent"]]) {
        if (Object.hasOwn(body, field)) {
          fields.push(`${column} = ?`);
          values.push(body[field] ? 1 : 0);
        }
      }
      if (Object.hasOwn(body, "isActive")) {
        fields.push("is_active = ?");
        values.push(body.isActive ? 1 : 0);
      }
      if (fields.length === 0) {
        throw httpError(400, "No member changes were provided.");
      }
      try {
        database.prepare(`UPDATE members SET ${fields.join(", ")} WHERE id = ?`).run(...values, memberId);
      } catch (error) {
        if (isUniqueConstraint(error)) {
          throw httpError(409, "A member with this phone number already exists.");
        }
        throw error;
      }
      recordAudit(user.id, "updated", "member", memberId);
      return sendJson(response, 200, { message: "Member updated." });
    }

    if (method === "GET" && pathname === "/api/plans") {
      const plans = database.prepare(`
        SELECT id, name, duration_days, price_paise, is_active FROM plans
        ORDER BY is_active DESC, name COLLATE NOCASE
      `).all();
      return sendJson(response, 200, { plans });
    }

    if (method === "POST" && pathname === "/api/plans") {
      if (user.role !== "owner") {
        throw httpError(403, "Only the owner can manage membership plans.");
      }
      const body = await readJson(request);
      const name = cleanText(body.name, "Plan name", { required: true, maxLength: 80 });
      const durationDays = Number(body.durationDays);
      if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
        throw httpError(400, "Plan duration must be from 1 to 3650 days.");
      }
      const pricePaise = parseMoney(body.price, "Plan price");
      const result = database.prepare(`
        INSERT INTO plans (name, duration_days, price_paise) VALUES (?, ?, ?)
      `).run(name, durationDays, pricePaise);
      const id = Number(result.lastInsertRowid);
      recordAudit(user.id, "created", "plan", id, name);
      return sendJson(response, 201, { id, name });
    }

    const planMatch = pathname.match(/^\/api\/plans\/(\d+)$/);
    if (method === "PATCH" && planMatch) {
      if (user.role !== "owner") {
        throw httpError(403, "Only the owner can manage membership plans.");
      }
      const planId = Number(planMatch[1]);
      const body = await readJson(request);
      const plan = database.prepare("SELECT * FROM plans WHERE id = ?").get(planId);
      if (!plan) {
        throw httpError(404, "Plan not found.");
      }
      const name = Object.hasOwn(body, "name")
        ? cleanText(body.name, "Plan name", { required: true, maxLength: 80 })
        : plan.name;
      const durationDays = Object.hasOwn(body, "durationDays") ? Number(body.durationDays) : plan.duration_days;
      if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) {
        throw httpError(400, "Plan duration must be from 1 to 3650 days.");
      }
      const pricePaise = Object.hasOwn(body, "price") ? parseMoney(body.price, "Plan price") : plan.price_paise;
      const isActive = Object.hasOwn(body, "isActive") ? (body.isActive ? 1 : 0) : plan.is_active;
      database.prepare(`
        UPDATE plans SET name = ?, duration_days = ?, price_paise = ?, is_active = ? WHERE id = ?
      `).run(name, durationDays, pricePaise, isActive, planId);
      recordAudit(user.id, "updated", "plan", planId, name);
      return sendJson(response, 200, { message: "Plan updated." });
    }

    if (method === "GET" && pathname === "/api/memberships") {
      const memberships = database.prepare(`
        SELECT memberships.id, memberships.member_id, memberships.plan_name,
          memberships.start_date, memberships.end_date, memberships.price_paise,
          members.name AS member_name, members.is_active AS member_is_active
        FROM memberships JOIN members ON members.id = memberships.member_id
        WHERE members.is_active = 1
        ORDER BY memberships.start_date DESC, memberships.id DESC
      `).all();
      return sendJson(response, 200, { memberships });
    }

    if (method === "POST" && pathname === "/api/memberships") {
      const body = await readJson(request);
      const memberId = Number(body.memberId);
      const planId = Number(body.planId);
      const startDate = parseDate(body.startDate, "Start date");
      const member = database.prepare("SELECT id, is_active FROM members WHERE id = ?").get(memberId);
      if (!member || !member.is_active) {
        throw httpError(404, "Choose an active member.");
      }
      const plan = database.prepare("SELECT * FROM plans WHERE id = ? AND is_active = 1").get(planId);
      if (!plan) {
        throw httpError(400, "Choose an active membership plan.");
      }
      const endDate = addDays(startDate, plan.duration_days - 1);
      const result = database.prepare(`
        INSERT INTO memberships (member_id, plan_id, plan_name, price_paise, start_date, end_date, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(memberId, plan.id, plan.name, plan.price_paise, startDate, endDate, user.id);
      const id = Number(result.lastInsertRowid);
      recordAudit(user.id, "created", "membership", id, `${plan.name}: ${startDate} to ${endDate}`);
      return sendJson(response, 201, { id, startDate, endDate, planName: plan.name });
    }

    if (method === "POST" && pathname === "/api/payments") {
      const body = await readJson(request);
      const membershipId = Number(body.membershipId);
      const membership = database.prepare(`
        SELECT memberships.id, memberships.member_id, memberships.price_paise,
          members.is_active
        FROM memberships JOIN members ON members.id = memberships.member_id
        WHERE memberships.id = ?
      `).get(membershipId);
      if (!membership || !membership.is_active) {
        throw httpError(404, "Choose a membership for an active member.");
      }
      const amountPaise = parseMoney(body.amount, "Payment amount");
      if (amountPaise === 0) {
        throw httpError(400, "Payment amount must be greater than zero.");
      }
      const paymentDate = parseDate(body.paymentDate, "Payment date");
      const methodOptions = ["cash", "card", "bank_transfer", "upi", "other"];
      if (!methodOptions.includes(body.method)) {
        throw httpError(400, "Choose a valid payment method.");
      }
      const reference = cleanText(body.reference || "", "Reference", { maxLength: 100 });
      const result = database.prepare(`
        INSERT INTO payments (membership_id, amount_paise, payment_date, method, reference, recorded_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(membershipId, amountPaise, paymentDate, body.method, reference, user.id);
      const id = Number(result.lastInsertRowid);
      recordAudit(user.id, "recorded", "payment", id, `${amountPaise} paise, ${body.method}`);
      return sendJson(response, 201, { id, amountPaise });
    }

    if (method === "GET" && pathname === "/api/reports") {
      const from = parseDate(url.searchParams.get("from"), "From date");
      const to = parseDate(url.searchParams.get("to"), "To date");
      if (from > to) {
        throw httpError(400, "From date must be on or before the to date.");
      }
      const revenue = database.prepare(`
        SELECT payment_date, SUM(amount_paise) AS amount_paise, COUNT(*) AS payment_count
        FROM payments
        WHERE payment_date BETWEEN ? AND ?
        GROUP BY payment_date ORDER BY payment_date
      `).all(from, to);
      const summary = database.prepare(`
        SELECT COALESCE(SUM(amount_paise), 0) AS total_paise, COUNT(*) AS payment_count
        FROM payments WHERE payment_date BETWEEN ? AND ?
      `).get(from, to);
      const today = todayInIndia();
      const memberships = database.prepare(`
        SELECT members.id AS member_id, members.name, members.phone,
          memberships.plan_name, memberships.start_date, memberships.end_date,
          members.is_active
        FROM memberships JOIN members ON members.id = memberships.member_id
        WHERE memberships.id = (
          SELECT id FROM memberships AS latest
          WHERE latest.member_id = members.id
          ORDER BY CASE
            WHEN latest.start_date <= ? AND latest.end_date >= ? THEN 0
            WHEN latest.start_date > ? THEN 1
            ELSE 2
          END, latest.start_date DESC, latest.id DESC LIMIT 1
        )
        ORDER BY memberships.end_date
      `).all(today, today, today);
      const statuses = memberships.map((membership) => ({
        ...membership,
        status: membershipStatus(membership, today),
      }));
      return sendJson(response, 200, {
        from,
        to,
        revenue,
        summary,
        membershipStatuses: statuses,
      });
    }

    const reminderMatch = pathname.match(/^\/api\/reminders\/(\d+)$/);
    if (method === "POST" && pathname === "/api/reminders") {
      const body = await readJson(request);
      const membershipId = Number(body.membershipId);
      if (!["sms", "whatsapp"].includes(body.channel)) {
        throw httpError(400, "Choose SMS or WhatsApp.");
      }
      const member = database.prepare(`
        SELECT members.id, members.name, members.phone, members.sms_consent,
          members.whatsapp_consent, memberships.id AS membership_id,
          memberships.plan_name, memberships.end_date
        FROM memberships JOIN members ON members.id = memberships.member_id
        WHERE memberships.id = ? AND members.is_active = 1
      `).get(membershipId);
      if (!member) {
        throw httpError(404, "Membership not found.");
      }
      const hasConsent = body.channel === "sms" ? member.sms_consent : member.whatsapp_consent;
      if (!hasConsent) {
        throw httpError(400, `The member has not consented to ${body.channel} reminders.`);
      }
      const message = `Hi ${member.name}, your ${member.plan_name} gym membership ends on ${member.end_date}. Please contact us if you would like to renew.`;
      const result = database.prepare(`
        INSERT INTO reminders (membership_id, channel, status, message, created_by)
        VALUES (?, ?, 'prepared', ?, ?)
      `).run(membershipId, body.channel, message, user.id);
      const id = Number(result.lastInsertRowid);
      recordAudit(user.id, "prepared", "reminder", id, body.channel);
      const digits = normalizePhone(member.phone);
      const whatsappNumber = digits.length === 10
        ? `91${digits}`
        : digits.length === 11 && digits.startsWith("0")
          ? `91${digits.slice(1)}`
          : digits;
      const reminderUrl = body.channel === "whatsapp"
        ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
        : `sms:${encodeURIComponent(member.phone)}?body=${encodeURIComponent(message)}`;
      return sendJson(response, 201, {
        id,
        channel: body.channel,
        status: "prepared",
        message,
        url: reminderUrl,
      });
    }

    if (method === "PATCH" && reminderMatch) {
      const reminderId = Number(reminderMatch[1]);
      const body = await readJson(request);
      if (!["sent", "failed"].includes(body.status)) {
        throw httpError(400, "Reminder status must be sent or failed.");
      }
      const note = cleanText(body.note || "", "Outcome note", { maxLength: 300 });
      const reminder = database.prepare("SELECT id, status FROM reminders WHERE id = ?").get(reminderId);
      if (!reminder) {
        throw httpError(404, "Reminder not found.");
      }
      if (reminder.status !== "prepared") {
        throw httpError(409, "This reminder already has an outcome recorded.");
      }
      database.prepare(`
        UPDATE reminders SET status = ?, outcome_note = ?, updated_at = datetime('now') WHERE id = ?
      `).run(body.status, note, reminderId);
      recordAudit(user.id, body.status, "reminder", reminderId, note);
      return sendJson(response, 200, { message: "Reminder outcome recorded." });
    }

    if (method === "GET" && pathname === "/api/audit") {
      if (user.role !== "owner") {
        throw httpError(403, "Only the owner can view the audit log.");
      }
      const entries = database.prepare(`
        SELECT audit_log.id, audit_log.action, audit_log.entity_type, audit_log.entity_id,
          audit_log.details, audit_log.created_at, users.username
        FROM audit_log LEFT JOIN users ON users.id = audit_log.user_id
        ORDER BY audit_log.id DESC LIMIT 100
      `).all();
      return sendJson(response, 200, { entries });
    }

    throw httpError(404, "API route not found.");
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi(request, response, url);
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        throw httpError(405, "This method is not supported.");
      }
      const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const filePath = path.resolve(publicDirectory, `.${requestedPath}`);
      if (!filePath.startsWith(`${path.resolve(publicDirectory)}${path.sep}`)) {
        throw httpError(403, "This file is not available.");
      }
      const file = await fs.promises.readFile(filePath);
      const contentTypes = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".svg": "image/svg+xml",
      };
      response.writeHead(200, {
        "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
      });
      response.end(request.method === "HEAD" ? undefined : file);
    } catch (error) {
      const statusCode = error.statusCode || (error.code === "ENOENT" ? 404 : 500);
      if (statusCode === 500) {
        console.error(error);
      }
      if (!response.headersSent) {
        sendJson(response, statusCode, {
          error: statusCode === 500 ? "The server could not complete this request." : error.message,
        });
      } else {
        response.destroy();
      }
    }
  });

  return {
    server,
    database,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          database.close();
          resolve();
        });
      });
    },
  };
}

if (require.main === module) {
  const app = createApplication();
  app.server.listen(PORT, HOST, () => {
    console.log(`Gym Member Manager is running at http://localhost:${PORT}`);
    console.log("The SQLite database is stored in the data folder.");
  });
}

module.exports = {
  addDays,
  createApplication,
  normalizePhone,
  parseDate,
};
