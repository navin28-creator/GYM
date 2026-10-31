# GoodForm — Gym Member Manager

A small web app for one gym. It is built with plain HTML, CSS, and JavaScript,
plus a Node.js server and SQLite database. There are no third-party packages to
install.

## What this first version can do

- Create an owner account and sign in.
- Create staff accounts, reset their passwords, and deactivate or reactivate
  their access.
- Add, search, update, and deactivate member profiles. When adding a member, staff
  can optionally add one membership plan and its initial payment in the same form.
- Save a member's permission to receive SMS and/or WhatsApp reminders.
- Create membership plans, enroll or renew members, and keep membership history.
- Record manual payments and see balances and payment history.
- Review expiry reminders and prepare an SMS or WhatsApp message.
- View membership and revenue reports and download a CSV.
- Record important changes in an owner-only activity log.

## Run it on your computer

1. Install Node.js 24 or newer.
2. Open a terminal in this project folder.
3. Run:

   ```text
   npm start
   ```

4. Open <http://localhost:3000> in your browser.
5. On the first visit, create the owner account. Use a unique password with at
   least 10 characters.

The app creates `data/gym.sqlite` automatically. That file contains member,
payment, and account data, so keep it private and include it in your backup
routine. To use a different database file, set the `DB_PATH` environment
variable before starting the server.

## Deploy on Render

The repository includes a Render Blueprint in `render.yaml`. To deploy:

1. Push the project source to GitHub. Do not commit `data/gym.sqlite`, backups,
   or environment files; `.gitignore` excludes them.
2. In Render, choose **New → Blueprint**, connect the GitHub repository, and
   apply the settings from `render.yaml`.
3. Choose a Render region appropriate for where your gym operates and where its
   member data may be stored.
4. When deployment is ready, open the service URL and create the owner account.

The Blueprint uses a paid Starter web service with a 1 GB persistent disk for
SQLite. Do not switch to an ephemeral/free service for real member data: local
SQLite files can be lost when an instance is replaced, and this app is designed
to use one server instance. Keep regular private backups using the **Backups**
page. A Render deployment starts with a new database; your local database is
not automatically copied.

Before deploying, check the repository history as well as the current files.
If a real database was ever committed, adding it to `.gitignore` does not remove
older copies from Git history.

## Back up and restore your data

Sign in as the owner, open **Backups** in the sidebar, and select **Download
backup**. The app downloads a consistent SQLite snapshot directly to your
device. It includes member, payment, and staff-account data; store it somewhere
private and offline. The backup is not encrypted.

To restore a backup:

1. Stop the app in its terminal with **Ctrl+C**.
2. Keep a separate copy of the current database before replacing it.
3. Replace the database file with the downloaded backup. The default path is
   `data/gym.sqlite`; if `DB_PATH` is set, replace the file at that path instead.
4. Start the app again with `npm start` and sign in.

## Run the tests

```text
npm test
```

The tests use temporary in-memory databases; they do not change your real gym
data.

## A beginner's map of the code

- `server.js` is the backend. It receives browser requests, checks permissions
  and input, and reads or writes the database.
- `public/index.html` is the page structure.
- `public/styles.css` controls how the app looks on a phone or computer.
- `public/app.js` handles browser interactions and calls the backend with
  `fetch()`.
- `test/app.test.js` checks real HTTP workflows, including the owner/staff
  permission boundary.

For example, saving a member goes through this path:

1. The form in `index.html` collects a name and phone number.
2. `app.js` sends them to `POST /api/members`.
3. `server.js` validates the values, checks for a duplicate phone number, and
   saves the member in SQLite.
4. The response is shown in the page, or a clear error is shown instead.

## Important limits before using real member data

- This is a learning project and a local first version, not a production-ready
  hosted service. Do not expose it directly to the public internet. A real
  deployment needs HTTPS, secure hosting, a backup/recovery plan, monitoring,
  and a review of local privacy and data-protection requirements.
- Payments are records of payments handled outside this app. The app does not
  take money or save card or bank credentials.
- SMS and WhatsApp reminders are prepared in the staff member's messaging app.
  The app records the outcome staff select, but it cannot independently verify
  delivery. Provider-based sending is not configured.
- The app uses India's `Asia/Kolkata` timezone for its dashboard date and INR
  for money display. Date-only membership dates are stored as `YYYY-MM-DD`.
- Backups are manual downloads; the app does not create them automatically.

## Learning ideas

Try reading the app in this order: the form in `index.html`, its submit handler
in `public/app.js`, the matching route in `server.js`, then the related test in
`test/app.test.js`. That follows one feature from the screen all the way to
saved data.
