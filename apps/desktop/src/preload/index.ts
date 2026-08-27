import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ApiLogEntry } from '../main/api-server/types'
import type {
  AvailableRelease,
  UpdateStatus,
} from '../main/services/auto-updater'
import type { PostUpdateInfo } from '../main/services/update-state'

type ApiLogCallback = (entry: ApiLogEntry) => void
type MaximizeChangeCallback = (isMaximized: boolean) => void
type FullscreenChangeCallback = (isFullscreen: boolean) => void
type UpdateStatusCallback = (status: UpdateStatus) => void

export type ElectronPlatform = NodeJS.Platform

const windowControls = {
  minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: (): Promise<boolean> =>
    ipcRenderer.invoke('window:toggle-maximize'),
  close: (): Promise<void> => ipcRenderer.invoke('window:close'),
  confirmClose: (): void => ipcRenderer.send('window:confirm-close'),
  cancelClose: (): void => ipcRenderer.send('window:cancel-close'),
  onCloseRequested: (cb: () => void): (() => void) => {
    const handler = () => cb()
    ipcRenderer.on('window:close-requested', handler)
    return () => ipcRenderer.off('window:close-requested', handler)
  },
  isMaximized: (): Promise<boolean> =>
    ipcRenderer.invoke('window:is-maximized'),
  isFullscreen: (): Promise<boolean> =>
    ipcRenderer.invoke('window:is-fullscreen'),
  onMaximizeChange: (cb: MaximizeChangeCallback): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, isMaximized: boolean) =>
      cb(isMaximized)
    ipcRenderer.on('window:maximize-change', handler)
    return () => ipcRenderer.off('window:maximize-change', handler)
  },
  onFullscreenChange: (cb: FullscreenChangeCallback): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, isFullscreen: boolean) =>
      cb(isFullscreen)
    ipcRenderer.on('window:fullscreen-change', handler)
    return () => ipcRenderer.off('window:fullscreen-change', handler)
  },
}

const updates = {
  check: (): Promise<UpdateStatus> => ipcRenderer.invoke('updates:check'),
  download: (): Promise<UpdateStatus> => ipcRenderer.invoke('updates:download'),
  cancel: (): Promise<UpdateStatus> => ipcRenderer.invoke('updates:cancel'),
  install: (): Promise<void> => ipcRenderer.invoke('updates:install'),
  installOnQuit: (): Promise<void> =>
    ipcRenderer.invoke('updates:install-on-quit'),
  getStatus: (): Promise<UpdateStatus> =>
    ipcRenderer.invoke('updates:get-status'),
  listVersions: (force = false): Promise<AvailableRelease[]> =>
    ipcRenderer.invoke('updates:list-versions', force),
  selectVersion: (version: string): Promise<UpdateStatus> =>
    ipcRenderer.invoke('updates:select-version', version),
  getPostUpdate: (): Promise<PostUpdateInfo | null> =>
    ipcRenderer.invoke('updates:get-post-update'),
  onStatus: (cb: UpdateStatusCallback): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, status: UpdateStatus) =>
      cb(status)
    ipcRenderer.on('updates:status', handler)
    return () => ipcRenderer.off('updates:status', handler)
  },
}

const onboarding = {
  getStatus: (): Promise<boolean> =>
    ipcRenderer.invoke('onboarding:get-status'),
  finish: (startPath: string): Promise<void> =>
    ipcRenderer.invoke('onboarding:finish', startPath),
}

interface SaveFileDialogOptions {
  defaultPath?: string
  filters?: Array<{ name: string; extensions: string[] }>
}

const api = {
  onApiLog: (callback: ApiLogCallback): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, entry: ApiLogEntry) =>
      callback(entry)
    ipcRenderer.on('api-log', handler)
    return () => ipcRenderer.off('api-log', handler)
  },
  isApiDebugMode: (): Promise<boolean> => ipcRenderer.invoke('api-debug-mode'),
  saveFile: (
    options: SaveFileDialogOptions,
    data: Uint8Array,
  ): Promise<string | null> => ipcRenderer.invoke('file:save', options, data),
  get apiPort(): number {
    return ipcRenderer.sendSync('api-port')
  },
  get platform(): ElectronPlatform {
    return ipcRenderer.sendSync('app:platform') as ElectronPlatform
  },
  get version(): string {
    return ipcRenderer.sendSync('app:version') as string
  },
  get systemLocales(): string[] {
    return ipcRenderer.sendSync('app:system-locales') as string[]
  },
  windowControls,
  updates,
  onboarding,
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
