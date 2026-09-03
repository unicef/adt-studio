// @vitest-environment jsdom

import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { SectionAssignmentCombobox } from "./SectionAssignmentCombobox"

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce(
        (text, part, index) => text + part + (index < values.length ? String(values[index]) : ""),
        "",
      ),
  }),
}))

afterEach(cleanup)

describe("SectionAssignmentCombobox", () => {
  it("filters a long section list and assigns the matching late-page section", () => {
    const onAssign = vi.fn()
    const sections = Array.from({ length: 100 }, (_, index) => {
      const pageNumber = index + 1
      return {
        sectionId: `page-${pageNumber}`,
        sectionIndex: 0,
        pageNumber,
        pageLabel: `Page ${pageNumber}`,
        sectionLabel: `Page ${pageNumber}`,
      }
    })

    render(<SectionAssignmentCombobox sections={sections} onAssign={onAssign} />)

    fireEvent.click(screen.getByRole("button", { name: "Assign..." }))
    fireEvent.change(screen.getByPlaceholderText("Search sections"), {
      target: { value: "100" },
    })
    fireEvent.click(screen.getByRole("option", { name: "Page 100" }))

    expect(onAssign).toHaveBeenCalledWith("page-100")
    expect(screen.queryByPlaceholderText("Search sections")).toBeNull()
  })
})
