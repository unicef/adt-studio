// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { getDefaultStore } from "jotai"
import { glossaryDataAtom } from "@/features/glossary/state/glossary.atoms"
import { currentSectionIdAtom, pagesAtom } from "@/features/navigation/state/nav.atoms"
import { dockMenuValueAtom, selectedGlossaryTermAtom } from "@/shared/state/ui.atoms"

const { navigateToPage, findPageWithGlossaryTerm } = vi.hoisted(() => ({
  navigateToPage: vi.fn(),
  findPageWithGlossaryTerm: vi.fn(),
}))

vi.mock("@/features/navigation/lib/page-swap", () => ({ navigateToPage }))
vi.mock("@/features/glossary/lib/locate", () => ({
  findPageWithGlossaryTerm,
  isGlossaryTermOnPage: () => false,
  locateGlossaryTerm: () => false,
}))

const { TermDetails } = await import("./TermDetails")

const store = getDefaultStore()
const LOCATE = /glossary-locate-on-page/

beforeEach(() => {
  store.set(glossaryDataAtom, {
    cloud: { word: "cloud", definition: "A shape in the sky", variations: [], emoji: "" },
  })
  store.set(pagesAtom, [
    { section_id: "pg002_sec001", href: "pg002_sec001.html" },
    { section_id: "pg008_sec001", href: "pg008_sec001.html" },
  ])
  store.set(currentSectionIdAtom, "pg002_sec001")
  store.set(dockMenuValueAtom, "glossary")
  store.set(selectedGlossaryTermAtom, "cloud")
})

afterEach(() => {
  cleanup()
  navigateToPage.mockReset()
  findPageWithGlossaryTerm.mockReset()
  store.set(glossaryDataAtom, {})
  store.set(pagesAtom, [])
  store.set(currentSectionIdAtom, null)
  store.set(dockMenuValueAtom, "")
  store.set(selectedGlossaryTermAtom, null)
})

describe("TermDetails", () => {
  it("closes the glossary when it turns to the page holding the term", async () => {
    findPageWithGlossaryTerm.mockResolvedValue({
      section_id: "pg008_sec001",
      href: "pg008_sec001.html",
    })
    render(<TermDetails />)

    fireEvent.click(screen.getByRole("button", { name: LOCATE }))

    await waitFor(() =>
      expect(navigateToPage).toHaveBeenCalledWith("pg008_sec001.html#glossary=cloud"),
    )
    expect(store.get(dockMenuValueAtom)).toBe("")
    expect(store.get(selectedGlossaryTermAtom)).toBeNull()
  })

  it("stays open and re-enables the button when no page holds the term", async () => {
    findPageWithGlossaryTerm.mockResolvedValue(null)
    render(<TermDetails />)

    fireEvent.click(screen.getByRole("button", { name: LOCATE }))

    const button = await screen.findByRole("button", { name: LOCATE })
    expect((button as HTMLButtonElement).disabled).toBe(false)
    expect(navigateToPage).not.toHaveBeenCalled()
    expect(store.get(dockMenuValueAtom)).toBe("glossary")
    expect(store.get(selectedGlossaryTermAtom)).toBe("cloud")
  })
})
