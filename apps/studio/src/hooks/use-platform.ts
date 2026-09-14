import { useMemo } from "react"

export type DesktopOS = "windows" | "macos" | "linux"

function resolveDesktopOS(): DesktopOS {
  if (typeof window !== "undefined" && window.api?.platform) {
    switch (window.api.platform) {
      case "darwin":
        return "macos"
      case "win32":
        return "windows"
      default:
        return "linux"
    }
  }

  if (typeof navigator === "undefined") return "linux"
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes("mac")) return "macos"
  if (ua.includes("win")) return "windows"
  return "linux"
}

/**
 * Detected desktop OS. Stable across renders — platform can't change at runtime.
 */
export function usePlatform(): DesktopOS {
  return useMemo(() => resolveDesktopOS(), [])
}

// eslint-disable-next-line lingui/no-unlocalized-strings -- key glyphs, same in every locale
const MODIFIER_LABEL: Record<DesktopOS, string> = { macos: "⌘", windows: "Ctrl", linux: "Ctrl" }

/**
 * The primary shortcut modifier as it is printed in shortcut hints — the Command
 * glyph on macOS, `Ctrl` everywhere else. Handlers accept both regardless.
 */
export function useModifierKey(): string {
  return MODIFIER_LABEL[usePlatform()]
}

/**
 * A modifier combo as one printable token: the Command glyph sits flush against
 * the key ("⌘K"), while a spelled-out modifier needs a separator ("Ctrl+K").
 */
export function useShortcutLabel(key: string): string {
  const os = usePlatform()
  return os === "macos" ? `${MODIFIER_LABEL[os]}${key}` : `${MODIFIER_LABEL[os]}+${key}`
}
