require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { decryptBackup } = require("../backup");

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/decrypt-backup.js <backup.sqlite.enc> <output.sqlite>");
  process.exitCode = 2;
} else {
  try {
    const encrypted = fs.readFileSync(inputPath);
    const decrypted = decryptBackup(encrypted, process.env.BACKUP_ENCRYPTION_KEY);
    fs.writeFileSync(path.resolve(outputPath), decrypted, { flag: "wx" });
    console.log(`Restored encrypted backup to ${path.resolve(outputPath)}`);
  } catch (error) {
    console.error(`Could not restore encrypted backup: ${error.message}`);
    process.exitCode = 1;
  }
}