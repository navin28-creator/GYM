const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { createApplication } = require("../server");

async function request(baseUrl, route, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  return { response, data };
}

test("owner and staff can complete member, membership, payment, reminder, and reporting workflows", async (t) => {
  const app = createApplication({ databasePath: ":memory:" });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.close());
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  let result = await request(baseUrl, "/api/setup-status");
  assert.equal(result.data.needsSetup, true);

  result = await request(baseUrl, "/api/setup", {
    method: "POST",
    body: { username: "owner", password: "a-secure-owner-password" },
  });
  assert.equal(result.response.status, 201);

  result = await request(baseUrl, "/api/login", {
    method: "POST",
    body: { username: "owner", password: "incorrect-password" },
  });
  assert.equal(result.response.status, 401);

  result = await request(baseUrl, "/api/login", {
    method: "POST",
    body: { username: "owner", password: "a-secure-owner-password" },
  });
  assert.equal(result.response.status, 200);
  const ownerCookie = result.response.headers.get("set-cookie").split(";")[0];

  result = await request(baseUrl, "/api/plans", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Monthly", durationDays: 30, price: "1200.50" },
  });
  assert.equal(result.response.status, 201);
  const planId = result.data.id;

  result = await request(baseUrl, "/api/members", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      name: "Aanya Sharma",
      phone: "+91 98765 43210",
      email: "aanya@example.test",
      smsConsent: true,
      whatsappConsent: true,
    },
  });
  assert.equal(result.response.status, 201);
  const memberId = result.data.id;

  result = await request(baseUrl, "/api/members", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      name: "Two plans",
      phone: "919876543211",
      membership: { planId: [planId, planId + 1], startDate: "2026-10-01" },
    },
  });
  assert.equal(result.response.status, 400);

  result = await request(baseUrl, "/api/members", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Duplicate", phone: "919876543210" },
  });
  assert.equal(result.response.status, 409);

  result = await request(baseUrl, "/api/members", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      name: "Rollback Check",
      phone: "919876543212",
      membership: { planId, startDate: "2026-10-01" },
      payment: {
        amount: "not-an-amount",
        paymentDate: "2026-10-02",
        method: "upi",
      },
    },
  });
  assert.equal(result.response.status, 400);
  result = await request(baseUrl, "/api/members?search=Rollback", { cookie: ownerCookie });
  assert.equal(result.data.members.length, 0);

  result = await request(baseUrl, "/api/members", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      name: "Kiran Patel",
      phone: "919876543211",
      membership: { planId, startDate: "2026-10-01" },
      payment: {
        amount: "300.25",
        paymentDate: "2026-10-02",
        method: "upi",
        reference: "initial-payment",
      },
    },
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.membership.planName, "Monthly");
  assert.equal(result.data.membership.endDate, "2026-10-30");
  assert.ok(result.data.paymentId);

  result = await request(baseUrl, "/api/members?search=Kiran", { cookie: ownerCookie });
  const createdMember = result.data.members[0];
  assert.equal(createdMember.name, "Kiran Patel");
  result = await request(baseUrl, `/api/members/${createdMember.id}`, { cookie: ownerCookie });
  assert.equal(result.data.memberships.length, 1);
  assert.equal(result.data.memberships[0].paid_paise, 30025);
  assert.equal(result.data.payments[0].reference, "initial-payment");

  result = await request(baseUrl, "/api/memberships", {
    method: "POST",
    cookie: ownerCookie,
    body: { memberId, planId, startDate: "2026-10-01" },
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.endDate, "2026-10-30");
  const membershipId = result.data.id;

  result = await request(baseUrl, "/api/payments", {
    method: "POST",
    cookie: ownerCookie,
    body: {
      membershipId,
      amount: "850.50",
      paymentDate: "2026-10-10",
      method: "upi",
      reference: "receipt-01",
    },
  });
  assert.equal(result.response.status, 201);

  result = await request(baseUrl, `/api/members/${memberId}`, { cookie: ownerCookie });
  assert.equal(result.data.memberships[0].paid_paise, 85050);
  assert.equal(result.data.memberships[0].balance_paise, 35000);
  assert.equal(result.data.payments[0].reference, "receipt-01");

  result = await request(baseUrl, "/api/reports?from=2026-10-01&to=2026-10-31", { cookie: ownerCookie });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.summary.total_paise, 115075);
  assert.ok(result.data.membershipStatuses.some((member) => member.name === "Aanya Sharma"));

  result = await request(baseUrl, "/api/reminders", {
    method: "POST",
    cookie: ownerCookie,
    body: { membershipId, channel: "whatsapp" },
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.status, "prepared");
  assert.match(result.data.url, /^https:\/\/wa\.me\//);

  result = await request(baseUrl, `/api/reminders/${result.data.id}`, {
    method: "PATCH",
    cookie: ownerCookie,
    body: { status: "sent", note: "Staff confirmed sending" },
  });
  assert.equal(result.response.status, 200);

  result = await request(baseUrl, "/api/users", {
    method: "POST",
    cookie: ownerCookie,
    body: { username: "frontdesk", password: "a-secure-staff-password" },
  });
  assert.equal(result.response.status, 201);
  const staffId = result.data.id;

  result = await request(baseUrl, "/api/users", { cookie: ownerCookie });
  assert.equal(result.data.users.filter((user) => user.role === "staff").length, 1);

  result = await request(baseUrl, "/api/login", {
    method: "POST",
    body: { username: "frontdesk", password: "a-secure-staff-password" },
  });
  assert.equal(result.response.status, 200);
  const staffCookie = result.response.headers.get("set-cookie").split(";")[0];

  result = await request(baseUrl, "/api/plans", {
    method: "POST",
    cookie: staffCookie,
    body: { name: "Unauthorized plan", durationDays: 30, price: "50" },
  });
  assert.equal(result.response.status, 403);

  result = await request(baseUrl, "/api/users", { cookie: staffCookie });
  assert.equal(result.response.status, 403);

  result = await request(baseUrl, `/api/users/${staffId}`, {
    method: "PATCH",
    cookie: ownerCookie,
    body: { isActive: false },
  });
  assert.equal(result.response.status, 200);

  result = await request(baseUrl, "/api/me", { cookie: staffCookie });
  assert.equal(result.response.status, 401);

  result = await request(baseUrl, "/api/audit", { cookie: ownerCookie });
  assert.equal(result.response.status, 200);
  assert.ok(result.data.entries.some((entry) => entry.entity_type === "payment"));
});

