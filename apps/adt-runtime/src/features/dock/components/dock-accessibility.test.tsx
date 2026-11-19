// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { getDefaultStore } from "jotai"
import { createRef, type ReactNode } from "react"
import { TooltipProvider } from "@/shared/ui/tooltip"
import { DockContext } from "@/features/dock/context/dock-context"
import { translationsAtom } from "@/features/language/state/language.atoms"
import {
  currentPageNumberAtom,
  currentSectionIdAtom,
  pagesAtom,
  tocAtom,
} from "@/features/navigation/state/nav.atoms"
import { dockReadyAtom } from "@/shared/state/ui.atoms"
import { activityModeAtom, submitVisibleAtom } from "@/features/activity/state/activity.atoms"
import { BottomDock } from "./BottomDock"
import { BookMetadata } from "./BookMetadata"
import { PageNav } from "@/features/navigation/components/PageNav"
import { ActivityDock } from "@/features/activity/components/ActivityDock"

const mobile = vi.hoisted(() => ({ value: false }))
vi.mock("@/shared/hooks/use-is-mobile", () => ({ useIsMobile: () => mobile.value }))
vi.mock("@/features/navigation/lib/page-swap", () => ({
  navigateToPage: vi.fn(),
  prefetchPage: vi.fn(),
}))

function renderInDock(ui: ReactNode) {
  return render(
    <TooltipProvider>
      <DockContext.Provider
        value={{
          ref: createRef<HTMLDivElement>(),
          popoverSide: "top",
          isSpread: false,
          isTop: false,
          isCompact: true,
          shouldHide: false,
        }}
      >
        {ui}
      </DockContext.Provider>
    </TooltipProvider>,
  )
}

const store = getDefaultStore()

const pages = [
  { section_id: "pg001_sec001", href: "pg001_sec001.html" },
  { section_id: "pg002_sec001", href: "pg002_sec001.html" },
  { section_id: "pg003_sec001", href: "pg003_sec001.html" },
]

afterEach(() => {
  cleanup()
  mobile.value = false
  store.set(translationsAtom, {})
  store.set(pagesAtom, [])
  store.set(tocAtom, [])
  store.set(currentSectionIdAtom, null)
  store.set(currentPageNumberAtom, null)
  store.set(dockReadyAtom, false)
  store.set(activityModeAtom, false)
  store.set(submitVisibleAtom, true)
})

describe("reader dock landmark", () => {
  it("is a region named from the catalog", () => {
    store.set(translationsAtom, { "dock-label": "پڑھنے کے کنٹرولز" })
    renderInDock(<BottomDock />)
    expect(screen.getByRole("region", { name: "پڑھنے کے کنٹرولز" })).toBeTruthy()
  })

  // `t()` echoes the key when a catalog lacks it, so `t(key) || "…"` used to
  // name the dock "dock-label" in most languages.
  it("falls back to English, never the raw key, when the catalog lacks the label", () => {
    store.set(translationsAtom, { "toc-title": "فہرست" })
    renderInDock(<BottomDock />)
    expect(screen.getByRole("region", { name: "Reader controls" })).toBeTruthy()
    expect(screen.queryByRole("region", { name: "dock-label" })).toBeNull()
  })
})

describe("contents button", () => {
  it("says it opens the contents and keeps the visible section title in its name", () => {
    store.set(translationsAtom, { "toc-title": "Contents" })
    store.set(tocAtom, [
      { section_id: "pg003_sec001", href: "pg003_sec001.html", title: "3 Methodology", chapter_id: "", level: 1 },
    ])
    store.set(currentSectionIdAtom, "pg003_sec001")
    renderInDock(<BookMetadata />)
    const button = screen.getByRole("button", { name: "Contents: 3 Methodology" })
    expect(button.textContent).toContain("3 Methodology")
    expect(screen.queryByRole("button", { name: /main menu/i })).toBeNull()
  })

  it("is named Contents when it shows no title", () => {
    mobile.value = true
    store.set(translationsAtom, { "toc-title": "Indeksi" })
    store.set(tocAtom, [
      { section_id: "pg003_sec001", href: "pg003_sec001.html", title: "3 Methodology", chapter_id: "", level: 1 },
    ])
    store.set(currentSectionIdAtom, "pg003_sec001")
    renderInDock(<BookMetadata />)
    expect(screen.getByRole("button", { name: "Indeksi" })).toBeTruthy()
  })
})

describe("page counter", () => {
  function showPage(section: string, page: number) {
    store.set(pagesAtom, pages)
    store.set(currentSectionIdAtom, section)
    store.set(currentPageNumberAtom, page)
  }

  it("reads as a sentence while the visible counter stays as it was", () => {
    store.set(translationsAtom, { "page-n-of-m": "Faqja ${n} nga ${m}" })
    showPage("pg002_sec001", 2)
    const { container } = renderInDock(<PageNav />)

    const spoken = screen.getByText("Faqja 2 nga 3")
    expect(spoken.className).toContain("sr-only")

    const visible = container.querySelector('[dir="ltr"]')
    expect(visible?.textContent).toBe("2 /3")
    expect(visible?.getAttribute("aria-hidden")).toBe("true")
  })

  // Switching to an English sentence in, say, a Bengali book would be worse
  // than the neutral numbers, so a catalog without the string keeps them.
  it("keeps the neutral numbers readable when the catalog has no sentence", () => {
    showPage("pg002_sec001", 2)
    const { container } = renderInDock(<PageNav />)

    expect(screen.queryByText(/Page 2 of 3/)).toBeNull()
    const visible = container.querySelector('[dir="ltr"]')
    expect(visible?.hasAttribute("aria-hidden")).toBe(false)
  })
})

describe("activity submit bar", () => {
  it("is a region named Activity controls, not Reader controls", () => {
    store.set(translationsAtom, {
      "dock-label": "Reader controls",
      "activity-dock-label": "Kontrollet e aktivitetit",
    })
    store.set(activityModeAtom, true)
    renderInDock(<ActivityDock />)
    expect(screen.getByRole("region", { name: "Kontrollet e aktivitetit" })).toBeTruthy()
    expect(screen.queryByRole("region", { name: "Reader controls" })).toBeNull()
  })

  it("falls back to English when the catalog lacks the label", () => {
    store.set(activityModeAtom, true)
    renderInDock(<ActivityDock />)
    expect(screen.getByRole("region", { name: "Activity controls" })).toBeTruthy()
  })
})
