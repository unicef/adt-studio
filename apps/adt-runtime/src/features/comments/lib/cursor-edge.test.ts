import { describe, expect, it } from "vitest"
import {
  placeCursor,
  scrollDeltaToReveal,
  spreadAlongEdges,
  type CursorPlacement,
} from "./cursor-edge"

const VIEWPORT = { width: 1000, height: 800 }

describe("placeCursor", () => {
  it("leaves a peer inside the viewport where they are", () => {
    expect(placeCursor({ x: 400, y: 300 }, VIEWPORT)).toEqual({
      kind: "onscreen",
      x: 400,
      y: 300,
    })
  })

  /** The case the overlay used to clip away entirely: three screens down is still "on this
   *  page", and the reader was told somebody was here while seeing nobody. */
  it("pins a peer below the fold to the bottom edge", () => {
    const placement = placeCursor({ x: 400, y: 3200 }, VIEWPORT)
    expect(placement).toMatchObject({ kind: "edge", edge: "bottom", x: 400 })
    expect((placement as { y: number }).y).toBeLessThan(VIEWPORT.height)
  })

  it("pins a peer above the fold to the top edge", () => {
    expect(placeCursor({ x: 400, y: -900 }, VIEWPORT)).toMatchObject({
      kind: "edge",
      edge: "top",
      x: 400,
    })
  })

  /** Pages scroll vertically, so when a peer is off in both axes the vertical fact is the one
   *  the reader can act on. */
  it("prefers the vertical edge when a peer is off in both directions", () => {
    expect(placeCursor({ x: -60, y: 2400 }, VIEWPORT)).toMatchObject({ edge: "bottom" })
    expect(placeCursor({ x: -900, y: 810 }, VIEWPORT)).toMatchObject({ edge: "left" })
  })

  it("keeps a clamped marker clear of the corner", () => {
    const placement = placeCursor({ x: -400, y: -400 }, VIEWPORT, 16)
    expect(placement).toMatchObject({ kind: "edge" })
    const { x, y } = placement as { x: number; y: number }
    expect(x).toBeGreaterThanOrEqual(16)
    expect(y).toBeGreaterThanOrEqual(16)
  })
})

describe("spreadAlongEdges", () => {
  function edge(x: number, y: number): CursorPlacement {
    return { kind: "edge", edge: "bottom", x, y }
  }

  it("pushes markers stacked on one edge apart", () => {
    const spread = spreadAlongEdges(
      [
        { entry: "a", placement: edge(400, 784) },
        { entry: "b", placement: edge(404, 784) },
        { entry: "c", placement: edge(408, 784) },
      ],
      VIEWPORT,
      { horizontal: 34, vertical: 34 },
    )
    const xs = spread.map((item) => (item.placement as { x: number }).x)
    expect(xs[1]! - xs[0]!).toBeGreaterThanOrEqual(34)
    expect(xs[2]! - xs[1]!).toBeGreaterThanOrEqual(34)
  })

  it("leaves markers that are already apart untouched", () => {
    const placed = [
      { entry: "a", placement: edge(100, 784) },
      { entry: "b", placement: edge(500, 784) },
    ]
    expect(spreadAlongEdges(placed, VIEWPORT, { horizontal: 34, vertical: 34 })).toEqual(placed)
  })

  it("does not move a peer who is on screen", () => {
    const placed = [{ entry: "a", placement: { kind: "onscreen", x: 10, y: 10 } as CursorPlacement }]
    expect(spreadAlongEdges(placed, VIEWPORT)).toEqual(placed)
  })
})

describe("scrollDeltaToReveal", () => {
  it("centres the peer rather than scrolling them just into view", () => {
    expect(scrollDeltaToReveal({ x: 500, y: 2000 }, VIEWPORT)).toEqual({ x: 0, y: 1600 })
  })
})

describe("spreadAlongEdges — staying inside the window", () => {
  function edge(x: number): CursorPlacement {
    return { kind: "edge", edge: "bottom", x, y: 784 }
  }

  /** Found in review. Clamping the sweep to the raw viewport width let markers pile onto the
   *  identical coordinate at the very edge, where `-translate-x-1/2` puts half of each one
   *  outside the overlay's `overflow-hidden` — three peers rendering as one clipped smudge. */
  it("never pushes a marker past the inset, or onto another", () => {
    const spread = spreadAlongEdges(
      [
        { entry: "a", placement: edge(990) },
        { entry: "b", placement: edge(995) },
        { entry: "c", placement: edge(999) },
      ],
      VIEWPORT,
      { horizontal: 34, vertical: 30 },
      16,
    )
    const xs = spread.map((item) => (item.placement as { x: number }).x)
    for (const x of xs) expect(x).toBeLessThanOrEqual(VIEWPORT.width - 16)
    expect(new Set(xs).size).toBe(xs.length)
  })
})

describe("scrollDeltaToReveal — only the axis that is off", () => {
  /** Also from review: centring both axes dragged the reader sideways to reach somebody who was
   *  merely further down. */
  it("leaves an axis alone when the peer is already in view on it", () => {
    expect(scrollDeltaToReveal({ x: 500, y: 2000 }, VIEWPORT)).toEqual({ x: 0, y: 1600 })
    expect(scrollDeltaToReveal({ x: -300, y: 400 }, VIEWPORT)).toEqual({ x: -800, y: 0 })
  })

  it("moves both when the peer is off in both", () => {
    expect(scrollDeltaToReveal({ x: 1400, y: 2000 }, VIEWPORT)).toEqual({ x: 900, y: 1600 })
  })
})
