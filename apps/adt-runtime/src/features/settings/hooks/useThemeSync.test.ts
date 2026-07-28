// @vitest-environment jsdom
import { getDefaultStore } from "jotai"
import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { themeAtom } from "@/shared/state/ui.atoms"
import { useThemeSync } from "./useThemeSync"

const store = getDefaultStore()

function chromeContainers() {
  document.body.innerHTML = `<div id="interface-container"></div><div id="nav-container"></div>`
  return ["interface-container", "nav-container"].map(
    (id) => document.getElementById(id) as HTMLElement,
  )
}

beforeEach(() => {
  store.set(themeAtom, "dark")
})
afterEach(() => {
  document.body.innerHTML = ""
})

describe("useThemeSync", () => {
  it("applies the dark chrome outside kids mode", () => {
    const els = chromeContainers()
    store.set(appConfigAtom, { features: { kidsMode: false } })

    renderHook(() => useThemeSync())

    for (const el of els) {
      expect(el.classList.contains("dark")).toBe(true)
      expect(el.dataset.theme).toBe("dark")
    }
  })

  // Kids mode is an all-light palette with no dark treatment. Popovers and
  // tooltips portal into these containers, so leaving `.dark` on them rendered
  // a dark glossary card in the middle of a light interface.
  it("pins the chrome to light in kids mode even when the theme is dark", () => {
    const els = chromeContainers()
    store.set(appConfigAtom, { features: { kidsMode: true } })

    renderHook(() => useThemeSync())

    for (const el of els) {
      expect(el.classList.contains("dark")).toBe(false)
      expect(el.dataset.theme).toBe("light")
    }
  })
})