test("API rejects invalid dates, weak setup passwords, and unconsented reminders", async (t) => {
  const app = createApplication({ databasePath: ":memory:" });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.close());
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  let result = await request(baseUrl, "/api/setup", {
    method: "POST",
    body: { username: "owner", password: "short" },
  });
  assert.equal(result.response.status, 400);

  await request(baseUrl, "/api/setup", {
    method: "POST",
    body: { username: "owner", password: "a-secure-owner-password" },
  });
  result = await request(baseUrl, "/api/login", {
    method: "POST",
    body: { username: "owner", password: "a-secure-owner-password" },
  });
  const ownerCookie = result.response.headers.get("set-cookie").split(";")[0];

  result = await request(baseUrl, "/api/plans", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Monthly", durationDays: 30, price: "500" },
  });
  const planId = result.data.id;
  result = await request(baseUrl, "/api/members", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Ravi", phone: "9876543210" },
  });
  const memberId = result.data.id;

  result = await request(baseUrl, "/api/memberships", {
    method: "POST",
    cookie: ownerCookie,
    body: { memberId, planId, startDate: "2026-02-30" },
  });
  assert.equal(result.response.status, 400);

  result = await request(baseUrl, "/api/memberships", {
    method: "POST",
    cookie: ownerCookie,
    body: { memberId, planId, startDate: "2026-10-01" },
  });
  const membershipId = result.data.id;
  result = await request(baseUrl, "/api/reminders", {
    method: "POST",
    cookie: ownerCookie,
    body: { membershipId, channel: "sms" },
  });
  assert.equal(result.response.status, 400);
});

test("only the owner can download a restorable SQLite database backup", async (t) => {
  const app = createApplication({ databasePath: ":memory:" });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.close());
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

  await request(baseUrl, "/api/setup", {
    method: "POST",
    body: { username: "owner", password: "a-secure-owner-password" },
  });
  let result = await request(baseUrl, "/api/login", {
    method: "POST",
    body: { username: "owner", password: "a-secure-owner-password" },
  });
  const ownerCookie = result.response.headers.get("set-cookie").split(";")[0];

  await request(baseUrl, "/api/members", {
    method: "POST",
    cookie: ownerCookie,
    body: { name: "Backup Member", phone: "9876543210" },
  });
  await request(baseUrl, "/api/users", {
    method: "POST",
    cookie: ownerCookie,
    body: { username: "frontdesk", password: "a-secure-staff-password" },
  });
  result = await request(baseUrl, "/api/login", {
    method: "POST",
    body: { username: "frontdesk", password: "a-secure-staff-password" },
  });
  const staffCookie = result.response.headers.get("set-cookie").split(";")[0];

  result = await request(baseUrl, "/api/backup", { method: "POST", cookie: staffCookie });
  assert.equal(result.response.status, 403);

  const response = await fetch(`${baseUrl}/api/backup`, {
    method: "POST",
    headers: { Cookie: ownerCookie },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition"), /^attachment; filename="goodform-backup-.*\.sqlite"$/);
  const backup = new DatabaseSync(":memory:");
  try {
    backup.deserialize(Buffer.from(await response.arrayBuffer()));
    assert.equal(backup.prepare("SELECT name FROM members").get().name, "Backup Member");
  } finally {
    backup.close();
  }
});
