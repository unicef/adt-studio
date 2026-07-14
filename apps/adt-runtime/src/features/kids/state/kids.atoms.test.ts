// @vitest-environment jsdom
import { createStore } from "jotai"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { appConfigAtom, type AppConfig } from "@/shared/state/config.atoms"
import { kidsModeActiveAtom } from "./kids.atoms"

function configWithKidsMode(kidsMode: boolean): AppConfig {
  return {
    languages: { available: ["en"], default: "en" },
    features: { kidsMode },
  }
}

function enterIframeContext() {
  Object.defineProperty(window, "parent", { value: {}, configurable: true })
}

function exitIframeContext() {
  Object.defineProperty(window, "parent", { value: window, configurable: true })
}

function setSearch(search: string) {
  window.history.replaceState(null, "", `/${search}`)
}

beforeEach(() => {
  sessionStorage.clear()
  exitIframeContext()
  setSearch("")
})

afterEach(() => {
  sessionStorage.clear()
  exitIframeContext()
  setSearch("")
})

describe("kidsModeActiveAtom", () => {
  it("follows the packed config when there is no preview override", () => {
    const store = createStore()
    store.set(appConfigAtom, configWithKidsMode(true))
    expect(store.get(kidsModeActiveAtom)).toBe(true)

    store.set(appConfigAtom, configWithKidsMode(false))
    expect(store.get(kidsModeActiveAtom)).toBe(false)
  })

  it("override off hides kids chrome even when features.kidsMode is true", () => {
    enterIframeContext()
    setSearch("?kidsMode=off")

    const store = createStore()
    store.set(appConfigAtom, configWithKidsMode(true))
    expect(store.get(kidsModeActiveAtom)).toBe(false)
  })

  it("override on shows kids chrome when config is off, but only in preview context", () => {
    // Same query param, but not iframed/dev — override must not apply.
    setSearch("?kidsMode=on")
    const standaloneStore = createStore()
    standaloneStore.set(appConfigAtom, configWithKidsMode(false))
    expect(standaloneStore.get(kidsModeActiveAtom)).toBe(false)

    enterIframeContext()
    const previewStore = createStore()
    previewStore.set(appConfigAtom, configWithKidsMode(false))
    expect(previewStore.get(kidsModeActiveAtom)).toBe(true)
  })

  it("has no effect when absent, letting the packed config decide", () => {
    enterIframeContext()
    const store = createStore()
    store.set(appConfigAtom, configWithKidsMode(true))
    expect(store.get(kidsModeActiveAtom)).toBe(true)

    store.set(appConfigAtom, configWithKidsMode(false))
    expect(store.get(kidsModeActiveAtom)).toBe(false)
  })

  it("persists the override across a simulated reload (query string dropped on the next page)", () => {
    enterIframeContext()
    setSearch("?kidsMode=on")

    const firstPageStore = createStore()
    firstPageStore.set(appConfigAtom, configWithKidsMode(false))
    expect(firstPageStore.get(kidsModeActiveAtom)).toBe(true)

    // Simulate the next page turn: fresh store (new document/runtime boot),
    // query string gone, but sessionStorage carries the override forward.
    setSearch("")
    const secondPageStore = createStore()
    secondPageStore.set(appConfigAtom, configWithKidsMode(false))
    expect(secondPageStore.get(kidsModeActiveAtom)).toBe(true)
  })
})
