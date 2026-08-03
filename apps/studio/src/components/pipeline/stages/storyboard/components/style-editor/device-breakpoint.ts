import { useEffect, useState } from "react"
import {
  PREVIEW_VIEWPORT_WIDTHS,
  type PreviewViewport,
} from "@/components/pipeline/components/preview-viewport"

export type DeviceView = PreviewViewport

export const DEVICE_WIDTHS = PREVIEW_VIEWPORT_WIDTHS

// Tablet uses `max-lg:` (fires below 1024px) so it applies at the 768px
// iframe — `max-md:` would not.
export function deviceToPrefix(view: DeviceView): string {
  switch (view) {
    case "desktop":
      return ""
    case "tablet":
      return "max-lg:"
    case "mobile":
      return "max-sm:"
  }
}

export function getCascadePrefixes(view: DeviceView): readonly string[] {
  switch (view) {
    case "desktop":
      return [""]
    case "tablet":
      return ["max-lg:", ""]
    case "mobile":
      return ["max-sm:", "max-lg:", ""]
  }
}

export function getWiderPrefixes(view: DeviceView): readonly string[] {
  return getCascadePrefixes(view).slice(1)
}

export function prefixToBreakpointLabel(prefix: string): DeviceView {
  if (prefix === "max-lg:") return "tablet"
  if (prefix === "max-sm:") return "mobile"
  return "desktop"
}

const STORAGE_KEY_PREFIX = "adt-storyboard-device-view"

function isDeviceView(v: unknown): v is DeviceView {
  return v === "desktop" || v === "tablet" || v === "mobile"
}

export function useDeviceView(
  scope: string,
  initial: DeviceView = "desktop"
): [DeviceView, (next: DeviceView) => void] {
  const storageKey = `${STORAGE_KEY_PREFIX}:${scope}`

  const [view, setView] = useState<DeviceView>(() => {
    if (typeof window === "undefined") return initial
    try {
      const stored = window.localStorage.getItem(storageKey)
      return isDeviceView(stored) ? stored : initial
    } catch {
      // localStorage can throw in private mode / disabled storage — fall back to default.
      return initial
    }
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const stored = window.localStorage.getItem(storageKey)
      setView(isDeviceView(stored) ? stored : initial)
    } catch {
      // localStorage can throw in private mode / disabled storage — keep current view.
    }
  }, [storageKey, initial])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, view)
    } catch {
      // localStorage can throw on quota / private mode — persistence is best-effort.
    }
  }, [storageKey, view])

  return [view, setView]
}
