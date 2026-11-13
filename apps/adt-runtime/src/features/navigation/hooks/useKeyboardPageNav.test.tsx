// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import type { ReactNode } from "react"
import { appConfigAtom } from "@/shared/state/config.atoms"
import { embedModeAtom } from "@/shared/state/ui.atoms"
import { currentSectionIdAtom, pagesAtom } from "@/features/navigation/state/nav.atoms"
import { useKeyboardPageNav } from "./useKeyboardPageNav"

const navigateToPage = vi.hoisted(() => vi.fn())
vi.mock("@/features/navigation/lib/page-swap", () => ({ navigateToPage }))

function mount(embed: boolean) {
  const store = createStore()
  store.set(appConfigAtom, { languages: { available: ["en"], default: "en" }, features: { showNavigationControls: true } })
  store.set(pagesAtom, [
    { section_id: "pg001_sec001", href: "pg001_sec001.html" },
    { section_id: "pg002_sec001", href: "pg002_sec001.html" },
    { section_id: "pg003_sec001", href: "pg003_sec001.html" },
  ])
  store.set(currentSectionIdAtom, "pg002_sec001")
  store.set(embedModeAtom, embed)
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
  renderHook(() => useKeyboardPageNav(), { wrapper })
}

function press(key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  document.body.dispatchEvent(event)
  return event
}

beforeEach(() => navigateToPage.mockClear())
afterEach(() => cleanup())

describe("useKeyboardPageNav", () => {
  it("turns the page with the arrow keys in the full reader", () => {
    mount(false)
    press("ArrowRight")
    expect(navigateToPage).toHaveBeenCalledWith("pg003_sec001.html")
  })

  it("leaves page keys alone in embed mode, where the host owns navigation (#1092)", () => {
    mount(true)
    for (const key of ["ArrowRight", "ArrowLeft", "PageDown", "PageUp", "Home", "End"]) {
      const event = press(key)
      // Not consumed either, so the key keeps its default (e.g. scrolling).
      expect(event.defaultPrevented).toBe(false)
    }
    expect(navigateToPage).not.toHaveBeenCalled()
  })
})
