/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORKSPACE_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "*.po" {
  import type { Messages } from "@lingui/core"
  const messages: Messages
  export { messages }
}

declare module "axe-core/locales/*.json" {
  const data: {
    rules?: Record<string, { help?: string; description?: string }>
  }
  export default data
}

interface ElectronApiLogEntry {
  stream: "stdout" | "stderr"
  line: string
  timestamp: number
}

/**
 * The same values Node.js exposes via `process.platform`. Mirrors
 * `NodeJS.Platform` without requiring a node types dependency in the studio.
 */
type ElectronPlatform =
  | "aix"
  | "android"
  | "darwin"
  | "freebsd"
  | "haiku"
  | "linux"
  | "openbsd"
  | "sunos"
  | "win32"
  | "cygwin"
  | "netbsd"

interface ElectronWindowControls {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<boolean>
  close: () => Promise<void>
  confirmClose: () => void
  cancelClose: () => void
  onCloseRequested: (cb: () => void) => () => void
  isMaximized: () => Promise<boolean>
  isFullscreen: () => Promise<boolean>
  onMaximizeChange: (cb: (isMaximized: boolean) => void) => () => void
  onFullscreenChange: (cb: (isFullscreen: boolean) => void) => () => void
}

interface ElectronSaveFileDialogOptions {
  defaultPath?: string
  filters?: Array<{ name: string; extensions: string[] }>
}

type ElectronUpdateStatus =
  | { phase: "idle" }
  | { phase: "checking" }
  | {
      phase: "available"
      version: string
      releaseDate?: string
      releaseNotes?: string
      totalBytes?: number
    }
  | { phase: "not-available" }
  | {
      phase: "downloading"
      version: string
      percent: number
      bytesPerSecond: number
      transferred: number
      total: number
    }
  | { phase: "downloaded"; version: string; releaseNotes?: string }
  | { phase: "installing"; version: string }
  | { phase: "error"; message: string }

interface ElectronAvailableRelease {
  version: string
  title?: string
  description?: string
  coverUrl?: string
  coverAlt?: string
  releaseDate?: string
  releaseNotes?: string
  totalBytes?: number
  source?: ElectronReleaseSource
  direction: "upgrade" | "current" | "downgrade"
}

interface ElectronReleaseSourcePullRequest {
  number: number
  url: string
  headRef?: string
  baseRef?: string
  author?: string
  title?: string
}

interface ElectronReleaseSourceCommit {
  sha: string
  url: string
  subject?: string
}

interface ElectronReleaseSource {
  branch?: string
  title?: string
  description?: string
  coverUrl?: string
  buildCommit?: ElectronReleaseSourceCommit
  changeCommit?: ElectronReleaseSourceCommit
  prs: ElectronReleaseSourcePullRequest[]
  compare?: { label: string; url: string }
}

interface ElectronPostUpdateInfo {
  version: string
  releaseNotes?: string
}

interface ElectronUpdatesApi {
  check: () => Promise<ElectronUpdateStatus>
  download: () => Promise<ElectronUpdateStatus>
  cancel: () => Promise<ElectronUpdateStatus>
  install: () => Promise<void>
  installOnQuit: () => Promise<void>
  getStatus: () => Promise<ElectronUpdateStatus>
  listVersions: (force?: boolean) => Promise<ElectronAvailableRelease[]>
  selectVersion: (version: string) => Promise<ElectronUpdateStatus>
  getPostUpdate: () => Promise<ElectronPostUpdateInfo | null>
  onStatus: (cb: (status: ElectronUpdateStatus) => void) => () => void
}

interface Window {
  api: {
    onApiLog: (callback: (entry: ElectronApiLogEntry) => void) => () => void
    isApiDebugMode: () => Promise<boolean>
    /**
     * Show a native save-file dialog and write `data` to the chosen path.
     * Resolves to the saved path, or `null` if the user canceled.
     */
    saveFile?: (
      options: ElectronSaveFileDialogOptions,
      data: Uint8Array,
    ) => Promise<string | null>
    apiPort: number
    /** `process.platform` of the Electron main process. Undefined in the web build. */
    platform?: ElectronPlatform
    /** Application version from the Electron main process. Undefined in the web build. */
    version?: string
    /** IPC bridge for custom title bar controls. Undefined in the web build. */
    windowControls?: ElectronWindowControls
    /** IPC bridge for desktop auto-updater. Undefined in the web build. */
    updates?: ElectronUpdatesApi
  }
}
