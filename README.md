# GoodForm Gym

GoodForm is a Windows desktop application for managing one gym. The desktop
stores the source-of-truth data in a local SQLite file and continues working
without an internet connection. A separate Expo Android app connects to the
desktop over the private Tailscale network.

## Desktop application

Install Node.js 24 or newer. From `desktop/`, run:

```text
npm install
npm start
```

The first launch opens the GoodForm desktop window. Create the owner account
with a unique password of at least 10 characters. From `desktop/`, `npm run server`
starts the same local API without opening the desktop shell, for development and testing.

The development database is `desktop/data/gym.sqlite`. The installed Windows app stores
its database and other app data in `%APPDATA%\GoodForm Gym`. Set `DB_PATH` to
override either location. The server binds to `127.0.0.1`; do not change this
to a public or LAN interface.

To build a Windows installer on Windows, run from `desktop/`:

```text
npm run package:win
```

The installer is written to `desktop/release/`. The private database is not bundled.
To carry the existing development database into an installed copy, close the
app and copy `desktop/data/gym.sqlite` to `%APPDATA%\GoodForm Gym\gym.sqlite` before
launching the installed app for the first time. Keep the original file until
you have verified the copied database.

## Private Android access

1. Install Tailscale on the gym computer and Android phone, sign both into the
   same tailnet, and confirm the phone can reach the computer.
2. Keep GoodForm running on the desktop. It listens only on `127.0.0.1:3000`.
3. On the gym computer, enable Tailscale Serve for that local service:

   ```text
   tailscale serve --bg 3000
   tailscale serve status
   ```

4. Build/run the Android client from `android/`:

   ```text
   npm install
   npx expo start
   ```

   Open it with Expo Go during development, or use an Android development
   build. Install Android Studio and its Android SDK to use `npm run android`.
5. On the phone, enter the HTTPS address reported by `tailscale serve status`,
   then sign in with a GoodForm staff or owner account.

Use Tailscale Serve, not Tailscale Funnel. Funnel would make the service
publicly reachable. Limit tailnet membership and access with your Tailscale
ACLs. The database file itself is never served over the network. The Android
app stores its session token in Android secure storage and calls the same
validated API as the desktop UI.

The mobile app can search and view members, memberships, balances, and payments.
It can create and edit member records and record memberships and payments.
Existing owner/staff API permissions remain in effect. Mobile changes require
a working Tailscale connection; offline editing and later synchronization are
not implemented.

## Data and backups

The desktop remains the source of truth. No cloud database is required, and
Turso credentials are not used by the app. Existing Turso data is left
untouched. The desktop's **Backups** page downloads a consistent SQLite
snapshot without encryption; restrict access to that file because it contains
member and account data.

Automated encrypted email backups use SMTP and AES-256-GCM. Copy `desktop/.env.example`
to `desktop/.env` for development, or to
`%APPDATA%\GoodForm Gym\.env` for the installed desktop app. Set the SMTP
account, destination address, and `BACKUP_ENCRYPTION_KEY`. Generate a key with:

```text
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

The first email is scheduled five minutes after startup, then repeats every 24
hours by default, while GoodForm is running. Set `BACKUP_INITIAL_DELAY_MINUTES`
and `BACKUP_INTERVAL_HOURS` to change the schedule. The scheduler stays disabled
until all required SMTP settings and a valid key are present. Store the key
somewhere separate from the email account and backup files; losing it makes the
encrypted snapshots unrecoverable.

To restore an emailed `.sqlite.enc` attachment, make the key available as
`BACKUP_ENCRYPTION_KEY` in `.env`, then run:

```text
cd desktop
node scripts/decrypt-backup.js goodform-backup.sqlite.enc restored.sqlite
```

The restore command will not overwrite an existing output file. With GoodForm
closed, replace the active database with the restored file. The development
path is `desktop/data/gym.sqlite`; the installed-app path is `%APPDATA%\GoodForm
Gym\gym.sqlite`, unless `DB_PATH` is set. Keep a separate copy of the current
database before replacing it.

## Tests

```text
cd desktop
npm test
```

The tests use isolated in-memory SQLite databases and cover owner/staff
permissions, member and payment workflows, mobile bearer sessions, encrypted
backup integrity, and restorable database downloads. They do not modify the
gym's database.

## Project map

- `desktop/` contains the Electron desktop app, API, database, tests, and build configuration.
- `android/` contains the separate Expo Android app.
- `desktop/electron/main.js` starts the loopback-only server and opens the desktop UI.
- `desktop/test/app.test.js` checks HTTP workflows against temporary databases.

Payments are records of payments handled outside this app; the app does not
take money or store card or bank credentials. SMS and WhatsApp reminders are
prepared in the staff member's messaging app. The app uses India's
`Asia/Kolkata` timezone and INR for money display.
