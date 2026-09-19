// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { renderHook } from "@testing-library/react"
import { useModifierKey, usePlatform, useShortcutLabel } from "./use-platform"

const COMMAND = "⌘"

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true })
}

function setElectronPlatform(platform: string | undefined) {
  Object.defineProperty(window, "api", {
    value: platform ? { platform } : undefined,
    configurable: true,
  })
}

const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"
const WINDOWS_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"
const LINUX_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36"

afterEach(() => {
  setElectronPlatform(undefined)
  setUserAgent(MAC_UA)
})

describe("usePlatform", () => {
  it("prefers the Electron main process platform over the user agent", () => {
    setUserAgent(MAC_UA)
    setElectronPlatform("win32")
    expect(renderHook(() => usePlatform()).result.current).toBe("windows")
  })

  it.each([
    [MAC_UA, "macos"],
    [WINDOWS_UA, "windows"],
    [LINUX_UA, "linux"],
  ])("falls back to the user agent in the web build (%s)", (ua, expected) => {
    setElectronPlatform(undefined)
    setUserAgent(ua)
    expect(renderHook(() => usePlatform()).result.current).toBe(expected)
  })
})

describe("shortcut labels", () => {
  it("prints the Command glyph on macOS and Ctrl elsewhere", () => {
    setUserAgent(MAC_UA)
    expect(renderHook(() => useModifierKey()).result.current).toBe(COMMAND)

    setUserAgent(WINDOWS_UA)
    expect(renderHook(() => useModifierKey()).result.current).toBe("Ctrl")

    setUserAgent(LINUX_UA)
    expect(renderHook(() => useModifierKey()).result.current).toBe("Ctrl")
  })

  it("joins a spelled-out modifier with a separator, the glyph without one", () => {
    setUserAgent(MAC_UA)
    expect(renderHook(() => useShortcutLabel("K")).result.current).toBe(`${COMMAND}K`)

    setUserAgent(WINDOWS_UA)
    expect(renderHook(() => useShortcutLabel("K")).result.current).toBe("Ctrl+K")
  })
})
