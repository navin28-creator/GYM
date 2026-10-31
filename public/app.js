const authScreen = document.querySelector("#auth-screen");
const authForm = document.querySelector("#auth-form");
const authTitle = document.querySelector("#auth-title");
const authDescription = document.querySelector("#auth-description");
const authSubmit = document.querySelector("#auth-submit");
const authError = document.querySelector("#auth-error");
const passwordHint = document.querySelector("#password-hint");
const appShell = document.querySelector("#app-shell");
const pageContent = document.querySelector("#page-content");
const modalBackdrop = document.querySelector("#modal-backdrop");
const modalContent = document.querySelector("#modal-content");
const toastElement = document.querySelector("#toast");

const pageNames = {
  dashboard: "Overview",
  members: "Members",
  plans: "Membership plans",
  reports: "Reports",
  team: "Staff accounts",
  audit: "Activity log",
  backups: "Backups",
};

const state = {
  user: null,
  page: "dashboard",
  members: [],
  plans: [],
  dashboard: null,
  toastTimer: null,
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatMoney(paise) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(paise || 0) / 100);
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`));
}

function todayString() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function showToast(message, isError = false) {
  toastElement.textContent = message;
  toastElement.classList.toggle("error", isError);
  toastElement.classList.add("visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toastElement.classList.remove("visible"), 3200);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !["/api/login", "/api/setup"].includes(url)) {
      showAuth(false);
    }
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}

function showAuth(needsSetup) {
  authScreen.hidden = false;
  appShell.hidden = true;
  authError.hidden = true;
  authForm.reset();
  authTitle.textContent = needsSetup ? "Set up your gym" : "Welcome back";
  authDescription.textContent = needsSetup
    ? "Create your owner account to get started. Your password must have at least 10 characters."
    : "Sign in to manage your gym.";
  authSubmit.textContent = needsSetup ? "Create owner account" : "Sign in";
  passwordHint.hidden = !needsSetup;
  authForm.dataset.mode = needsSetup ? "setup" : "login";
  authForm.elements.password.autocomplete = needsSetup ? "new-password" : "current-password";
  authForm.elements.password.minLength = needsSetup ? 10 : 1;
}

function showApp(user) {
  state.user = user;
  authScreen.hidden = true;
  appShell.hidden = false;
  document.querySelector("#account-name").textContent = user.username;
  document.querySelector("#account-role").textContent = user.role.toUpperCase();
  document.querySelector("#account-avatar").textContent = user.username.slice(0, 1).toUpperCase();
  document.querySelectorAll(".owner-only").forEach((element) => {
    element.hidden = user.role !== "owner";
  });
  setPage(state.page);
}

function setPage(page) {
  if (state.user?.role !== "owner" && ["team", "audit", "backups"].includes(page)) {
    page = "dashboard";
  }
  state.page = page;
  document.querySelector("#page-breadcrumb").textContent = pageNames[page];
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  renderPage().catch((error) => showToast(error.message, true));
}

function pageHeading(title, description, actions = "") {
  return `
    <div class="page-heading">
      <div>
        <p class="eyebrow-inline">GYM MANAGEMENT</p>
        <h1>${title}</h1>
        <p>${description}</p>
      </div>
      ${actions ? `<div class="heading-actions">${actions}</div>` : ""}
    </div>
  `;
}

function emptyState(title, message) {
  return `<div class="empty-state"><strong>${title}</strong>${message}</div>`;
}

function statusPill(status) {
  const safeStatus = String(status || "inactive").toLowerCase().replace(/\s+/g, "-");
  return `<span class="status-pill status-${escapeHtml(safeStatus)}">${escapeHtml(status || "inactive")}</span>`;
}

function personCell(name, detail = "") {
  const initial = escapeHtml(String(name || "?").slice(0, 1).toUpperCase());
  return `<span class="person-cell"><span class="person-initial">${initial}</span><span><strong>${escapeHtml(name)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</span></span>`;
}

async function renderPage() {
  if (!state.user) return;
  if (state.page === "dashboard") return renderDashboard();
  if (state.page === "members") return renderMembers();
  if (state.page === "plans") return renderPlans();
  if (state.page === "reports") return renderReports();
  if (state.page === "team") return renderTeam();
  if (state.page === "audit") return renderAudit();
  if (state.page === "backups") return renderBackups();
}

function renderBackups() {
  pageContent.innerHTML = `
    ${pageHeading("Back up your gym data", "Download a private copy of your current records.")}
    <section class="panel">
      <div class="panel-header"><div><h2>Database backup</h2><p>A consistent snapshot of your gym database</p></div></div>
      <div class="panel-body">
        <p class="muted">The backup includes member, payment, and staff-account data. It is downloaded directly to this device and is not uploaded elsewhere.</p>
        <button class="button button-primary" data-action="download-backup">Download backup</button>
        <p class="notice notice-green stack-gap-14"><strong>Keep it private</strong>Store the downloaded file somewhere safe and offline. Anyone with the file can access your gym records.</p>
      </div>
    </section>
    <section class="panel stack-gap-14">
      <div class="panel-header"><div><h2>Restore a backup</h2><p>Restoring replaces the current database.</p></div></div>
      <div class="panel-body">
        <ol>
          <li>Stop the app in its terminal with <strong>Ctrl+C</strong>.</li>
          <li>Keep a separate copy of the current database before replacing it.</li>
          <li>Replace the configured database file with your backup. By default, the file is <code>data/gym.sqlite</code>; if you set <code>DB_PATH</code>, replace that file instead.</li>
          <li>Start the app again with <code>npm start</code> and sign in.</li>
        </ol>
      </div>
    </section>
  `;
}

async function renderDashboard() {
  state.dashboard = await api("/api/dashboard");
  const { summary, upcoming, reminders } = state.dashboard;
  const actions = `<button class="button button-primary" data-action="new-member">＋ Add member</button>`;
  pageContent.innerHTML = `
    ${pageHeading("A stronger view of your gym", "Keep up with memberships, payments, and the people behind your community.", actions)}
    <div class="stats-grid">
      <article class="stat-card"><div class="stat-label">Active members <span class="stat-symbol">♧</span></div><strong class="stat-value">${summary.active_members}</strong><div class="stat-footnote">Member profiles currently active</div></article>
      <article class="stat-card"><div class="stat-label">Expiring soon <span class="stat-symbol">◷</span></div><strong class="stat-value">${summary.expiring_members}</strong><div class="stat-footnote">Membership ends within 14 days</div></article>
      <article class="stat-card"><div class="stat-label">Expired memberships <span class="stat-symbol">↗</span></div><strong class="stat-value">${summary.expired_members}</strong><div class="stat-footnote">Active member profiles needing renewal</div></article>
      <article class="stat-card"><div class="stat-label">Collected today <span class="stat-symbol">₹</span></div><strong class="stat-value">${formatMoney(summary.today_revenue)}</strong><div class="stat-footnote">${formatDate(state.dashboard.today)} · recorded payments</div></article>
    </div>
    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-header"><div><h2>Renewal watch</h2><p>Members with an expiry date coming up or already passed</p></div><button class="text-button" data-page="members">All members →</button></div>
        <div class="table-wrap">
          ${upcoming.length ? `<table><thead><tr><th>Member</th><th>Plan</th><th>Ends</th><th>Status</th><th>Reminder</th></tr></thead><tbody>${upcoming.map((member) => `
            <tr>
              <td><button class="row-link" data-action="member-detail" data-id="${member.member_id}">${personCell(member.name, member.phone)}</button></td>
              <td>${escapeHtml(member.plan_name)}</td><td>${formatDate(member.end_date)}</td>
              <td>${statusPill(member.status)}</td>
              <td>${member.sms_consent || member.whatsapp_consent
                ? `<button class="button button-secondary button-small" data-action="prepare-reminder" data-id="${member.membership_id}" data-name="${escapeHtml(member.name)}">Prepare</button>`
                : `<span class="muted">No consent</span>`}</td>
            </tr>`).join("")}</tbody></table>` : emptyState("All caught up", "No memberships are due to expire in the next 14 days.")}
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><div><h2>Recent reminders</h2><p>Staff-confirmed reminder activity</p></div></div>
        <div class="panel-body">
          ${reminders.length ? reminders.map((reminder) => `
            <div class="reminder-row">
              <div class="reminder-person"><strong>${escapeHtml(reminder.member_name)}</strong><small>${escapeHtml(reminder.channel.toUpperCase())} · ${escapeHtml(reminder.plan_name || "Membership")}</small></div>
              ${statusPill(reminder.status)}
            </div>`).join("") : emptyState("No reminders yet", "Prepared reminders will appear here.")}
        </div>
      </section>
    </div>
  `;
}

async function loadMembers(search = "") {
  const data = await api(`/api/members?search=${encodeURIComponent(search)}`);
  state.members = data.members;
  return data.members;
}

async function renderMembers(search = "") {
  const members = await loadMembers(search);
  pageContent.innerHTML = `
    ${pageHeading("Members", "Find a member, review their membership, and keep their details current.", `<button class="button button-primary" data-action="new-member">＋ Add member</button>`)}
    <section class="table-panel">
      <div class="table-toolbar">
        <label class="search-box"><span class="sr-only">Search members</span><input id="member-search" type="search" placeholder="Search name or phone number" value="${escapeHtml(search)}"></label>
        <span class="table-count">${members.length} member${members.length === 1 ? "" : "s"} shown</span>
      </div>
      <div class="table-wrap">
        ${members.length ? `<table><thead><tr><th>Member</th><th>Phone</th><th>Latest plan</th><th>Membership ends</th><th>Status</th><th></th></tr></thead><tbody>${members.map((member) => `
          <tr>
            <td><button class="row-link" data-action="member-detail" data-id="${member.id}">${personCell(member.name, member.email || "")}</button></td>
            <td>${escapeHtml(member.phone)}</td><td>${escapeHtml(member.plan_name || "No membership")}</td>
            <td>${formatDate(member.end_date)}</td><td>${statusPill(member.status)}</td>
            <td><div class="table-actions"><button class="button button-secondary button-small" data-action="member-detail" data-id="${member.id}">View</button></div></td>
          </tr>`).join("")}</tbody></table>` : emptyState(search ? "No matching members" : "No members yet", search ? "Try another name or phone number." : "Add your first member to get started.")}
      </div>
    </section>
  `;
  const input = document.querySelector("#member-search");
  let searchTimer;
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const currentValue = input.value;
      const cursorPosition = input.selectionStart;
      renderMembers(currentValue).then(() => {
        const replacement = document.querySelector("#member-search");
        replacement?.focus();
        replacement?.setSelectionRange(cursorPosition, cursorPosition);
      }).catch((error) => showToast(error.message, true));
    }, 180);
  });
}

async function renderPlans() {
  const { plans } = await api("/api/plans");
  state.plans = plans;
  const canEdit = state.user.role === "owner";
  const rows = plans.map((plan) => `
    <div class="plan-card">
      <div><h3>${escapeHtml(plan.name)} ${plan.is_active ? "" : statusPill("inactive")}</h3><span class="plan-meta">${plan.duration_days} days · ${plan.is_active ? "Available for enrollment" : "Not available for new memberships"}</span></div>
      <div class="plan-side"><strong class="plan-price">${formatMoney(plan.price_paise)}</strong>${canEdit ? `<div class="table-actions"><button class="button button-secondary button-small" data-action="edit-plan" data-id="${plan.id}">Edit</button><button class="button ${plan.is_active ? "button-danger" : "button-secondary"} button-small" data-action="toggle-plan" data-id="${plan.id}">${plan.is_active ? "Archive" : "Restore"}</button></div>` : ""}</div>
    </div>`).join("");
  pageContent.innerHTML = `
    ${pageHeading("Membership plans", "Set the duration and price for each way members can train.", canEdit ? `<button class="button button-primary" data-action="new-plan">＋ Create plan</button>` : "")}
    <div class="split-grid">
      <section class="panel form-card">
        <h2>How plans work</h2><p>Each membership keeps a snapshot of its plan and price. Updating a plan later will not change memberships that were already created.</p>
        <div class="notice notice-green"><strong>Simple date rule</strong>A 30-day plan starting 1 October ends 30 October. The start and end dates are both included.</div>
      </section>
      <section class="panel">
        <div class="panel-header"><div><h2>Your plans</h2><p>${plans.length} plan${plans.length === 1 ? "" : "s"} configured</p></div></div>
        ${rows || emptyState("No plans configured", canEdit ? "Create a plan before enrolling a member." : "Ask the owner to create a membership plan.")}
      </section>
    </div>
  `;
}

async function renderReports() {
  const today = todayString();
  const firstDay = `${today.slice(0, 7)}-01`;
  pageContent.innerHTML = `${pageHeading("Reports", "Review recorded revenue and the current state of memberships.")}<div id="report-content"></div>`;
  try {
    const report = await api(`/api/reports?from=${firstDay}&to=${today}`);
    displayReports(report);
  } catch (error) {
    showToast(error.message, true);
  }
}

function displayReports(report) {
  const reportContent = document.querySelector("#report-content");
  if (!reportContent) return;
  const rows = report.revenue.map((entry) => `
    <tr><td>${formatDate(entry.payment_date)}</td><td>${entry.payment_count}</td><td><strong>${formatMoney(entry.amount_paise)}</strong></td></tr>
  `).join("");
  const members = report.membershipStatuses;
  reportContent.innerHTML = `
    <section class="panel">
      <form id="report-filter" class="toolbar-filter">
        <label>From date<input name="from" type="date" value="${escapeHtml(report.from)}" required></label>
        <label>To date<input name="to" type="date" value="${escapeHtml(report.to)}" required></label>
        <button class="button button-secondary" type="submit">Apply dates</button>
        <button class="button button-primary" type="button" data-action="export-report">Export CSV</button>
      </form>
      <div class="report-summary"><div><small>Payments collected in this period</small><strong>${formatMoney(report.summary.total_paise)}</strong></div><span class="table-count">${report.summary.payment_count} payment${report.summary.payment_count === 1 ? "" : "s"}</span></div>
      <div class="panel-header"><div><h2>Revenue by payment date</h2><p>Based on payments recorded in the system</p></div></div>
      <div class="table-wrap">${rows ? `<table><thead><tr><th>Date</th><th>Payments</th><th>Revenue</th></tr></thead><tbody>${rows}</tbody></table>` : emptyState("No payments in this range", "Payments you record will be included in this report.")}</div>
    </section>
    <section class="panel stack-gap-15">
      <div class="panel-header"><div><h2>Membership status</h2><p>Each member's latest membership, based on today's date</p></div><span class="table-count">${members.length} member${members.length === 1 ? "" : "s"}</span></div>
      <div class="table-wrap">${members.length ? `<table><thead><tr><th>Member</th><th>Plan</th><th>Start date</th><th>End date</th><th>Status</th></tr></thead><tbody>${members.map((member) => `<tr><td>${personCell(member.name, member.phone)}</td><td>${escapeHtml(member.plan_name)}</td><td>${formatDate(member.start_date)}</td><td>${formatDate(member.end_date)}</td><td>${statusPill(member.is_active ? member.status : "inactive")}</td></tr>`).join("")}</tbody></table>` : emptyState("No memberships yet", "Memberships will be listed here once a member enrolls in a plan.")}</div>
    </section>
  `;
  reportContent.querySelector("#report-filter").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    try {
      const result = await api(`/api/reports?from=${encodeURIComponent(formData.get("from"))}&to=${encodeURIComponent(formData.get("to"))}`);
      displayReports(result);
    } catch (error) {
      showToast(error.message, true);
    }
  });
  reportContent.querySelector('[data-action="export-report"]').addEventListener("click", () => exportReport(report));
}

async function renderTeam() {
  const { users } = await api("/api/users");
  const staff = users.filter((user) => user.role === "staff");
  pageContent.innerHTML = `
    ${pageHeading("Staff accounts", "Give front-desk teammates their own sign-in. Only the owner can create accounts.", `<button class="button button-primary" data-action="new-staff">＋ Add staff account</button>`)}
    <section class="panel form-card"><h2>Account safety</h2><p>Staff can manage members, memberships, and payments, but plan and staff-account management stays with the owner. Deactivating an account immediately ends its active sessions.</p><div class="notice notice-green"><strong>Good practice</strong>Use a unique password for every account. Passwords are stored as salted, one-way hashes, not readable text.</div></section>
    <section class="table-panel stack-gap-15"><div class="panel-header"><div><h2>Team members</h2><p>${staff.length} staff account${staff.length === 1 ? "" : "s"}</p></div></div><div class="table-wrap">
      ${staff.length ? `<table><thead><tr><th>Username</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead><tbody>${staff.map((user) => `<tr><td>${personCell(user.username, "Front-desk staff")}</td><td>${formatDate(user.created_at.slice(0, 10))}</td><td>${statusPill(user.is_active ? "active" : "inactive")}</td><td><div class="table-actions"><button class="button button-secondary button-small" data-action="reset-staff-password" data-id="${user.id}">Reset password</button><button class="button ${user.is_active ? "button-danger" : "button-secondary"} button-small" data-action="toggle-staff" data-id="${user.id}" data-active="${user.is_active}">${user.is_active ? "Deactivate" : "Activate"}</button></div></td></tr>`).join("")}</tbody></table>` : emptyState("No staff accounts yet", "Create an account for a front-desk teammate.")}</div></section>
  `;
}

async function renderAudit() {
  const { entries } = await api("/api/audit");
  pageContent.innerHTML = `
    ${pageHeading("Activity log", "Recent account, member, plan, payment, and reminder changes.")}
    <section class="table-panel"><div class="table-wrap">
      ${entries.length ? `<table><thead><tr><th>Time</th><th>Person</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>${entries.map((entry) => `<tr><td>${escapeHtml(entry.created_at)}</td><td>${escapeHtml(entry.username || "System")}</td><td>${escapeHtml(entry.action)}</td><td>${escapeHtml(entry.entity_type)} ${entry.entity_id ?? ""}</td><td>${escapeHtml(entry.details)}</td></tr>`).join("")}</tbody></table>` : emptyState("Nothing recorded yet", "Important changes will appear here.")}</div></section>
  `;
}

function openModal(title, description, body, submitLabel = "Save changes", formName = "") {
  modalContent.innerHTML = `
    <div class="modal-content">
      <div class="modal-header"><div><h2 id="modal-title">${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div><button class="modal-close" data-action="close-modal" aria-label="Close">×</button></div>
      ${formName ? `<form data-form="${escapeHtml(formName)}" class="form-stack">${body}<div class="form-actions"><button class="button button-secondary" type="button" data-action="close-modal">Cancel</button><button class="button button-primary" type="submit">${escapeHtml(submitLabel)}</button></div></form>` : body}
    </div>
  `;
  modalBackdrop.hidden = false;
  modalContent.querySelector("input, select, textarea, button")?.focus();
}

function closeModal() {
  modalBackdrop.hidden = true;
  modalContent.innerHTML = "";
}

function memberForm(member = {}) {
  return `
    <div class="form-grid">
      <label class="span-two">Full name<input name="name" required maxlength="100" value="${escapeHtml(member.name || "")}" placeholder="e.g. Aanya Sharma"></label>
      <label>Phone number<input name="phone" type="tel" required maxlength="30" value="${escapeHtml(member.phone || "")}" placeholder="+91 98765 43210"></label>
      <label>Email (optional)<input name="email" type="email" maxlength="254" value="${escapeHtml(member.email || "")}" placeholder="name@example.com"></label>
      <label class="span-two">Notes (optional)<textarea name="notes" maxlength="2000" placeholder="Anything staff should know">${escapeHtml(member.notes || "")}</textarea></label>
      <div class="span-two checkbox-stack">
        <label class="checkbox-row"><input name="smsConsent" type="checkbox" ${member.sms_consent ? "checked" : ""}>Member has agreed to receive membership reminders by SMS.</label>
        <label class="checkbox-row"><input name="whatsappConsent" type="checkbox" ${member.whatsapp_consent ? "checked" : ""}>Member has agreed to receive membership reminders by WhatsApp.</label>
      </div>
    </div>
  `;
}

function newMemberForm(plans) {
  const planOptions = plans.map((plan) => `
    <option value="${plan.id}" data-days="${plan.duration_days}">
      ${escapeHtml(plan.name)} · ${plan.duration_days} days · ${formatMoney(plan.price_paise)}
    </option>
  `).join("");
  return `
    <section class="form-section">
      <div class="form-section-heading">
        <span class="section-number">1</span>
        <div><h3>Member basic details</h3><p>Enter the contact details needed to create a member profile.</p></div>
      </div>
      <div class="form-grid">
        <label class="span-two">Full name<input name="name" required maxlength="100" placeholder="e.g. Aanya Sharma"></label>
        <label>Phone number<input name="phone" type="tel" required maxlength="30" placeholder="+91 98765 43210"></label>
        <label>Email (optional)<input name="email" type="email" maxlength="254" placeholder="name@example.com"></label>
        <label class="span-two">Notes (optional)<textarea name="notes" maxlength="2000" placeholder="Anything staff should know"></textarea></label>
        <div class="span-two checkbox-stack">
          <label class="checkbox-row"><input name="smsConsent" type="checkbox">Member has agreed to receive membership reminders by SMS.</label>
          <label class="checkbox-row"><input name="whatsappConsent" type="checkbox">Member has agreed to receive membership reminders by WhatsApp.</label>
        </div>
      </div>
    </section>
    <section class="form-section">
      <div class="form-section-heading">
        <span class="section-number">2</span>
        <div><h3>Membership details <span class="optional-label">OPTIONAL</span></h3><p>Add one plan now, or save the member and enroll them later.</p></div>
      </div>
      <label class="checkbox-row section-toggle"><input name="addMembership" type="checkbox" ${plans.length ? "" : "disabled"}>Add a membership for this member now.</label>
      <div id="new-membership-fields" class="form-grid section-fields" hidden>
        ${plans.length ? `
          <label class="span-two">Membership plan
            <select name="planId">${planOptions}</select>
          </label>
          <label>Start date<input name="startDate" type="date" value="${todayString()}"></label>
          <label>Estimated end date<input id="new-membership-end-preview" type="text" readonly></label>
        ` : `<p class="span-two field-hint">There are no active plans yet. Create a plan first, or save the member and enroll them later.</p>`}
      </div>
    </section>
    <section class="form-section form-section-last">
      <div class="form-section-heading">
        <span class="section-number">3</span>
        <div><h3>Payment details <span class="optional-label">OPTIONAL</span></h3><p>Record an initial payment if you are adding a membership.</p></div>
      </div>
      <label class="checkbox-row section-toggle"><input name="addPayment" type="checkbox" disabled>Add a payment now.</label>
      <p class="field-hint">Choose a membership in section 2 before adding its payment. You can deactivate a member later from their profile.</p>
      <div id="new-payment-fields" class="form-grid section-fields" hidden>
        <label>Amount (₹)<input name="paymentAmount" type="number" min="0.01" step="0.01" placeholder="e.g. 1500"></label>
        <label>Payment date<input name="paymentDate" type="date" value="${todayString()}"></label>
        <label>Payment method<select name="paymentMethod"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card (record only)</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label>
        <label>Reference (optional)<input name="paymentReference" maxlength="100" placeholder="Receipt or transaction note"></label>
      </div>
    </section>
  `;
}

async function showNewMemberForm() {
  const { plans } = await api("/api/plans");
  openModal(
    "Add a member",
    "Save basic details on their own, or optionally add one membership and its initial payment.",
    newMemberForm(plans.filter((plan) => plan.is_active)),
    "Save member",
    "new-member",
  );
  updateNewMemberSections();
  updateNewMembershipPreview();
}

function updateNewMemberSections() {
  const form = modalContent.querySelector('[data-form="new-member"]');
  if (!form) return;
  const membershipEnabled = form.elements.addMembership.checked;
  const paymentEnabled = form.elements.addPayment.checked && membershipEnabled;
  modalContent.querySelector("#new-membership-fields").hidden = !membershipEnabled;
  modalContent.querySelector("#new-payment-fields").hidden = !paymentEnabled;

  const paymentToggle = form.elements.addPayment;
  paymentToggle.disabled = !membershipEnabled;
  if (!membershipEnabled) {
    paymentToggle.checked = false;
  }

  for (const field of [form.elements.planId, form.elements.startDate]) {
    if (field) field.required = membershipEnabled;
  }
  for (const field of [
    form.elements.paymentAmount,
    form.elements.paymentDate,
    form.elements.paymentMethod,
  ]) {
    if (field) field.required = paymentEnabled;
  }
}

function updateNewMembershipPreview() {
  const form = modalContent.querySelector('[data-form="new-member"]');
  const preview = modalContent.querySelector("#new-membership-end-preview");
  if (!form || !preview || !form.elements.addMembership.checked) return;
  const plan = form.elements.planId.selectedOptions[0];
  const start = form.elements.startDate.value;
  if (!plan || !start) {
    preview.value = "";
    return;
  }
  const end = new Date(`${start}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + Number(plan.dataset.days) - 1);
  preview.value = formatDate(end.toISOString().slice(0, 10));
}

