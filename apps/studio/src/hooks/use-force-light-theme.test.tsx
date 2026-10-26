// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { useForceLightTheme } from "./use-force-light-theme"
import { setThemeMode, THEME_KEY } from "@/lib/theme"

function Pipeline() {
  useForceLightTheme()
  return <div>pipeline</div>
}

const isDark = () => document.documentElement.classList.contains("dark")

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove("dark")
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  })
})

afterEach(() => {
  document.documentElement.classList.remove("dark")
  localStorage.clear()
})

describe("useForceLightTheme", () => {
  it("drops dark while mounted and restores the preference on the way out", () => {
    setThemeMode("dark")
    const view = render(<Pipeline />)
    expect(isDark()).toBe(false)
    view.unmount()
    expect(isDark()).toBe(true)
  })

  it("never darkens an app that was already light", () => {
    setThemeMode("light")
    const view = render(<Pipeline />)
    expect(isDark()).toBe(false)
    view.unmount()
    expect(isDark()).toBe(false)
  })

  it("honours a preference changed while the pipeline was open", () => {
    setThemeMode("dark")
    const view = render(<Pipeline />)
    expect(isDark()).toBe(false)
    // the user switches to light from inside the pipeline
    localStorage.setItem(THEME_KEY, "light")
    view.unmount()
    expect(isDark()).toBe(false)
  })

  it("suspends painting so an OS flip cannot repaint the pipeline", () => {
    setThemeMode("dark")
    const view = render(<Pipeline />)
    setThemeMode("dark") // a repaint attempt while suspended
    expect(isDark()).toBe(false)
    view.unmount()
    expect(isDark()).toBe(true)
  })
})
