import { useSyncExternalStore } from "react"

export const TOAST_POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const

export type ToastPosition = (typeof TOAST_POSITIONS)[number]

export const AUTO_DISMISS_DELAYS = [4, 6, 10] as const

export interface NotificationPrefs {
  position: ToastPosition
  sound: boolean
  autoDismiss: boolean
  autoDelay: number
}

const STORAGE_KEY = "adt.notifications"

const DEFAULTS: NotificationPrefs = {
  position: "bottom-right",
  sound: true,
  autoDismiss: true,
  autoDelay: 4,
}

function read(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>
    return {
      position: TOAST_POSITIONS.includes(parsed.position as ToastPosition)
        ? (parsed.position as ToastPosition)
        : DEFAULTS.position,
      sound: typeof parsed.sound === "boolean" ? parsed.sound : DEFAULTS.sound,
      autoDismiss: typeof parsed.autoDismiss === "boolean" ? parsed.autoDismiss : DEFAULTS.autoDismiss,
      autoDelay: AUTO_DISMISS_DELAYS.includes(parsed.autoDelay as (typeof AUTO_DISMISS_DELAYS)[number])
        ? (parsed.autoDelay as number)
        : DEFAULTS.autoDelay,
    }
  } catch {
    return DEFAULTS
  }
}

let current = read()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return
    current = read()
    emit()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getNotificationPrefs(): NotificationPrefs {
  return current
}

export function setNotificationPrefs(patch: Partial<NotificationPrefs>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    /* ignore */
  }
  emit()
}

export function useNotificationPrefs() {
  return [useSyncExternalStore(subscribe, getNotificationPrefs), setNotificationPrefs] as const
}
