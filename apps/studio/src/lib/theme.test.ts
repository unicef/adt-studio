// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  applyStoredTheme,
  initTheme,
  paintTheme,
  readThemeMode,
  setThemeMode,
  setThemeSuspended,
  THEME_KEY,
} from "./theme"

const isDark = () => document.documentElement.classList.contains("dark")

/** Stand in for the OS colour-scheme preference. */
function mockSystemDark(dark: boolean, onChange?: (cb: () => void) => void) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: dark,
      addEventListener: (_: string, cb: () => void) => onChange?.(cb),
      removeEventListener: () => {},
    }),
  })
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove("dark")
  setThemeSuspended(false)
  mockSystemDark(false)
})

afterEach(() => {
  document.documentElement.classList.remove("dark")
  setThemeSuspended(false)
})

describe("theme preference", () => {
  it("defaults to light when nothing has been chosen", () => {
    expect(readThemeMode()).toBe("light")
    applyStoredTheme()
    expect(isDark()).toBe(false)
  })

  it("stores the choice and paints it", () => {
    setThemeMode("dark")
    expect(localStorage.getItem(THEME_KEY)).toBe("dark")
    expect(isDark()).toBe(true)
  })

  it("restores a stored dark preference on a fresh boot", () => {
    localStorage.setItem(THEME_KEY, "dark")
    expect(isDark()).toBe(false) // nothing painted yet
    initTheme()
    expect(isDark()).toBe(true)
  })

  it("ignores a corrupted stored value rather than painting nonsense", () => {
    localStorage.setItem(THEME_KEY, "chartreuse")
    expect(readThemeMode()).toBe("light")
    applyStoredTheme()
    expect(isDark()).toBe(false)
  })

  it("follows the OS when set to system", () => {
    mockSystemDark(true)
    setThemeMode("system")
    expect(isDark()).toBe(true)
    mockSystemDark(false)
    applyStoredTheme()
    expect(isDark()).toBe(false)
  })

  it("repaints when the OS flips and the mode is system", () => {
    let fire: (() => void) | undefined
    mockSystemDark(false, (cb) => { fire = cb })
    setThemeMode("system")
    initTheme()
    expect(isDark()).toBe(false)
    mockSystemDark(true, (cb) => { fire = cb })
    fire?.()
    expect(isDark()).toBe(true)
  })

  it("does not follow the OS when the user picked a fixed mode", () => {
    let fire: (() => void) | undefined
    mockSystemDark(false, (cb) => { fire = cb })
    setThemeMode("light")
    initTheme()
    mockSystemDark(true, (cb) => { fire = cb })
    fire?.()
    expect(isDark()).toBe(false)
  })

  it("paints nothing while suspended, so an opted-out screen stays put", () => {
    setThemeSuspended(true)
    paintTheme("dark")
    expect(isDark()).toBe(false)
    setThemeSuspended(false)
    paintTheme("dark")
    expect(isDark()).toBe(true)
  })
})
