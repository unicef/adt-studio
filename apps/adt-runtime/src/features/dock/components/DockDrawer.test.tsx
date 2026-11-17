// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { getDefaultStore } from "jotai"
import { readerUiAtom } from "@/shared/state/ui.atoms"
import { readChromeInsets } from "@/shared/lib/chrome-insets"
import { DockPanel } from "./DockPanel"

vi.mock("@/shared/hooks/use-is-mobile", () => ({ useIsMobile: () => false }))

const store = getDefaultStore()

// jsdom has no layout: give every element a measurable width so the drawer
// has something to hand to the book.
class FakeResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver)
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 352, height: 800, top: 0, left: 0, right: 352, bottom: 800, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect)
  document.body.innerHTML = '<main><p>Page one</p></main><div id="interface-container"></div><div id="nav-container"></div>'
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ""
  store.set(readerUiAtom, null)
})

function renderPanel(onClose = vi.fn()) {
  render(
    <DockPanel open onClose={onClose} label="Contents">
      <input aria-label="Search" />
    </DockPanel>,
  )
  return onClose
}

describe("dock panel as a drawer (Reader step layout)", () => {
  it("stays a popover when the book has no reader layout", async () => {
    renderPanel()
    await screen.findByRole("textbox", { name: "Search" })
    expect(document.querySelector(".adt-dock-drawer")).toBeNull()
  })

  it("pushes the book aside by its width while open, and gives the space back on close", async () => {
    store.set(readerUiAtom, {
      layout: { panel_style: "drawer", panel_side: "left", panel_behavior: "push" },
    })
    const { unmount } = render(
      <DockPanel open onClose={vi.fn()} label="Contents">
        <input aria-label="Search" />
      </DockPanel>,
    )
    const drawer = await screen.findByRole("dialog", { name: "Contents" })
    expect(drawer.getAttribute("data-drawer-side")).toBe("left")
    expect(readChromeInsets()).toEqual({ left: 352, right: 0 })
    expect(document.documentElement.style.getPropertyValue("--adt-inset-left")).toBe("352px")
    expect(document.body.hasAttribute("data-adt-insets")).toBe(true)
    // Focus moves into the drawer.
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Search" }))

    unmount()
    expect(readChromeInsets()).toEqual({ left: 0, right: 0 })
    expect(document.body.hasAttribute("data-adt-insets")).toBe(false)
  })

  it("overlays without taking space and closes on a press on the book", async () => {
    store.set(readerUiAtom, {
      layout: { panel_style: "drawer", panel_side: "right", panel_behavior: "overlay" },
    })
    const onClose = renderPanel()
    const drawer = await screen.findByRole("dialog", { name: "Contents" })
    expect(drawer.getAttribute("data-drawer-side")).toBe("right")
    expect(readChromeInsets()).toEqual({ left: 0, right: 0 })

    fireEvent.pointerDown(drawer)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(screen.getByText("Page one"))
    expect(onClose).toHaveBeenCalled()
  })

  it("closes from its own button", async () => {
    store.set(readerUiAtom, { layout: { panel_style: "drawer" } })
    const onClose = renderPanel()
    await screen.findByRole("dialog")
    await act(async () => {
      fireEvent.click(document.querySelector("[data-drawer-close]")!)
    })
    expect(onClose).toHaveBeenCalled()
  })
})
