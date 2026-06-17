import "dotenv/config";
import { app, BrowserWindow, ipcMain, protocol } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { join } from "node:path";

import { createMainWindow } from "./windows/main";
import { createSplashWindow } from "./windows/splash";

import {
  startApiServer,
  stopApiServer,
  setLogForwarder,
  apiPort,
  isApiDebugMode,
} from "./api-server";

import { registerAppInfoIpc } from "./ipc/app-info";
import { registerTitleBarIpc } from "./ipc/title-bar";
import { registerFileDialogIpc } from "./ipc/file-dialog";
import { registerSplashIpc } from "./ipc/splash";
import { registerUpdatesIpc } from "./ipc/updates";
import { handleScreenshotMessages } from "./ipc/api-bridge/screenshot";
import { handleAccessibilityAuditMessages } from "./ipc/api-bridge/accessibility-audit";

import {
  HTML_RENDER_SCHEME_PRIVILEGES,
  registerHtmlRenderProtocol,
} from "./protocols/html-render";
import {
  registerStudioAppProtocol,
  STUDIO_APP_SCHEME_PRIVILEGES,
} from "./protocols/studio-app";

import { checkForUpdates } from "./services/auto-updater";
import { setStartupError } from "./services/debug-info";

protocol.registerSchemesAsPrivileged([
  STUDIO_APP_SCHEME_PRIVILEGES,
  HTML_RENDER_SCHEME_PRIVILEGES,
]);

app.whenReady().then(async () => {
  const isBeta = app.getVersion().includes("-beta");
  electronApp.setAppUserModelId(
    isBeta ? "com.nees.adt-studio.beta" : "com.nees.adt-studio",
  );

  registerAppInfoIpc();
  registerSplashIpc();
  registerUpdatesIpc();

  const splashWindow = createSplashWindow();

  registerStudioAppProtocol(join(__dirname, "../renderer"));
  registerHtmlRenderProtocol();
  registerTitleBarIpc();
  registerFileDialogIpc();

  let apiProcess: Electron.UtilityProcess;

  try {
    apiProcess = (await startApiServer()).apiProcess;
  } catch (err) {
    setStartupError(err);
    throw err;
  }

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  apiProcess.on("message", handleScreenshotMessages(apiProcess));
  apiProcess.on("message", handleAccessibilityAuditMessages(apiProcess));

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });

  ipcMain.handle("api-debug-mode", () => isApiDebugMode);
  ipcMain.on("api-port", (event) => {
    event.returnValue = apiPort;
  });

  if (isApiDebugMode) {
    setLogForwarder((entry) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send("api-log", entry);
      });
    });
  }

  const mainWindow = createMainWindow();

  mainWindow.once("ready-to-show", () => {
    if (!splashWindow.isDestroyed()) {
      splashWindow.destroy();
    }

    checkForUpdates().catch(() => {});
  });
});

app.on("before-quit", () => {
  stopApiServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {

    app.quit();
    stopApiServer();

  }
});