async function showMember(id) {
  const { member, memberships, payments } = await api(`/api/members/${id}`);
  const currentMembership = memberships.find((membership) => ["active", "expiring"].includes(membership.status))
    || memberships.find((membership) => membership.status === "upcoming")
    || memberships[0];
  const memberStatus = member.is_active ? (currentMembership?.status || "no membership") : "inactive";
  const membershipItems = memberships.length ? memberships.map((membership) => `
    <div class="detail-item">
      <div><strong>${escapeHtml(membership.plan_name)} · ${statusPill(membership.status)}</strong><small>${formatDate(membership.start_date)} – ${formatDate(membership.end_date)} · ${formatMoney(membership.paid_paise)} paid · ${formatMoney(membership.balance_paise)} balance</small></div>
      ${member.is_active ? `<button class="button button-secondary button-small" data-action="new-payment" data-id="${membership.id}">Add payment</button>` : ""}
    </div>`).join("") : emptyState("No membership yet", "Choose a plan to enroll this member.");
  const paymentItems = payments.length ? payments.map((payment) => `
    <div class="detail-item"><div><strong>${formatMoney(payment.amount_paise)} · ${escapeHtml(payment.method.replace("_", " "))}</strong><small>${formatDate(payment.payment_date)} · ${escapeHtml(payment.plan_name)} · Recorded by ${escapeHtml(payment.recorded_by)}${payment.reference ? ` · ${escapeHtml(payment.reference)}` : ""}</small></div></div>
  `).join("") : emptyState("No payments yet", "Recorded payments will appear here.");
  const actions = `
    <div class="heading-actions">
      <button class="button button-secondary button-small" data-action="edit-member" data-id="${member.id}">Edit details</button>
      <button class="button button-secondary button-small" data-action="new-membership" data-id="${member.id}">＋ Enroll / renew</button>
      <button class="button ${member.is_active ? "button-danger" : "button-secondary"} button-small" data-action="toggle-member" data-id="${member.id}" data-active="${member.is_active}">${member.is_active ? "Deactivate" : "Reactivate"}</button>
    </div>`;
  openModal(member.name, `${member.phone} · ${memberStatus}${member.email ? ` · ${member.email}` : ""}`, `
    ${actions}
    ${member.notes ? `<div class="notice stack-gap-14"><strong>Staff note</strong>${escapeHtml(member.notes)}</div>` : ""}
    <section class="detail-section"><h3>Membership history</h3><div class="detail-list">${membershipItems}</div></section>
    <section class="detail-section"><h3>Payment history</h3><div class="detail-list">${paymentItems}</div></section>
    <section class="detail-section"><h3>Reminder consent</h3><p class="muted">${member.sms_consent ? "SMS: agreed" : "SMS: not agreed"} · ${member.whatsapp_consent ? "WhatsApp: agreed" : "WhatsApp: not agreed"}</p></section>
  `);
}

