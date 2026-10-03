// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

let readingOrder: { version: number | null } | undefined
vi.mock("@/hooks/use-reading-order", () => ({
  useReadingOrder: () => ({ data: readingOrder }),
}))

const { ReadingOrderResetWarning } = await import("./ReadingOrderResetWarning")

afterEach(() => {
  cleanup()
  readingOrder = undefined
})

function renderFor(stageSlug: string) {
  return render(<ReadingOrderResetWarning bookLabel="a-book" stageSlug={stageSlug} />)
}

describe("ReadingOrderResetWarning", () => {
  it("warns before a sectioning rebuild when the book has a saved order", () => {
    readingOrder = { version: 3 }
    renderFor("sectioning")
    expect(screen.getByText(/returns to PDF order/i)).toBeTruthy()
    // The history survives a sectioning rebuild, so it must not claim otherwise.
    expect(screen.getByText(/stay in the history/i)).toBeTruthy()
  })

  it("says the history goes too before a re-extract", () => {
    // `clearExtractedData` deletes the reading order outright. Promising the
    // user their earlier orders survive would be a lie they act on.
    readingOrder = { version: 3 }
    renderFor("extract")
    expect(screen.getByText(/deletes the book's page order and its history/i)).toBeTruthy()
  })

  it("says nothing when the book has never been reordered", () => {
    readingOrder = { version: null }
    const { container } = renderFor("sectioning")
    expect(container.textContent).toBe("")
  })

  it("says nothing while the order is still loading", () => {
    readingOrder = undefined
    const { container } = renderFor("sectioning")
    expect(container.textContent).toBe("")
  })

  it("says nothing for a re-run that leaves the sections alone", () => {
    // A storyboard re-run regenerates HTML, not section ids, so the saved
    // arrangement is untouched and warning about it would be noise.
    readingOrder = { version: 3 }
    const { container } = renderFor("storyboard")
    expect(container.textContent).toBe("")
  })
})
