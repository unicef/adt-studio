import { app, BrowserWindow } from "electron";
import {
  autoUpdater,
  CancellationToken,
  type ProgressInfo,
  type UpdateInfo,
} from "electron-updater";
import { recordPendingInstall } from "./update-state";

export type UpdateStatus =
  | { phase: "idle" }
  | { phase: "checking" }
  | {
      phase: "available";
      version: string;
      releaseDate?: string;
      releaseNotes?: string;
      totalBytes?: number;
    }
  | { phase: "not-available" }
  | {
      phase: "downloading";
      version: string;
      percent: number;
      bytesPerSecond: number;
      transferred: number;
      total: number;
    }
  | { phase: "downloaded"; version: string; releaseNotes?: string }
  | { phase: "installing"; version: string }
  | { phase: "error"; message: string };

type StatusListener = (status: UpdateStatus) => void;

function isPrereleaseVersion(version: string): boolean {
  return version.includes("-beta");
}

const listeners = new Set<StatusListener>();
let lastStatus: UpdateStatus = { phase: "idle" };
let lastInfo: UpdateInfo | null = null;
let cancellationToken: CancellationToken | null = null;

function normalizeReleaseNotes(notes: UpdateInfo["releaseNotes"]): string | undefined {
  if (!notes) return undefined;
  if (typeof notes === "string") return notes;
  return notes
    .map((entry) => (typeof entry === "string" ? entry : entry.note ?? ""))
    .filter(Boolean)
    .join("\n\n");
}

function emit(status: UpdateStatus): void {
  lastStatus = status;
  for (const fn of listeners) fn(status);
}

function emitAvailableFromLastInfo(): void {
  if (!lastInfo) {
    emit({ phase: "not-available" });
    return;
  }
  emit({
    phase: "available",
    version: lastInfo.version,
    releaseDate: lastInfo.releaseDate,
    releaseNotes: normalizeReleaseNotes(lastInfo.releaseNotes),
    totalBytes: lastInfo.files?.[0]?.size,
  });
}

export function onUpdateStatus(fn: StatusListener): () => void {
  listeners.add(fn);
  fn(lastStatus);
  return () => listeners.delete(fn);
}

export function getLastUpdateStatus(): UpdateStatus {
  return lastStatus;
}

export function broadcastToAllWindows(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

let configured = false;

function configure(): void {
  if (configured) return;
  const isBeta = isPrereleaseVersion(app.getVersion());

  configured = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = isBeta;
  autoUpdater.channel = isBeta ? "beta" : "latest";
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = console;

  autoUpdater.on("checking-for-update", () => {
    emit({ phase: "checking" });
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    // A beta build must stay on the beta track. If a stable release ever shows
    // up on the channel feed, ignore it — installing it would silently turn a
    // beta install into a stable one. Stable installs already ignore betas via
    // `allowPrerelease = false`, so this guard only matters for beta builds.
    if (isBeta && !isPrereleaseVersion(info.version)) {
      emit({ phase: "not-available" });
      return;
    }
    lastInfo = info;
    const totalBytes = info.files?.[0]?.size;
    emit({
      phase: "available",
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      totalBytes,
    });
  });

  autoUpdater.on("update-not-available", () => {
    emit({ phase: "not-available" });
  });

  autoUpdater.on("download-progress", (progress: ProgressInfo) => {
    emit({
      phase: "downloading",
      version: lastInfo?.version ?? "",
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    lastInfo = info;
    const releaseNotes = normalizeReleaseNotes(info.releaseNotes);
    recordPendingInstall(info.version, releaseNotes);
    emit({
      phase: "downloaded",
      version: info.version,
      releaseNotes,
    });
  });

  autoUpdater.on("error", (err: Error) => {
    if (cancellationToken?.cancelled) return;
    emit({ phase: "error", message: err?.message ?? String(err) });
  });
}

/**
 * Check for updates without blocking startup. Does not download — the renderer
 * decides whether to download via {@link downloadUpdate}.
 *
 * Skipped silently when running unpacked / in dev (no installer to update).
 */
export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    emit({ phase: "not-available" });
    return lastStatus;
  }

  configure();

  try {
    await autoUpdater.checkForUpdates();
    return lastStatus;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ phase: "error", message });
    return lastStatus;
  }
}

/**
 * Begin downloading the update. Progress is reported via {@link onUpdateStatus}.
 * No-op if no update is currently available.
 */
export async function downloadUpdate(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    return lastStatus;
  }

  configure();

  if (lastStatus.phase !== "available") {
    return lastStatus;
  }

  cancellationToken = new CancellationToken();

  try {
    await autoUpdater.downloadUpdate(cancellationToken);
    return lastStatus;
  } catch (err) {
    if (cancellationToken?.cancelled) {
      emitAvailableFromLastInfo();
      return lastStatus;
    }
    const message = err instanceof Error ? err.message : String(err);
    emit({ phase: "error", message });
    return lastStatus;
  } finally {
    cancellationToken = null;
  }
}

export function cancelUpdate(): UpdateStatus {
  if (lastStatus.phase !== "downloading") return lastStatus;

  cancellationToken?.cancel();
  emitAvailableFromLastInfo();
  return lastStatus;
}

/**
 * Quit and install the downloaded update. Caller must ensure the update was
 * actually downloaded (status `downloaded`) before invoking.
 */
export function quitAndInstall(): void {
  if (lastStatus.phase !== "downloaded") return;
  const version = lastStatus.version;
  emit({ phase: "installing", version });
  autoUpdater.quitAndInstall(true, true);
}

/**
 * Defer install: keep the downloaded update on disk and let electron-updater
 * apply it the next time the user quits the app normally.
 */
export function deferInstallUntilQuit(): void {
  if (lastStatus.phase !== "downloaded") return;
  autoUpdater.autoInstallOnAppQuit = true;
}