function showPlanForm(plan = null) {
  const editing = Boolean(plan);
  openModal(editing ? "Edit membership plan" : "Create a membership plan", "Choose a clear name, duration, and price in Indian rupees.", `
    <div class="form-grid">
      <label class="span-two">Plan name<input name="name" required maxlength="80" value="${escapeHtml(plan?.name || "")}" placeholder="e.g. Monthly membership"></label>
      <label>Duration (days)<input name="durationDays" type="number" min="1" max="3650" required value="${escapeHtml(plan?.duration_days || 30)}"></label>
      <label>Price (₹)<input name="price" type="number" min="0" step="0.01" required value="${plan ? (plan.price_paise / 100).toFixed(2) : "1500"}"></label>
    </div>
  `, editing ? "Save plan" : "Create plan", editing ? `edit-plan:${plan.id}` : "new-plan");
}

async function showMembershipForm(memberId = null) {
  const members = await loadMembers();
  const plans = (await api("/api/plans")).plans.filter((plan) => plan.is_active);
  const activeMembers = members.filter((member) => member.is_active);
  if (!plans.length || !activeMembers.length) {
    showToast(!plans.length ? "Create an active membership plan first." : "Add an active member first.", true);
    return;
  }
  const currentMember = members.find((member) => member.id === memberId);
  const planOptions = plans.map((plan) => `<option value="${plan.id}" data-days="${plan.duration_days}">${escapeHtml(plan.name)} · ${plan.duration_days} days · ${formatMoney(plan.price_paise)}</option>`).join("");
  const memberOptions = activeMembers.map((member) => `<option value="${member.id}" ${member.id === memberId ? "selected" : ""}>${escapeHtml(member.name)} · ${escapeHtml(member.phone)}</option>`).join("");
  openModal("Enroll or renew a membership", "A new membership is added to history; previous membership records are kept.", `
    <div class="form-grid">
      <label class="span-two">Member<select name="memberId" required>${memberOptions}</select></label>
      <label class="span-two">Plan<select name="planId" required>${planOptions}</select></label>
      <label>Start date<input name="startDate" type="date" required value="${todayString()}"></label>
      <label>Estimated end date<input id="membership-end-preview" type="text" readonly value=""></label>
    </div>
    <p class="field-hint">The end date includes the final day of the plan. You can schedule a renewal to begin later.</p>
    ${currentMember ? `<input type="hidden" name="memberHint" value="${currentMember.id}">` : ""}
  `, "Create membership", "new-membership");
  updateMembershipPreview();
}

