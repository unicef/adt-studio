// @vitest-environment jsdom
import { act, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useReservedHeight } from "./LazyThumb"

let notifyResize: (() => void) | undefined

class ResizeObserverStub {
  constructor(callback: ResizeObserverCallback) {
    notifyResize = () => callback([], this as unknown as ResizeObserver)
  }

  observe() {}
  disconnect() {}
  unobserve() {}
}

function HeightProbe({ measurementKey }: { measurementKey: string }) {
  const [ref, height] = useReservedHeight<HTMLDivElement>(true, measurementKey)
  return <div ref={ref} data-testid="probe" data-height={height ?? "unmeasured"} />
}

describe("useReservedHeight", () => {
  afterEach(() => {
    notifyResize = undefined
    vi.restoreAllMocks()
  })

  it("does not expose a measurement captured for a previous key", () => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub)
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 100,
      height: 120,
      top: 0,
      right: 100,
      bottom: 120,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    const view = render(<HeightProbe measurementKey="desktop" />)
    act(() => notifyResize?.())
    expect(view.getByTestId("probe").getAttribute("data-height")).toBe("120")

    view.rerender(<HeightProbe measurementKey="mobile" />)
    expect(view.getByTestId("probe").getAttribute("data-height")).toBe(
      "unmeasured"
    )
  })
})
