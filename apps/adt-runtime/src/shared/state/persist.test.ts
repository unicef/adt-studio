// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { studioPreviewBookLabel } from "./persist"

// Studio previews every book on one origin, so one localStorage. Inside a
// preview the reader settings are kept per book: one book's defaults or the
// author's picks must not reach another book's preview or export (#1198).
describe("studioPreviewBookLabel", () => {
  const framed = (pathname: string) => ({ parent: {} as Window, location: { pathname } as Location })

  it("names the book of a Studio preview, in both preview URLs", () => {
    expect(studioPreviewBookLabel(framed("/api/books/book-a/adt-preview/index.html"))).toBe("book-a")
    expect(studioPreviewBookLabel(framed("/api/books/book-a/adt/v-123/pg001_sec001.html"))).toBe("book-a")
  })

  it("is null for a reader that is not framed", () => {
    const win = { location: { pathname: "/api/books/book-a/adt/index.html" } as Location } as Window
    ;(win as { parent: Window }).parent = win
    expect(studioPreviewBookLabel(win)).toBeNull()
  })

  it("is null for a framed reader outside Studio's book paths", () => {
    expect(studioPreviewBookLabel(framed("/my-book/index.html"))).toBeNull()
  })
})

describe("reader settings storage in a Studio preview", () => {
  const realParent = Object.getOwnPropertyDescriptor(window, "parent")

  async function loadReaderIn(pathname: string, isFramed: boolean) {
    vi.resetModules()
    window.history.replaceState({}, "", pathname)
    if (isFramed) Object.defineProperty(window, "parent", { value: {}, configurable: true })
    else if (realParent) Object.defineProperty(window, "parent", realParent)
    const persist = await import("./persist")
    const ui = await import("./ui.atoms")
    const { createStore } = await import("jotai")
    return { persist, ui, store: createStore() }
  }

  beforeEach(() => localStorage.clear())
  afterEach(() => {
    if (realParent) Object.defineProperty(window, "parent", realParent)
    localStorage.clear()
  })

  it("keeps each book's settings under its own keys", async () => {
    const a = await loadReaderIn("/api/books/book-a/adt-preview/index.html", true)
    a.store.set(a.ui.themeAtom, "light")
    a.store.set(a.ui.dockWidthAtom, "compact")
    expect(localStorage.getItem("adtPreview.book-a.theme")).toBe(JSON.stringify("light"))
    expect(localStorage.getItem("theme")).toBeNull()

    const b = await loadReaderIn("/api/books/book-b/adt/v-1/index.html", true)
    expect(b.persist.hasPersistedValue("theme")).toBe(false)
    expect(b.store.get(b.ui.themeAtom)).toBe("dark")
    expect(b.store.get(b.ui.dockWidthAtom)).toBe("full")

    // Back in book A, after a page turn reloads the reader: still its own.
    const again = await loadReaderIn("/api/books/book-a/adt-preview/pg002_sec001.html", true)
    expect(again.store.get(again.ui.themeAtom)).toBe("light")
  })

  it("leaves keys other than the reader settings shared, as before", async () => {
    const a = await loadReaderIn("/api/books/book-a/adt-preview/index.html", true)
    a.store.set(a.ui.easyReadModeAtom, true)
    expect(localStorage.getItem("easyReadMode")).toBe("true")
  })

  it("keeps the plain keys for a reader that is not a Studio preview", async () => {
    const reader = await loadReaderIn("/api/books/book-a/adt/index.html", false)
    reader.store.set(reader.ui.themeAtom, "light")
    expect(localStorage.getItem("theme")).toBe(JSON.stringify("light"))
  })
})
