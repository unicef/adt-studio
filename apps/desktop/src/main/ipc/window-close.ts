import { app, ipcMain, BrowserWindow } from "electron";

const confirmedWindows = new WeakSet<BrowserWindow>();

let isQuitting = false;

app.on("before-quit", () => {
  isQuitting = true;
});

export function attachCloseGuard(window: BrowserWindow): void {
  window.webContents.on("will-prevent-unload", (event) => {
    if (confirmedWindows.has(window)) {
      confirmedWindows.delete(window);
      event.preventDefault();
      return;
    }
    window.webContents.send("window:close-requested");
  });
}

export function registerWindowCloseIpc(): void {
  ipcMain.on("window:confirm-close", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    confirmedWindows.add(window);
    if (isQuitting) {
      app.quit();
    } else {
      window.close();
    }
  });

  ipcMain.on("window:cancel-close", () => {
    isQuitting = false;
  });
}
