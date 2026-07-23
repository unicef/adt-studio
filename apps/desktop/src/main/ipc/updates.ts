import { BrowserWindow, ipcMain } from "electron";
import {
  cancelUpdate,
  checkForUpdates,
  deferInstallUntilQuit,
  downloadUpdate,
  getLastUpdateStatus,
  listAvailableVersions,
  onUpdateStatus,
  quitAndInstall,
  selectVersion,
  type UpdateStatus,
} from "../services/auto-updater";
import { consumePostUpdateInfo } from "../services/update-state";

const UPDATE_STATUS_CHANNEL = "updates:status";

export function registerUpdatesIpc(): () => void {
  ipcMain.handle("updates:check", () => checkForUpdates());
  ipcMain.handle("updates:download", () => downloadUpdate());
  ipcMain.handle("updates:cancel", () => cancelUpdate());
  ipcMain.handle("updates:install", () => {
    quitAndInstall();
  });
  ipcMain.handle("updates:install-on-quit", () => {
    deferInstallUntilQuit();
  });
  ipcMain.handle("updates:get-status", () => getLastUpdateStatus());
  ipcMain.handle("updates:list-versions", (_event, force?: boolean) =>
    listAvailableVersions(force === true),
  );
  ipcMain.handle("updates:select-version", (_event, version: unknown) => {
    if (typeof version !== "string") {
      throw new TypeError("Version must be a string");
    }
    return selectVersion(version);
  });
  ipcMain.handle("updates:get-post-update", () => consumePostUpdateInfo());

  return onUpdateStatus((status: UpdateStatus) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(UPDATE_STATUS_CHANNEL, status);
      }
    }
  });
}
