import { app, ipcMain } from "electron";

/**
 * Process-level info exposed via sync IPC. Must be registered before any window is created
 * so the splash window's preload can read it during initial render.
 */
export function registerAppInfoIpc(): void {
  ipcMain.on("app:platform", (event) => {
    event.returnValue = process.platform;
  });

  ipcMain.on("app:version", (event) => {
    event.returnValue = app.getVersion();
  });

  // OS languages in the user's preference order (e.g. ["pt-BR", "en-US"]).
  // Used by the renderer to pick a default UI locale on first launch.
  ipcMain.on("app:system-locales", (event) => {
    const preferred = app.getPreferredSystemLanguages();
    event.returnValue = preferred.length > 0 ? preferred : [app.getLocale()];
  });
}
