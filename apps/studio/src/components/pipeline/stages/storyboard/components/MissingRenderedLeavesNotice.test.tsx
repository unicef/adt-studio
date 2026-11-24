// @vitest-environment jsdom
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MissingRenderedLeavesNotice } from "./MissingRenderedLeavesNotice"

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t(strings: TemplateStringsArray, ...values: unknown[]) {
      return strings.reduce(
        (text, part, index) => text + part + (index < values.length ? String(values[index]) : ""),
        ""
      )
    },
  }),
}))

afterEach(cleanup)

const leaf = (n: number) => ({ sectionIndex: 0, nodeId: `t${n}`, text: `Text ${n}` })

describe("MissingRenderedLeavesNotice", () => {
  it("renders nothing when no leaves are missing", () => {
    const { container } = render(<MissingRenderedLeavesNotice leaves={[]} />)
    expect(container.innerHTML).toBe("")
  })

  it("lists up to three snippets and summarizes the rest", () => {
    render(<MissingRenderedLeavesNotice leaves={[1, 2, 3, 4, 5].map(leaf)} />)
    expect(screen.getByText("“Text 1”")).toBeTruthy()
    expect(screen.getByText("“Text 3”")).toBeTruthy()
    expect(screen.queryByText("“Text 4”")).toBeNull()
    expect(screen.getByText("and 2 more")).toBeTruthy()
  })

  it("offers a re-render only when the caller can re-render", () => {
    const onRerender = vi.fn()
    const { rerender } = render(<MissingRenderedLeavesNotice leaves={[leaf(1)]} />)
    expect(screen.queryByRole("button", { name: "Re-render section" })).toBeNull()

    rerender(<MissingRenderedLeavesNotice leaves={[leaf(1)]} onRerender={onRerender} />)
    fireEvent.click(screen.getByRole("button", { name: "Re-render section" }))
    expect(onRerender).toHaveBeenCalledOnce()
  })

  it("is announced as a status region", () => {
    render(<MissingRenderedLeavesNotice leaves={[leaf(1)]} />)
    expect(screen.getByRole("status")).toBeTruthy()
  })

  it("lets each listed text select its node in the tree", () => {
    const onSelectLeaf = vi.fn()
    render(<MissingRenderedLeavesNotice leaves={[leaf(1), leaf(2)]} onSelectLeaf={onSelectLeaf} />)
    fireEvent.click(screen.getByRole("button", { name: "“Text 2”" }))
    expect(onSelectLeaf).toHaveBeenCalledWith("t2")
  })
})
