// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce(
        (message, part, index) => message + part + (index < values.length ? String(values[index]) : ""),
        "",
      ),
  }),
}))

import { FitScaleIndicator } from "./FitScaleIndicator"

describe("FitScaleIndicator", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
    vi.stubGlobal("matchMedia", () => ({ matches: true }))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("reports the actual page transform and hides at full size", () => {
    const view = render(<FitScaleIndicator scale={0.75} />)

    expect(view.container.textContent).toContain("showing 75% of full size")
    expect(view.container.querySelector("[data-state=open]")).not.toBeNull()

    view.rerender(<FitScaleIndicator scale={1} />)
    expect(view.container.querySelector("[data-state=closed]")).not.toBeNull()

    act(() => vi.advanceTimersByTime(220))
    expect(view.container.firstChild).toBeNull()
  })
})
