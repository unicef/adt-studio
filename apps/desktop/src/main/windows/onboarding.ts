import { BrowserWindow, shell } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { STUDIO_APP_ORIGIN } from "../protocols/studio-app";

export const ONBOARDING_WINDOW_WIDTH = 900;
export const ONBOARDING_WINDOW_HEIGHT = 620;

/**
 * Small, fixed-size, frameless window that hosts the first-run onboarding
 * experience over the desktop (Aside-style). It loads the Studio SPA at the
 * `/onboarding` route and stays non-resizable so the flow always renders at its
 * intended size. On completion the main process closes it and opens the real
 * app window (see `ipc/onboarding.ts`).
 */
export function createOnboardingWindow(): BrowserWindow {
  const onboardingWindow = new BrowserWindow({
    width: ONBOARDING_WINDOW_WIDTH,
    height: ONBOARDING_WINDOW_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: true,
    center: true,
    show: false,
    hasShadow: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      devTools: true,
    },
  });

  onboardingWindow.on("ready-to-show", () => {
    onboardingWindow.show();
  });

  onboardingWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env.NODE_ENV === "development") {
    onboardingWindow.loadURL("http://localhost:5173/onboarding");
  } else {
    onboardingWindow.loadURL(`${STUDIO_APP_ORIGIN}/onboarding`);
  }

  return onboardingWindow;
}
