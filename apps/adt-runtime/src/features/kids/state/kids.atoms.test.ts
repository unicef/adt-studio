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

function setLocation(pathname = "/", search = "") {
  window.history.replaceState(null, "", `${pathname}${search}`)
}

beforeEach(() => {
  sessionStorage.clear()
  setLocation()
})

afterEach(() => {
  sessionStorage.clear()
  setLocation()
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
    setLocation("/api/books/demo/adt/page.html", "?kidsMode=off")

    const store = createStore()
    store.set(appConfigAtom, configWithKidsMode(true))
    expect(store.get(kidsModeActiveAtom)).toBe(false)
  })

  it("override on shows kids chrome when config is off, but only in preview context", () => {
    // Same query param outside Studio/dev — override must not apply.
    setLocation("/book/page.html", "?kidsMode=on")
    const standaloneStore = createStore()
    standaloneStore.set(appConfigAtom, configWithKidsMode(false))
    expect(standaloneStore.get(kidsModeActiveAtom)).toBe(false)

    setLocation("/api/books/demo/adt/page.html", "?kidsMode=on")
    const previewStore = createStore()
    previewStore.set(appConfigAtom, configWithKidsMode(false))
    expect(previewStore.get(kidsModeActiveAtom)).toBe(true)
  })

  it("has no effect when absent, letting the packed config decide", () => {
    setLocation("/api/books/demo/adt/page.html")
    const store = createStore()
    store.set(appConfigAtom, configWithKidsMode(true))
    expect(store.get(kidsModeActiveAtom)).toBe(true)

    store.set(appConfigAtom, configWithKidsMode(false))
    expect(store.get(kidsModeActiveAtom)).toBe(false)
  })

  it("persists the override across a simulated reload (query string dropped on the next page)", () => {
    setLocation("/api/books/demo/adt/page.html", "?kidsMode=on")

    const firstPageStore = createStore()
    firstPageStore.set(appConfigAtom, configWithKidsMode(false))
    expect(firstPageStore.get(kidsModeActiveAtom)).toBe(true)

    // Simulate the next page turn: fresh store (new document/runtime boot),
    // query string gone, but sessionStorage carries the override forward.
    setLocation("/api/books/demo/adt/next.html")
    const secondPageStore = createStore()
    secondPageStore.set(appConfigAtom, configWithKidsMode(false))
    expect(secondPageStore.get(kidsModeActiveAtom)).toBe(true)
  })
})
