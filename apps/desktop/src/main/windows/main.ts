import { app, shell, BrowserWindow, dialog } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import icon from "../../../build/icon.png?asset";
import betaIcon from "../../../build/beta-icons/icon.png?asset";
import { STUDIO_APP_ORIGIN } from "../protocols/studio-app";

const appIcon = app.getVersion().includes("-beta") ? betaIcon : icon;

function platformWindowOptions(): Partial<Electron.BrowserWindowConstructorOptions> {
  switch (process.platform) {
    case "darwin":
      return {
        titleBarStyle: "hiddenInset",
        trafficLightPosition: { x: 14, y: 14 },
      };
    case "win32":
    case "linux":
    default:
      return {
        frame: false,
      };
  }
}

export function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#fff",
    ...platformWindowOptions(),
    ...(process.platform === "linux" ? { icon: appIcon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      devTools: true,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.on("will-prevent-unload", async (event) => {
    // TODO: ADD TRANSLATIONS
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      buttons: ["Stay", "Quit"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      message: "Leave the app?",
      detail: "Your current progress will be lost.",
    });

    if (response === 1) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  const broadcastMaximized = () => {
    mainWindow.webContents.send("window:maximize-change", mainWindow.isMaximized());
  };
  mainWindow.on("maximize", broadcastMaximized);
  mainWindow.on("unmaximize", broadcastMaximized);
  mainWindow.on("enter-full-screen", () =>
    mainWindow.webContents.send("window:fullscreen-change", true),
  );
  mainWindow.on("leave-full-screen", () =>
    mainWindow.webContents.send("window:fullscreen-change", false),
  );

  const STUDIO_DEV_URL = "http://localhost:5173";

  if (is.dev && process.env.NODE_ENV === "development") {
    mainWindow.loadURL(STUDIO_DEV_URL);
  } else {
    mainWindow.loadURL(`${STUDIO_APP_ORIGIN}/`);
  }

  return mainWindow;
}