function updateMembershipPreview() {
  const form = modalContent.querySelector('[data-form="new-membership"]');
  if (!form) return;
  const plan = form.elements.planId.selectedOptions[0];
  const start = form.elements.startDate.value;
  if (!plan || !start) return;
  const end = new Date(`${start}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + Number(plan.dataset.days) - 1);
  modalContent.querySelector("#membership-end-preview").value = formatDate(end.toISOString().slice(0, 10));
}

async function showPaymentForm(membershipId = null) {
  const { memberships } = await api("/api/memberships");
  const options = memberships.map((membership) => `<option value="${membership.id}" ${Number(membership.id) === Number(membershipId) ? "selected" : ""}>${escapeHtml(membership.member_name)} · ${escapeHtml(membership.plan_name)} · ${formatDate(membership.end_date)}</option>`).join("");
  if (!options) {
    showToast("There are no memberships for active members to record a payment against.", true);
    return;
  }
  openModal("Record a payment", "Payments are recorded manually. No card or bank details are stored.", `
    <div class="form-grid">
      <label class="span-two">Membership<select name="membershipId" required>${options}</select></label>
      <label>Amount (₹)<input name="amount" type="number" min="0.01" step="0.01" required placeholder="e.g. 1500"></label>
      <label>Payment date<input name="paymentDate" type="date" required value="${todayString()}"></label>
      <label>Payment method<select name="method" required><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card (record only)</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label>
      <label>Reference (optional)<input name="reference" maxlength="100" placeholder="Receipt or transaction note"></label>
    </div>
  `, "Record payment", "new-payment");
}

function showStaffForm() {
  openModal("Add a staff account", "Give each teammate their own sign-in. Password must be at least 10 characters.", `
    <div class="form-grid"><label class="span-two">Username<input name="username" autocomplete="username" required maxlength="50"></label><label class="span-two">Temporary password<input name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="200"></label></div>
  `, "Create staff account", "new-staff");
}

function showStaffPasswordForm(userId) {
  openModal("Reset staff password", "The staff member's existing sessions will be signed out after the password changes.", `
    <label>New temporary password<input name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="200"></label>
  `, "Reset password", `reset-staff-password:${userId}`);
}

async function openReminder(membershipId, memberName) {
  const member = state.dashboard?.upcoming.find((item) => item.membership_id === Number(membershipId));
  if (!member) {
    showToast("Refresh the dashboard and try again.", true);
    return;
  }
  const channels = [];
  if (member.sms_consent) channels.push(`<option value="sms">SMS</option>`);
  if (member.whatsapp_consent) channels.push(`<option value="whatsapp">WhatsApp</option>`);
  if (!channels.length) {
    showToast("This member has not agreed to SMS or WhatsApp reminders.", true);
    return;
  }
  openModal("Prepare a renewal reminder", `${escapeHtml(memberName)} has agreed to receive reminders through the selected channel.`, `
    <label>Reminder channel<select name="channel" required>${channels.join("")}</select></label>
    <div class="notice stack-gap-14"><strong>How this works</strong>We will open the staff member's SMS or WhatsApp app with a prepared message. The app cannot verify delivery, so staff must record the outcome afterwards.</div>
  `, "Prepare message", `prepare-reminder:${membershipId}`);
}

function showPreparedReminder(reminder) {
  const linkLabel = reminder.channel === "whatsapp" ? "Open WhatsApp" : "Open SMS";
  openModal("Reminder prepared", "Review the message in the external app, then return here to record the outcome.", `
    <div class="notice notice-green"><strong>Message text</strong>${escapeHtml(reminder.message)}</div>
    <div class="heading-actions stack-gap-14"><a class="button button-primary" href="${escapeHtml(reminder.url)}" target="_blank" rel="noopener noreferrer">${linkLabel} ↗</a></div>
    <p class="field-hint stack-gap-12">Opening the app does not prove a message was delivered. Only choose “Sent” if staff actually sent it.</p>
    <div class="form-actions"><button class="button button-danger" data-action="reminder-outcome" data-id="${reminder.id}" data-status="failed">Mark failed</button><button class="button button-primary" data-action="reminder-outcome" data-id="${reminder.id}" data-status="sent">Staff confirms sent</button></div>
  `);
}

function csvCell(value) {
  let safeValue = String(value ?? "");
  if (/^[=+\-@]/.test(safeValue)) safeValue = `'${safeValue}`;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function exportReport(report) {
  const rows = [["Report", "Revenue by payment date"], ["From", report.from], ["To", report.to], [], ["Date", "Payment count", "Revenue (INR)"]];
  for (const entry of report.revenue) {
    rows.push([entry.payment_date, entry.payment_count, (entry.amount_paise / 100).toFixed(2)]);
  }
  rows.push([], ["Member", "Phone", "Plan", "Start date", "End date", "Status"]);
  for (const member of report.membershipStatuses) {
    rows.push([member.name, member.phone, member.plan_name, member.start_date, member.end_date, member.is_active ? member.status : "inactive"]);
  }
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blobUrl = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `gym-report-${report.from}-to-${report.to}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

document.body.addEventListener("change", (event) => {
  if (event.target.name === "startDate" || event.target.name === "planId") {
    updateMembershipPreview();
  }
});

async function signOut() {
  try {
    await api("/api/logout", { method: "POST" });
    state.user = null;
    showAuth(false);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function downloadBackup() {
  const response = await fetch("/api/backup", { method: "POST" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) showAuth(false);
    throw new Error(data.error || "Could not download the backup.");
  }
  const filename = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1]
    || "goodform-backup.sqlite";
  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  showToast("Backup downloaded. Keep the file somewhere private.");
}

document.querySelector("#logout-button").addEventListener("click", signOut);
document.querySelector("#mobile-logout").addEventListener("click", signOut);

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.hidden = true;
  const formData = new FormData(authForm);
  const mode = authForm.dataset.mode;
  try {
    if (mode === "setup") {
      await api("/api/setup", {
        method: "POST",
        body: JSON.stringify({ username: formData.get("username"), password: formData.get("password") }),
      });
      showAuth(false);
      showToast("Owner account created. Sign in to continue.");
      return;
    }
    const result = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username: formData.get("username"), password: formData.get("password") }),
    });
    showApp(result.user);
  } catch (error) {
    authError.textContent = error.message;
    authError.hidden = false;
  }
});

document.body.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action], [data-page]");
  if (!button) return;
  if (button.dataset.page) {
    setPage(button.dataset.page);
    return;
  }
  const action = button.dataset.action;
  try {
    if (action === "close-modal") closeModal();
    if (action === "download-backup") await downloadBackup();
    if (action === "new-member") await showNewMemberForm();
    if (action === "new-plan") showPlanForm();
    if (action === "edit-plan") {
      const plan = state.plans.find((item) => item.id === Number(button.dataset.id));
      if (plan) showPlanForm(plan);
    }
    if (action === "toggle-plan") {
      const plan = state.plans.find((item) => item.id === Number(button.dataset.id));
      if (plan) {
        await api(`/api/plans/${plan.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !plan.is_active }) });
        showToast(plan.is_active ? "Plan archived." : "Plan restored.");
        await renderPlans();
      }
    }
    if (action === "new-membership") await showMembershipForm(button.dataset.id ? Number(button.dataset.id) : null);
    if (action === "new-payment") await showPaymentForm(button.dataset.id ? Number(button.dataset.id) : null);
    if (action === "new-staff") showStaffForm();
    if (action === "reset-staff-password") showStaffPasswordForm(button.dataset.id);
    if (action === "toggle-staff") {
      const activate = button.dataset.active !== "1";
      if (!confirm(activate ? "Activate this staff account?" : "Deactivate this staff account and sign out its sessions?")) return;
      await api(`/api/users/${button.dataset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: activate }),
      });
      showToast(activate ? "Staff account activated." : "Staff account deactivated.");
      await renderTeam();
    }
    if (action === "member-detail") await showMember(Number(button.dataset.id));
    if (action === "edit-member") {
      const { member } = await api(`/api/members/${button.dataset.id}`);
      openModal("Edit member details", "Update contact details and reminder consent.", memberForm(member), "Save details", `edit-member:${member.id}`);
    }
    if (action === "toggle-member") {
      const memberId = Number(button.dataset.id);
      const deactivate = button.dataset.active === "1";
      if (!confirm(deactivate ? "Deactivate this member? Their history will be kept." : "Reactivate this member?")) return;
      await api(`/api/members/${memberId}`, { method: "PATCH", body: JSON.stringify({ isActive: !deactivate }) });
      showToast(deactivate ? "Member deactivated; history was kept." : "Member reactivated.");
      await showMember(memberId);
    }
    if (action === "prepare-reminder") await openReminder(Number(button.dataset.id), button.dataset.name);
    if (action === "reminder-outcome") {
      const note = prompt("Optional note about this reminder outcome:", "") || "";
      await api(`/api/reminders/${button.dataset.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: button.dataset.status, note }),
      });
      closeModal();
      showToast("Reminder outcome recorded. Delivery was not independently verified.");
      await renderDashboard();
    }
  } catch (error) {
    showToast(error.message, true);
  }
});

