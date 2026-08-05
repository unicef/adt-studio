// @vitest-environment jsdom
import React, { useState } from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// The macros are compile-time in the app; in tests we stub them so the picker
// renders its labels as plain strings.
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (strings: TemplateStringsArray | string) =>
      Array.isArray(strings) ? strings.join("") : String(strings),
  }),
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { ColorPicker } from "./ColorPicker"
import { hexFromTailwindName } from "../tailwind-palette"

// Radix + kibo primitives need a few browser APIs jsdom lacks.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

afterEach(cleanup)

/** Mirrors EditableActivityPanel's handleAccentChange: the picker emits a hex
 *  or a Tailwind token, and the theme accent stores 6-digit hex. */
function Harness() {
  const [value, setValue] = useState("#1d4ed8") // = blue-700
  const onChange = (next: string) => {
    const hex = next.startsWith("#") ? next.slice(0, 7) : hexFromTailwindName(next)
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return
    setValue(hex)
  }
  return (
    <>
      <ColorPicker value={value} onChange={onChange} opaqueOnly />
      <span data-testid="accent">{value}</span>
    </>
  )
}

describe("ColorPicker (activity panel context: opaqueOnly, no element provider)", () => {
  it("opens from the swatch and applies a picked palette color", async () => {
    render(<Harness />)

    // The trigger swatch is labelled with the current color.
    fireEvent.click(screen.getByRole("button", { name: "#1d4ed8" }))

    // Popover is open — pick a different palette swatch (Variables tab is the
    // default because blue-700 maps to a Tailwind token).
    const redTile = await screen.findByRole("button", { name: "red-500" })
    fireEvent.click(redTile)

    // The accent updated to the picked color's hex.
    expect(screen.getByTestId("accent").textContent).toBe(hexFromTailwindName("red-500"))
    expect(screen.getByTestId("accent").textContent).not.toBe("#1d4ed8")
  })
})
