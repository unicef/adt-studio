import { describe, expect, it } from "vitest"
import { TAIL, TAIL_BOX, tailFirst } from "./PeerCursors"
import type { CursorEdge } from "@/features/comments/lib/cursor-edge"

/** The apex is the vertex that is alone on its axis; the other two share a side with the pill. */
function apex(path: string, axis: "x" | "y"): { apex: number; base: number } {
  const points = [...path.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(([, x, y]) => ({
    x: Number(x),
    y: Number(y),
  }))
  const values = points.map((point) => point[axis])
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  const lone = [...counts.entries()].find(([, count]) => count === 1)
  const shared = [...counts.entries()].find(([, count]) => count > 1)
  return { apex: lone![0], base: shared![0] }
}

describe("edge marker tails", () => {
  /** The whole meaning of the marker is "they are over there", so a tail pointing the wrong way
   *  is worse than no tail: it sends the reader scrolling away from the person. */
  it.each([
    ["top", "y", "less"],
    ["bottom", "y", "greater"],
    ["left", "x", "less"],
    ["right", "x", "greater"],
  ] as const)("points %s away from the screen", (edge, axis, direction) => {
    const { apex: tip, base } = apex(TAIL[edge as CursorEdge], axis)
    if (direction === "less") expect(tip).toBeLessThan(base)
    else expect(tip).toBeGreaterThan(base)
  })

  /** A tail wider than it is tall on a horizontal edge, and the reverse on a vertical one, so it
   *  reads as a point rather than a wedge. */
  it.each(["top", "bottom"] as const)("%s tail is wider than it is tall", (edge) => {
    expect(TAIL_BOX[edge].width).toBeGreaterThan(TAIL_BOX[edge].height)
  })

  it.each(["left", "right"] as const)("%s tail is taller than it is wide", (edge) => {
    expect(TAIL_BOX[edge].height).toBeGreaterThan(TAIL_BOX[edge].width)
  })

  /** Leading on the edges whose peers lie back towards the window's origin, trailing on the
   *  others, so the tail always ends up on the outer side of the pill. */
  it("puts the tail on the outward side of the pill", () => {
    expect(tailFirst("top")).toBe(true)
    expect(tailFirst("left")).toBe(true)
    expect(tailFirst("bottom")).toBe(false)
    expect(tailFirst("right")).toBe(false)
  })
  /** The viewBox is derived from the box, so a path drawn to different coordinates would be
   *  silently rescaled rather than rejected — which is exactly what happened once. */
  it.each(["top", "bottom", "left", "right"] as const)(
    "%s path is drawn to the size the box declares",
    (edge) => {
      const points = [...TAIL[edge].matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(([, x, y]) => ({
        x: Number(x),
        y: Number(y),
      }))
      expect(Math.max(...points.map((point) => point.x))).toBe(TAIL_BOX[edge].width)
      expect(Math.max(...points.map((point) => point.y))).toBe(TAIL_BOX[edge].height)
      expect(Math.min(...points.map((point) => point.x))).toBe(0)
      expect(Math.min(...points.map((point) => point.y))).toBe(0)
    },
  )
})
