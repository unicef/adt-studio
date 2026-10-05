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
      const pageId = `pg${String(pageNumber).padStart(3, "0")}`
      return {
        sectionId: `${pageId}_sec001`,
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
    // Each option names its section id alongside the positional label.
    fireEvent.click(screen.getByRole("option", { name: "Page 100 pg100_sec001" }))

    expect(onAssign).toHaveBeenCalledWith("pg100_sec001")
    expect(screen.queryByPlaceholderText("Search sections")).toBeNull()
  })

  it("tells same-page sections apart by id, which the position label cannot", () => {
    // Ids are allocated once and never reused, so a page's sections are not
    // numbered contiguously — "Section 2" here is `_sec005`. Without the id on
    // the option there is nothing on screen distinguishing these two rows
    // except an ordinal that does not match the id it assigns.
    const onAssign = vi.fn()
    const sections = [
      {
        sectionId: "pg003_sec001",
        sectionIndex: 0,
        pageNumber: 3,
        pageLabel: "Page 3",
        sectionLabel: "Page 3 — Section 1",
      },
      {
        sectionId: "pg003_sec005",
        sectionIndex: 1,
        pageNumber: 3,
        pageLabel: "Page 3",
        sectionLabel: "Page 3 — Section 2",
      },
    ]

    render(<SectionAssignmentCombobox sections={sections} onAssign={onAssign} />)

    fireEvent.click(screen.getByRole("button", { name: "Assign..." }))
    expect(screen.getByRole("option", { name: "Page 3 — Section 1 pg003_sec001" })).toBeTruthy()
    expect(screen.getByRole("option", { name: "Page 3 — Section 2 pg003_sec005" })).toBeTruthy()

    // Searching by the id reaches the section whose ordinal does not match it.
    fireEvent.change(screen.getByPlaceholderText("Search sections"), {
      target: { value: "sec005" },
    })
    fireEvent.click(screen.getByRole("option", { name: "Page 3 — Section 2 pg003_sec005" }))

    expect(onAssign).toHaveBeenCalledWith("pg003_sec005")
  })
})
