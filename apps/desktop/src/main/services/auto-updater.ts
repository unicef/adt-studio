import { app, BrowserWindow } from "electron";
import {
  autoUpdater,
  CancellationToken,
  type ProgressInfo,
  type UpdateInfo,
} from "electron-updater";
import { stripReleaseSourceSection } from "@root/scripts/release-source-notes.mjs";
import {
  betaReleaseDownloadUrl,
  fetchBetaReleaseCatalog,
  isBetaReleaseVersion,
  type AvailableRelease,
  type BetaRelease,
} from "./release-catalog";
import { recordPendingInstall } from "./update-state";

export type { AvailableRelease } from "./release-catalog";

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

const listeners = new Set<StatusListener>();
let lastStatus: UpdateStatus = { phase: "idle" };
let lastInfo: UpdateInfo | null = null;
let cancellationToken: CancellationToken | null = null;
let betaReleases: BetaRelease[] = [];
let activeBetaRelease: BetaRelease | null = null;

function normalizeReleaseNotes(
  notes: UpdateInfo["releaseNotes"],
): string | undefined {
  if (!notes) return undefined;
  const normalized =
    typeof notes === "string"
      ? notes
      : notes
          .map((entry) =>
            typeof entry === "string" ? entry : (entry.note ?? ""),
          )
          .filter(Boolean)
          .join("\n\n");
  return stripReleaseSourceSection(normalized);
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
    releaseNotes:
      normalizeReleaseNotes(lastInfo.releaseNotes) ??
      activeBetaRelease?.releaseNotes,
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
  const isBeta = isBetaReleaseVersion(app.getVersion());

  configured = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = isBeta;
  autoUpdater.channel = isBeta ? "beta" : "latest";
  autoUpdater.allowDowngrade = isBeta;
  autoUpdater.logger = console;

  autoUpdater.on("checking-for-update", () => {
    emit({ phase: "checking" });
  });

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    // A beta build must stay on the beta track. If a stable release ever shows
    // up on the channel feed, ignore it — installing it would silently turn a
    // beta install into a stable one. Stable installs already ignore betas via
    // `allowPrerelease = false`, so this guard only matters for beta builds.
    if (isBeta && !isBetaReleaseVersion(info.version)) {
      lastInfo = null;
      emit({ phase: "not-available" });
      return;
    }
    lastInfo = info;
    const totalBytes = info.files?.[0]?.size;
    emit({
      phase: "available",
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes:
        normalizeReleaseNotes(info.releaseNotes) ??
        activeBetaRelease?.releaseNotes,
      totalBytes,
    });
  });

  autoUpdater.on("update-not-available", () => {
    lastInfo = null;
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
    const releaseNotes =
      normalizeReleaseNotes(info.releaseNotes) ??
      activeBetaRelease?.releaseNotes;
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
    if (isBetaReleaseVersion(app.getVersion())) {
      betaReleases = await fetchBetaReleaseCatalog(app.getVersion());
      const newestUpgrade = betaReleases.find(
        (release) => release.direction === "upgrade",
      );
      if (!newestUpgrade) {
        lastInfo = null;
        emit({ phase: "not-available" });
        return lastStatus;
      }
      return await checkBetaRelease(newestUpgrade);
    }

    activeBetaRelease = null;
    await autoUpdater.checkForUpdates();
    return lastStatus;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ phase: "error", message });
    return lastStatus;
  }
}

export async function listAvailableVersions(
  force = false,
): Promise<AvailableRelease[]> {
  if (!isBetaReleaseVersion(app.getVersion())) return [];

  betaReleases = await fetchBetaReleaseCatalog(app.getVersion(), { force });
  return betaReleases.map(
    ({ tagName: _tagName, updaterChannel: _updaterChannel, ...release }) =>
      release,
  );
}

export async function selectVersion(version: string): Promise<UpdateStatus> {
  if (!app.isPackaged || !isBetaReleaseVersion(app.getVersion())) {
    emit({ phase: "not-available" });
    return lastStatus;
  }

  configure();

  try {
    if (!betaReleases.some((release) => release.version === version)) {
      betaReleases = await fetchBetaReleaseCatalog(app.getVersion());
    }
    const target = betaReleases.find((release) => release.version === version);
    if (!target) {
      throw new Error("The selected beta version is no longer available");
    }
    return await checkBetaRelease(target);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({ phase: "error", message });
    return lastStatus;
  }
}

async function checkBetaRelease(target: BetaRelease): Promise<UpdateStatus> {
  lastInfo = null;
  activeBetaRelease = target;
  autoUpdater.allowPrerelease = true;
  autoUpdater.allowDowngrade = true;
  autoUpdater.channel = target.updaterChannel;
  // Host-pinning is load-bearing: betaReleaseDownloadUrl builds the feed from a
  // hardcoded github.com/unicef/adt-studio host and only varies the URL-encoded
  // tag. Never let a catalog-supplied field flow into the host, or a malicious
  // catalog entry could redirect the update feed off the official repo.
  autoUpdater.setFeedURL({
    provider: "generic",
    url: betaReleaseDownloadUrl(target),
  });
  await autoUpdater.checkForUpdates();
  return lastStatus;
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
