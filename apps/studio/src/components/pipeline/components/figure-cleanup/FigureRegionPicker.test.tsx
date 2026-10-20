// @vitest-environment jsdom
import { useState, type ReactNode } from "react"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { FigureRegionPicker } from "./FigureRegionPicker"

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: (strings: TemplateStringsArray) => strings.join("") }),
  Trans: ({ children }: { children: ReactNode }) => children,
}))
beforeEach(() => vi.stubGlobal("PointerEvent", class extends MouseEvent {
  pointerId = 1
}))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function picker(disabled = false) {
  const changed = vi.fn()
  function Fixture() {
    const [region, setRegion] = useState({ x: 20, y: 30, width: 80, height: 60 })
    return <FigureRegionPicker imageSrc="/page.png" region={region} onChange={(next) => { changed(next); setRegion(next) }} onValidityChange={() => {}} disabled={disabled} />
  }
  const view = render(<Fixture />)
  const img = view.getByRole("img")
  Object.defineProperties(img, { naturalWidth: { value: 400 }, naturalHeight: { value: 300 } })
  fireEvent.load(img)
  const svg = view.container.querySelector("svg")!
  svg.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 150, width: 200, height: 150, toJSON() {} })
  svg.setPointerCapture = vi.fn()
  svg.hasPointerCapture = () => true
  svg.releasePointerCapture = vi.fn()
  return { view, svg, changed }
}

it("moves the entire box in page pixels without resizing and clamps it inside the page", () => {
  const { svg, changed } = picker()
  fireEvent.pointerDown(svg.querySelector("rect")!, { clientX: 30, clientY: 30, button: 0 })
  fireEvent.pointerMove(svg, { clientX: 80, clientY: 60 })
  expect(changed).toHaveBeenLastCalledWith({ x: 120, y: 90, width: 80, height: 60 })
  fireEvent.pointerMove(svg, { clientX: 999, clientY: 999 })
  expect(changed).toHaveBeenLastCalledWith({ x: 320, y: 240, width: 80, height: 60 })
  fireEvent.pointerMove(svg, { clientX: -50, clientY: -50 })
  expect(changed).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 80, height: 60 })
  fireEvent.pointerUp(svg)
  const count = changed.mock.calls.length
  fireEvent.pointerMove(svg, { clientX: 50, clientY: 50 })
  expect(changed).toHaveBeenCalledTimes(count)
})

it("resizes from a corner, and draws a new region when started outside the box", () => {
  const { svg, changed } = picker()
  fireEvent.pointerDown(svg.querySelector('[data-corner="se"]')!, { clientX: 50, clientY: 45, button: 0 })
  fireEvent.pointerMove(svg, { clientX: 5, clientY: 5 })
  expect(changed).toHaveBeenLastCalledWith({ x: 20, y: 30, width: 16, height: 16 })
  fireEvent.pointerUp(svg)
  fireEvent.pointerDown(svg, { clientX: 100, clientY: 100, button: 0 })
  fireEvent.pointerMove(svg, { clientX: 140, clientY: 130 })
  expect(changed).toHaveBeenLastCalledWith({ x: 200, y: 200, width: 80, height: 60 })
  fireEvent.pointerCancel(svg)
  const count = changed.mock.calls.length
  fireEvent.pointerMove(svg, { clientX: 150, clientY: 140 })
  expect(changed).toHaveBeenCalledTimes(count)
})

it("ignores dragging while cleanup is running", () => {
  const { svg, changed } = picker(true)
  fireEvent.pointerDown(svg, { clientX: 30, clientY: 30, button: 0 })
  fireEvent.pointerMove(svg, { clientX: 80, clientY: 60 })
  expect(changed).not.toHaveBeenCalled()
})
