const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const FORMAT_HEADER = Buffer.from("GFB1");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function encryptionKey(value) {
  const key = Buffer.isBuffer(value) ? value : Buffer.from(value || "", "base64");
  if (key.length !== 32) {
    throw new Error("BACKUP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

function encryptBackup(backup, keyValue) {
  const key = encryptionKey(keyValue);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(backup), cipher.final()]);
  return Buffer.concat([FORMAT_HEADER, iv, cipher.getAuthTag(), ciphertext]);
}

function decryptBackup(encryptedBackup, keyValue) {
  const key = encryptionKey(keyValue);
  const minimumLength = FORMAT_HEADER.length + IV_LENGTH + TAG_LENGTH;
  if (encryptedBackup.length < minimumLength || !encryptedBackup.subarray(0, FORMAT_HEADER.length).equals(FORMAT_HEADER)) {
    throw new Error("This is not a supported GoodForm encrypted backup.");
  }
  const ivStart = FORMAT_HEADER.length;
  const tagStart = ivStart + IV_LENGTH;
  const payloadStart = tagStart + TAG_LENGTH;
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, encryptedBackup.subarray(ivStart, tagStart));
  decipher.setAuthTag(encryptedBackup.subarray(tagStart, payloadStart));
  return Buffer.concat([
    decipher.update(encryptedBackup.subarray(payloadStart)),
    decipher.final(),
  ]);
}

function createBackupScheduler({ database, config = process.env, logger = console }) {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "BACKUP_EMAIL_TO", "BACKUP_ENCRYPTION_KEY"];
  const missing = required.filter((name) => !config[name]);
  if (missing.length) {
    logger.info(`Automated encrypted backups are disabled; configure ${missing.join(", ")}.`);
    return { enabled: false, stop() {} };
  }

  let key;
  try {
    key = encryptionKey(config.BACKUP_ENCRYPTION_KEY);
  } catch (error) {
    logger.error(error.message);
    return { enabled: false, stop() {} };
  }

  const port = Number(config.SMTP_PORT);
  const intervalHours = Number(config.BACKUP_INTERVAL_HOURS || 24);
  const initialDelayMinutes = Number(config.BACKUP_INITIAL_DELAY_MINUTES || 5);
  if (!Number.isInteger(port) || port < 1 || port > 65535
    || !Number.isFinite(intervalHours) || intervalHours < 1 || intervalHours > 720
    || !Number.isFinite(initialDelayMinutes) || initialDelayMinutes < 1 || initialDelayMinutes > 1440) {
    logger.error("Backup SMTP port, interval, or initial delay is invalid.");
    return { enabled: false, stop() {} };
  }

  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port,
    secure: config.SMTP_SECURE === "true" || port === 465,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  });
  const intervalMs = intervalHours * 60 * 60 * 1000;
  let timer;
  let stopped = false;
  let running = false;

  async function sendBackup() {
    if (running) return;
    running = true;
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "goodform-mail-backup-"));
    const snapshotPath = path.join(directory, "gym.sqlite");
    try {
      await database.execute({ sql: "VACUUM INTO ?", args: [snapshotPath] });
      const encrypted = encryptBackup(await fs.promises.readFile(snapshotPath), key);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      await transporter.sendMail({
        from: config.BACKUP_EMAIL_FROM || config.SMTP_USER,
        to: config.BACKUP_EMAIL_TO,
        subject: `GoodForm encrypted database backup ${timestamp}`,
        text: "The attached database snapshot is encrypted with AES-256-GCM. Keep the configured BACKUP_ENCRYPTION_KEY private; it is required to restore the file.",
        attachments: [{
          filename: `goodform-backup-${timestamp}.sqlite.enc`,
          content: encrypted,
          contentType: "application/octet-stream",
        }],
      });
      logger.info("Encrypted database backup email sent.");
    } finally {
      running = false;
      await fs.promises.rm(directory, { recursive: true, force: true }).catch((error) => {
        logger.error(`Could not remove temporary backup files: ${error.message}`);
      });
    }
  }

  function schedule(delay) {
    if (stopped) return;
    timer = setTimeout(async () => {
      try {
        await sendBackup();
      } catch (error) {
        logger.error(`Automated encrypted backup failed: ${error.message}`);
      }
      schedule(intervalMs);
    }, delay);
    timer.unref();
  }

  schedule(initialDelayMinutes * 60 * 1000);
  logger.info(`Automated encrypted backups enabled; interval ${intervalHours} hour(s).`);
  return {
    enabled: true,
    sendBackup,
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

module.exports = {
  createBackupScheduler,
  decryptBackup,
  encryptBackup,
};
