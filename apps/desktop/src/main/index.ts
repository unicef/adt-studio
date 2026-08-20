import "dotenv/config";
import { app, BrowserWindow, ipcMain, protocol } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { join } from "node:path";

import { createMainWindow } from "./windows/main";
import { createSplashWindow } from "./windows/splash";
import { createOnboardingWindow } from "./windows/onboarding";

import {
  startApiServer,
  stopApiServer,
  setLogForwarder,
  apiPort,
  isApiDebugMode,
} from "./api-server";

import { registerAppInfoIpc } from "./ipc/app-info";
import { registerTitleBarIpc } from "./ipc/title-bar";
import { registerWindowCloseIpc } from "./ipc/window-close";
import { registerFileDialogIpc } from "./ipc/file-dialog";
import { registerOnboardingIpc } from "./ipc/onboarding";
import { hasCompletedOnboarding } from "./services/onboarding-state";
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
import { initPostUpdateDetection } from "./services/update-state";
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
  initPostUpdateDetection();

  const splashWindow = createSplashWindow();

  registerStudioAppProtocol(join(__dirname, "../renderer"));
  registerHtmlRenderProtocol();
  registerTitleBarIpc();
  registerWindowCloseIpc();
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
    if (BrowserWindow.getAllWindows().length === 0) openMainWindow();
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

  let mainWindow: BrowserWindow | null = null;

  const openMainWindow = (
    startPath = "/",
    closeAfter?: BrowserWindow | null,
  ): BrowserWindow => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      if (closeAfter && !closeAfter.isDestroyed()) closeAfter.destroy();
      return mainWindow;
    }

    const win = createMainWindow(startPath);
    mainWindow = win;
    win.on("closed", () => {
      if (mainWindow === win) mainWindow = null;
    });

    win.once("ready-to-show", () => {
      if (!splashWindow.isDestroyed()) splashWindow.destroy();
      if (closeAfter && !closeAfter.isDestroyed()) closeAfter.destroy();
      checkForUpdates().catch(() => {});
    });

    return win;
  };

  // Single small onboarding window shared by first-run and the "Restart tour"
  // action. Focused if already open so repeated triggers never stack windows.
  let onboardingWindow: BrowserWindow | null = null;
  const openOnboardingWindow = (): BrowserWindow => {
    if (onboardingWindow && !onboardingWindow.isDestroyed()) {
      onboardingWindow.focus();
      return onboardingWindow;
    }
    // When replaying the tour, hide the main window so the small onboarding
    // window stands alone (as it does on first-run) instead of floating over
    // the live app. It is restored when the onboarding window closes.
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    const win = createOnboardingWindow();
    onboardingWindow = win;
    win.on("closed", () => {
      if (onboardingWindow === win) onboardingWindow = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
    return win;
  };

  registerOnboardingIpc(
    ({ startPath, window }) => {
      openMainWindow(startPath, window);
    },
    () => {
      openOnboardingWindow();
    },
  );

  if (hasCompletedOnboarding()) {
    openMainWindow();
  } else {
    const win = openOnboardingWindow();

    // The onboarding window is transparent + frameless and only reveals itself
    // on `ready-to-show`. If the renderer never loads (e.g. the dev server isn't
    // up yet, or a packaged asset fails), that event never fires and the user is
    // stranded on the splash with an invisible window. Fall back to the main app
    // window so first-run is always recoverable; onboarding stays unmarked and
    // shows again on the next launch.
    let recovered = false;
    const fallbackToMainWindow = () => {
      if (recovered) return;
      recovered = true;
      clearTimeout(readyGuard);
      if (!win.isDestroyed()) win.destroy();
      openMainWindow();
    };

    const readyGuard = setTimeout(() => {
      if (!win.isDestroyed() && !win.isVisible()) {
        fallbackToMainWindow();
      }
    }, 15000);

    win.once("ready-to-show", () => {
      clearTimeout(readyGuard);
      if (!splashWindow.isDestroyed()) splashWindow.destroy();
    });

    win.webContents.on(
      "did-fail-load",
      (_event, errorCode, _desc, _url, isMainFrame) => {
        // -3 (ERR_ABORTED) fires for superseded navigations, not real failures.
        if (isMainFrame && errorCode !== -3) fallbackToMainWindow();
      },
    );
  }
});

app.on("will-quit", () => {
  stopApiServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {

    app.quit();
    stopApiServer();

  }
});
