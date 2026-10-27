// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { UnavailableHint } from "./UnavailableHint"

beforeAll(() => {
  // Radix positions the tooltip with a ResizeObserver, which jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})
afterEach(cleanup)

/** A pointer click as a browser dispatches it: pointerdown, then click. */
function pointerClick(element: HTMLElement) {
  fireEvent.pointerDown(element, { pointerType: "mouse" })
  fireEvent.click(element)
}

describe("UnavailableHint", () => {
  it("opens on a pointer click and closes on the next one", () => {
    render(
      <UnavailableHint hint="Needs a key">
        <button type="button" aria-disabled="true">Per-Word</button>
      </UnavailableHint>,
    )
    const trigger = screen.getByRole("button", { name: "Per-Word" })

    pointerClick(trigger)
    expect(screen.getByRole("tooltip").textContent).toBe("Needs a key")

    pointerClick(trigger)
    expect(screen.queryByRole("tooltip")).toBeNull()
  })
})
