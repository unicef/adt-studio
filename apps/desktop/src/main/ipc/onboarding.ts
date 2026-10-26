import { BrowserWindow, ipcMain } from "electron";
import {
  hasCompletedOnboarding,
  markOnboardingCompleted,
} from "../services/onboarding-state";

export interface OnboardingFinishRequest {
  /** Route the main app window should open on, e.g. "/" or "/books/new". */
  startPath: string;
  /** The onboarding window that requested completion (if still alive). */
  window: BrowserWindow | null;
}

type FinishHandler = (request: OnboardingFinishRequest) => void;
type OpenHandler = () => void;

/**
 * Wires the renderer's onboarding bridge to the main process. `onFinish` is
 * responsible for the window transition (open the main app window, close the
 * onboarding window) so window ownership stays in the app entry point. `onOpen`
 * launches the small onboarding window on demand — used by "Restart tour" so
 * the replay renders at its intended size instead of inside the main window.
 */
export function registerOnboardingIpc(
  onFinish: FinishHandler,
  onOpen: OpenHandler,
): void {
  ipcMain.handle("onboarding:get-status", () => hasCompletedOnboarding());

  ipcMain.handle("onboarding:open", () => {
    onOpen();
  });

  ipcMain.handle("onboarding:finish", (event, rawStartPath?: unknown) => {
    markOnboardingCompleted();
    const startPath =
      typeof rawStartPath === "string" && rawStartPath.startsWith("/")
        ? rawStartPath
        : "/";
    const window = BrowserWindow.fromWebContents(event.sender);
    onFinish({ startPath, window });
  });
}
