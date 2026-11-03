const { app, BrowserWindow, dialog, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const userDataPath = path.join(app.getPath("appData"), "GoodForm Gym");
app.setPath("userData", userDataPath);
require("dotenv").config({
  path: path.join(app.isPackaged ? userDataPath : app.getAppPath(), ".env"),
});
const { createApplication } = require("../server");
const { createBackupScheduler } = require("../backup");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let application;
  let backupScheduler;
  let quitting = false;

  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });

  async function startServer() {
    const databasePath = process.env.DB_PATH
      ? path.resolve(process.env.DB_PATH)
      : app.isPackaged
        ? path.join(app.getPath("userData"), "gym.sqlite")
        : path.join(app.getAppPath(), "data", "gym.sqlite");
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    application = createApplication({ databasePath });
    await application.ready;
    backupScheduler = createBackupScheduler({ database: application.database });
    await new Promise((resolve, reject) => {
      application.server.once("error", reject);
      application.server.listen(Number(process.env.PORT || 3000), "127.0.0.1", resolve);
    });
    return `http://127.0.0.1:${application.server.address().port}`;
  }

  async function createWindow(appUrl) {
    const window = new BrowserWindow({
      width: 1360,
      height: 900,
      minWidth: 980,
      minHeight: 680,
      backgroundColor: "#f4f6f7",
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const trustedOrigin = new URL(appUrl).origin;

    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("https://")) shell.openExternal(url);
      return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
      if (new URL(url).origin !== trustedOrigin) {
        event.preventDefault();
        if (url.startsWith("https://")) shell.openExternal(url);
      }
    });
    window.once("ready-to-show", () => window.show());
    await window.loadURL(appUrl);
  }

  app.whenReady().then(async () => {
    const appUrl = await startServer();
    await createWindow(appUrl);
    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow(appUrl);
      }
    });
  }).catch((error) => {
    dialog.showErrorBox("GoodForm Gym could not start", error.message);
    app.quit();
  });

  app.on("before-quit", (event) => {
    if (application && !quitting) {
      event.preventDefault();
      quitting = true;
      backupScheduler?.stop();
      application.close().finally(() => app.quit());
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}