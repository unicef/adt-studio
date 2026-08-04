// @vitest-environment jsdom
import type { ReactNode } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { KidsPreviewToggle } from "./KidsPreviewToggle"

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

afterEach(cleanup)

describe("KidsPreviewToggle", () => {
  it("is absent when Kids Mode is off", () => {
    render(
      <KidsPreviewToggle
        enabled={false}
        showingRegular={false}
        hidden={false}
        onToggle={vi.fn()}
      />,
    )

    expect(screen.queryByRole("button")).toBeNull()
  })

  it("is available when Kids Mode is on", () => {
    const onToggle = vi.fn()
    render(
      <KidsPreviewToggle
        enabled
        showingRegular={false}
        hidden={false}
        onToggle={onToggle}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Preview regular UI" }))
    expect(onToggle).toHaveBeenCalledOnce()
  })
})