document.body.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const formData = new FormData(form);
  const value = (name) => formData.get(name);
  const checked = (name) => form.elements[name].checked;
  try {
    if (form.dataset.form === "new-member") {
      const membershipEnabled = checked("addMembership");
      const paymentEnabled = checked("addPayment");
      const result = await api("/api/members", {
        method: "POST",
        body: JSON.stringify({
          name: value("name"), phone: value("phone"), email: value("email"), notes: value("notes"),
          smsConsent: checked("smsConsent"), whatsappConsent: checked("whatsappConsent"),
          membership: membershipEnabled ? {
            planId: Number(value("planId")),
            startDate: value("startDate"),
          } : null,
          payment: paymentEnabled ? {
            amount: value("paymentAmount"),
            paymentDate: value("paymentDate"),
            method: value("paymentMethod"),
            reference: value("paymentReference"),
          } : null,
        }),
      });
      const message = result.paymentId
        ? "Member, membership, and payment added."
        : result.membership
          ? `Member and membership added. It ends ${formatDate(result.membership.endDate)}.`
          : "Member added.";
      showToast(message);
      closeModal();
      if (state.page === "members") await renderMembers();
      else await renderDashboard();
    }
    if (form.dataset.form.startsWith("edit-member:")) {
      const id = form.dataset.form.split(":")[1];
      await api(`/api/members/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: value("name"), phone: value("phone"), email: value("email"), notes: value("notes"),
          smsConsent: checked("smsConsent"), whatsappConsent: checked("whatsappConsent"),
        }),
      });
      showToast("Member details updated.");
      await showMember(Number(id));
    }
    if (form.dataset.form === "new-plan" || form.dataset.form.startsWith("edit-plan:")) {
      const plan = {
        name: value("name"),
        durationDays: Number(value("durationDays")),
        price: value("price"),
      };
      if (form.dataset.form === "new-plan") {
        await api("/api/plans", { method: "POST", body: JSON.stringify(plan) });
      } else {
        const id = form.dataset.form.split(":")[1];
        await api(`/api/plans/${id}`, { method: "PATCH", body: JSON.stringify(plan) });
      }
      showToast("Membership plan saved.");
      closeModal();
      await renderPlans();
    }
    if (form.dataset.form === "new-membership") {
      const result = await api("/api/memberships", {
        method: "POST",
        body: JSON.stringify({
          memberId: Number(value("memberId")),
          planId: Number(value("planId")),
          startDate: value("startDate"),
        }),
      });
      showToast(`Membership created. It ends ${formatDate(result.endDate)}.`);
      closeModal();
      if (state.page === "members") await renderMembers();
      else await renderDashboard();
    }
    if (form.dataset.form === "new-payment") {
      await api("/api/payments", {
        method: "POST",
        body: JSON.stringify({
          membershipId: Number(value("membershipId")),
          amount: value("amount"),
          paymentDate: value("paymentDate"),
          method: value("method"),
          reference: value("reference"),
        }),
      });
      showToast("Payment recorded.");
      closeModal();
      await renderPage();
    }
    if (form.dataset.form === "new-staff") {
      await api("/api/users", {
        method: "POST",
        body: JSON.stringify({ username: value("username"), password: value("password") }),
      });
      showToast("Staff account created.");
      closeModal();
    }
    if (form.dataset.form.startsWith("reset-staff-password:")) {
      const id = form.dataset.form.split(":")[1];
      await api(`/api/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ password: value("password") }),
      });
      showToast("Staff password reset; their existing sessions were signed out.");
      closeModal();
    }
    if (form.dataset.form.startsWith("prepare-reminder:")) {
      const membershipId = form.dataset.form.split(":")[1];
      const result = await api("/api/reminders", {
        method: "POST",
        body: JSON.stringify({ membershipId: Number(membershipId), channel: value("channel") }),
      });
      showPreparedReminder(result);
    }
  } catch (error) {
    showToast(error.message, true);
  }
});

document.body.addEventListener("input", (event) => {
  if (event.target.name === "startDate" || event.target.name === "planId") {
    updateMembershipPreview();
    updateNewMembershipPreview();
  }
});

document.body.addEventListener("change", (event) => {
  if (event.target.name === "addMembership" || event.target.name === "addPayment") {
    updateNewMemberSections();
    updateNewMembershipPreview();
  }
  if (event.target.name === "startDate" || event.target.name === "planId") {
    updateMembershipPreview();
    updateNewMembershipPreview();
  }
});

modalBackdrop.addEventListener("click", (event) => {
  if (event.target === modalBackdrop) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modalBackdrop.hidden) closeModal();
});

async function startApplication() {
  try {
    const { needsSetup } = await api("/api/setup-status");
    if (needsSetup) {
      showAuth(true);
      return;
    }
    try {
      const { user } = await api("/api/me");
      showApp(user);
    } catch (error) {
      showAuth(false);
    }
  } catch (error) {
    showAuth(false);
    authError.textContent = `Unable to connect to the app: ${error.message}`;
    authError.hidden = false;
  }
}

startApplication();
