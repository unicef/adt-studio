// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { createRef } from "react"
import type { ReaderButtonStyle } from "@adt/types/reader-ui"
import { TooltipProvider } from "@/shared/ui/tooltip"
import { DockContext } from "@/features/dock/context/dock-context"
import { DockIconButton } from "./DockIconButton"

afterEach(cleanup)

function renderButton(buttonStyle: ReaderButtonStyle, size: "sm" | "default" = "default") {
  render(
    <TooltipProvider>
      <DockContext.Provider
        value={{
          ref: createRef<HTMLDivElement>(),
          popoverSide: "top",
          isSpread: true,
          isTop: false,
          isCompact: false,
          shouldHide: false,
          isVertical: false,
          edge: "bottom",
          buttonStyle,
        }}
      >
        <DockIconButton ariaLabel="Glossary" size={size}>
          <svg data-testid="icon" />
        </DockIconButton>
      </DockContext.Provider>
    </TooltipProvider>,
  )
  return screen.getByRole("button", { name: "Glossary" })
}

describe("dock button style (Reader step)", () => {
  it("shows the icon only by default", () => {
    const button = renderButton("icon")
    expect(button.querySelector("[data-testid=icon]")).not.toBeNull()
    expect(button.textContent).toBe("")
  })

  it("shows the icon and its name", () => {
    const button = renderButton("icon-label")
    expect(button.querySelector("[data-testid=icon]")).not.toBeNull()
    expect(button.textContent).toBe("Glossary")
  })

  it("shows the name only", () => {
    const button = renderButton("label")
    expect(button.querySelector("[data-testid=icon]")).toBeNull()
    expect(button.textContent).toBe("Glossary")
  })

  it("keeps small buttons icon-only", () => {
    const button = renderButton("label", "sm")
    expect(button.querySelector("[data-testid=icon]")).not.toBeNull()
    expect(button.textContent).toBe("")
  })
})
