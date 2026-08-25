import { BrowserWindow, ipcMain, Notification } from "electron";

export interface StepNotificationPayload {
  title: string;
  body: string;
}

/**
 * OS-level notifications and window-focus queries for the Studio renderer.
 */
export function registerNotificationsIpc(): void {
  ipcMain.handle(
    "notifications:show",
    (_event, rawPayload: unknown): void => {
      const payload = rawPayload as Partial<StepNotificationPayload> | null;
      const title = typeof payload?.title === "string" ? payload.title : "";
      const body = typeof payload?.body === "string" ? payload.body : "";

      if (!title && !body) return;
      if (!Notification.isSupported()) return;

      new Notification({
        title: title || "ADT Studio",
        body,
      }).show();
    },
  );

  ipcMain.handle("window:is-focused", (event): boolean => {
    return BrowserWindow.fromWebContents(event.sender)?.isFocused() ?? false;
  });
}
