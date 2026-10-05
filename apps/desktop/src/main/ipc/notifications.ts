import { BrowserWindow, ipcMain, Notification } from "electron";

export interface StageNotificationPayload {
  title: string;
  body: string;
  label?: string;
  stage?: string;
}

// Electron destroys the native banner when its wrapper is collected, taking the
// click handler with it, so pending notifications are held here until the user
// dismisses or activates them. macOS does not always emit "close" for a banner
// the user ignores, hence the bound: nobody clicks through to a stage that
// finished this many runs ago.
const PENDING_LIMIT = 32;
const pending = new Set<Notification>();

/**
 * OS-level notifications and window-focus queries for the Studio renderer.
 */
export function registerNotificationsIpc(): void {
  ipcMain.handle(
    "notifications:show",
    (event, rawPayload: unknown): boolean => {
      const payload = rawPayload as Partial<StageNotificationPayload> | null;
      const title = typeof payload?.title === "string" ? payload.title : "";
      const body = typeof payload?.body === "string" ? payload.body : "";

      // Reports only whether the platform has a notification service. Electron
      // exposes no way to see a per-app permission denial (macOS), so a denied
      // banner still reports true.
      if (!title && !body) return false;
      if (!Notification.isSupported()) return false;

      const label = typeof payload?.label === "string" ? payload.label : "";
      const stage = typeof payload?.stage === "string" ? payload.stage : "";

      const notification = new Notification({
        title: title || "ADT Studio",
        body,
      });
      pending.add(notification);
      while (pending.size > PENDING_LIMIT) {
        const oldest = pending.values().next();
        if (oldest.done) break;
        pending.delete(oldest.value);
      }

      const release = () => pending.delete(notification);
      notification.on("close", release);
      notification.on("failed", release);

      notification.on("click", () => {
        release();
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window) {
          if (window.isMinimized()) window.restore();
          window.show();
          window.focus();
        }
        if (label && stage && !event.sender.isDestroyed()) {
          event.sender.send("notifications:activated", { label, stage });
        }
      });

      notification.show();
      return true;
    },
  );

  ipcMain.handle("window:is-focused", (event): boolean => {
    return BrowserWindow.fromWebContents(event.sender)?.isFocused() ?? false;
  });
}
