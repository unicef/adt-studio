// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { getDefaultStore } from "jotai"
import { pagesAtom, tocAtom } from "@/features/navigation/state/nav.atoms"
import { navigateToPage, prefetchPage } from "@/features/navigation/lib/page-swap"
import { TocContent } from "./TocDockContent"

vi.mock("@/features/navigation/lib/page-swap", () => ({ navigateToPage: vi.fn(), prefetchPage: vi.fn() }))
vi.mock("@/shared/hooks/use-is-mobile", () => ({ useIsMobile: () => false }))

afterEach(() => {
  cleanup()
  getDefaultStore().set(tocAtom, [])
  getDefaultStore().set(pagesAtom, [])
  vi.clearAllMocks()
})

describe("TOC unavailable destinations", () => {
  it("keeps an explicitly empty TOC empty even when pages remain", () => {
    getDefaultStore().set(pagesAtom, [{ section_id: "current", href: "current.html" }])
    render(<TocContent />)
    expect(screen.queryByRole("button", { name: "current" })).toBeNull()
  })

  it("retains authored headings without navigating or prefetching missing pages", () => {
    getDefaultStore().set(tocAtom, [
      { section_id: "retired", href: "", title: "Protected parent", chapter_id: "", level: 1 },
      { section_id: "current", href: "current.html", title: "Protected child", chapter_id: "", level: 2 },
    ])
    render(<TocContent />)
    const parent = screen.getByRole("button", { name: "Protected parent" }) as HTMLButtonElement
    expect(parent.disabled).toBe(true)
    fireEvent.click(parent)
    fireEvent.pointerEnter(parent)
    fireEvent.focus(parent)
    expect(navigateToPage).not.toHaveBeenCalled()
    expect(prefetchPage).not.toHaveBeenCalled()
    const child = screen.getByRole("button", { name: "Protected child" })
    fireEvent.focus(child)
    fireEvent.click(child)
    expect(prefetchPage).toHaveBeenCalledWith("current.html")
    expect(navigateToPage).toHaveBeenCalledWith("current.html")
  })
})

it("does not duplicate or change authored headings when repeated targets are filtered", () => {
  getDefaultStore().set(tocAtom, [
    { section_id: "", href: "", title: "Parent A", chapter_id: "", level: 1 },
    { section_id: "", href: "", title: "Parent B", chapter_id: "", level: 1 },
    { section_id: "same", href: "same.html", title: "Chapter C", chapter_id: "", level: 1 },
    { section_id: "same", href: "same.html", title: "Child D", chapter_id: "", level: 2 },
  ])
  render(<TocContent />)
  const search = screen.getByRole("textbox")
  fireEvent.change(search, { target: { value: "Child D" } })
  expect(screen.queryByRole("button", { name: "Parent A" })).toBeNull()
  expect(screen.queryByRole("button", { name: "Parent B" })).toBeNull()
  expect(screen.queryByRole("button", { name: "Chapter C" })).toBeNull()
  expect(screen.getAllByRole("button", { name: "Child D" })).toHaveLength(1)
  fireEvent.change(search, { target: { value: "" } })
  for (const title of ["Parent A", "Parent B", "Chapter C", "Child D"]) {
    expect(screen.getAllByRole("button", { name: title })).toHaveLength(1)
  }
})
