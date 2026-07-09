import { ElectronAPI } from '@electron-toolkit/preload'
import type { ApiLogEntry } from '../main/api-server/types'
import type { UpdateStatus } from '../main/services/auto-updater'
import type { PostUpdateInfo } from '../main/services/update-state'
import type { DebugSnapshot } from '../main/services/debug-info'

export type ElectronPlatform = NodeJS.Platform

export interface WindowControlsApi {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<boolean>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  isFullscreen: () => Promise<boolean>
  onMaximizeChange: (cb: (isMaximized: boolean) => void) => () => void
  onFullscreenChange: (cb: (isFullscreen: boolean) => void) => () => void
}

export interface SaveFileDialogOptions {
  defaultPath?: string
  filters?: Array<{ name: string; extensions: string[] }>
}

export interface UpdatesApi {
  check: () => Promise<UpdateStatus>
  download: () => Promise<UpdateStatus>
  cancel: () => Promise<UpdateStatus>
  install: () => Promise<void>
  installOnQuit: () => Promise<void>
  getStatus: () => Promise<UpdateStatus>
  getPostUpdate: () => Promise<PostUpdateInfo | null>
  onStatus: (cb: (status: UpdateStatus) => void) => () => void
}

export interface SplashControlsApi {
  relaunch: () => Promise<void>
  quit: () => Promise<void>
  getDebugInfo: () => Promise<DebugSnapshot>
  copyDebugInfo: () => Promise<string>
  saveDebugInfo: () => Promise<string | null>
  readonly version: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      onApiLog: (callback: (entry: ApiLogEntry) => void) => () => void
      isApiDebugMode: () => Promise<boolean>
      saveFile: (options: SaveFileDialogOptions, data: Uint8Array) => Promise<string | null>
      apiPort: number
      platform: ElectronPlatform
      version: string
      windowControls: WindowControlsApi
      updates: UpdatesApi
    }
    splashControls?: SplashControlsApi
  }
}
