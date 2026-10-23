import { describe, expect, it } from "vitest"
import { floatPosition, relativeTo } from "./placement"

const bounds = { width: 800, height: 600 }
const size = { width: 300, height: 32 }
const options = { gap: 10, inset: 8, topInset: 56, bottomInset: 120 }

describe("floatPosition", () => {
  it("sits centred just above the element", () => {
    const placed = floatPosition({ left: 250, top: 200, width: 300, height: 40 }, size, bounds, options)
    expect(placed).toEqual({ x: 250, y: 158, side: "above", visible: true })
  })

  it("flips below when there is no room above", () => {
    const placed = floatPosition({ left: 250, top: 70, width: 300, height: 40 }, size, bounds, options)
    expect(placed.side).toBe("below")
    expect(placed.y).toBe(120)
  })

  it("stays inside the canvas horizontally", () => {
    expect(floatPosition({ left: -40, top: 300, width: 60, height: 20 }, size, bounds, options).x).toBe(8)
    expect(floatPosition({ left: 780, top: 300, width: 60, height: 20 }, size, bounds, options).x).toBe(492)
  })

  it("stays above the element when below would sit under the dock", () => {
    const placed = floatPosition({ left: 250, top: 40, width: 300, height: 430 }, size, bounds, options)
    expect(placed.side).toBe("above")
    expect(placed.y).toBe(56)
  })

  it("clamps inside the canvas when the element fills it", () => {
    const placed = floatPosition({ left: 0, top: 20, width: 800, height: 900 }, size, bounds, options)
    expect(placed.y).toBe(56)
    expect(placed.visible).toBe(true)
  })

  it("reports an element scrolled out of view", () => {
    expect(floatPosition({ left: 100, top: -200, width: 100, height: 100 }, size, bounds, options).visible).toBe(false)
    expect(floatPosition({ left: 100, top: 500, width: 100, height: 100 }, size, bounds, options).visible).toBe(false)
  })
})

describe("relativeTo", () => {
  it("offsets a rect by an origin", () => {
    expect(relativeTo({ left: 120, top: 90, width: 10, height: 5 }, { left: 100, top: 40 })).toEqual({ left: 20, top: 50, width: 10, height: 5 })
  })
})
