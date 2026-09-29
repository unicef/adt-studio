export type CursorEdge = "top" | "right" | "bottom" | "left"

export interface Viewport {
  width: number
  height: number
}

export interface CursorPoint {
  x: number
  y: number
}

export type CursorPlacement =
  | { kind: "onscreen"; x: number; y: number }
  | { kind: "edge"; x: number; y: number; edge: CursorEdge }

/** Keeps a clamped marker clear of the very edge, where it would be half cut off. */
const EDGE_INSET = 16

/**
 * Minimum pitch between two markers sharing an edge.
 *
 * Different per orientation because the marker is not square: side by side along the top or
 * bottom they must clear each other's *width* — a truncated name pill plus its tail — while
 * stacked down the left or right they need only clear its height. One number for both left the
 * horizontal edges overlapping, which is the case the spreading exists for.
 */
export const EDGE_SPACING = { horizontal: 132, vertical: 30 } as const

/**
 * Where to draw a peer who is on this page.
 *
 * A cursor travels as an anchor into `#content`, so two people reading the same page at
 * different widths point at the same *word* — but the same fidelity means a peer three screens
 * down resolves to a point far outside the viewport, and the overlay simply clipped it. The
 * reader was told "two other people are reading" while seeing nobody, which reads as a bug in
 * the presence feature rather than as the truth: they are here, just not here.
 *
 * Off-viewport peers are therefore pinned to the nearest edge with the direction they lie in,
 * which is the one piece of information that is still true once the exact position is off-screen.
 */
export function placeCursor(
  point: CursorPoint,
  viewport: Viewport,
  inset: number = EDGE_INSET,
): CursorPlacement {
  const outLeft = point.x < 0
  const outRight = point.x > viewport.width
  const outTop = point.y < 0
  const outBottom = point.y > viewport.height

  if (!outLeft && !outRight && !outTop && !outBottom) {
    return { kind: "onscreen", x: point.x, y: point.y }
  }

  /** Vertical distance decides the edge when a peer is off in both axes: a page scrolls
   *  vertically, so "far below" is the fact the reader can act on, and a marker in the bottom
   *  corner reads as "scroll down" rather than "scroll sideways". */
  const overshootX = outLeft ? -point.x : outRight ? point.x - viewport.width : 0
  const overshootY = outTop ? -point.y : outBottom ? point.y - viewport.height : 0

  const edge: CursorEdge =
    overshootY >= overshootX ? (outTop ? "top" : "bottom") : outLeft ? "left" : "right"

  const clamp = (value: number, max: number): number =>
    Math.min(Math.max(value, inset), Math.max(inset, max - inset))

  if (edge === "top" || edge === "bottom") {
    return {
      kind: "edge",
      edge,
      x: clamp(point.x, viewport.width),
      y: edge === "top" ? inset : viewport.height - inset,
    }
  }

  return {
    kind: "edge",
    edge,
    x: edge === "left" ? inset : viewport.width - inset,
    y: clamp(point.y, viewport.height),
  }
}

export interface PlacedCursor {
  placement: CursorPlacement
}

/**
 * Pushes markers that landed on the same edge apart, so several distant peers read as several
 * people rather than as one badge with the others hidden underneath it.
 *
 * Order is by the coordinate being spread, then the sweep only ever moves a marker *along* its
 * edge and away from the previous one — so the arrangement is stable frame to frame instead of
 * jittering as peers move.
 */
export function spreadAlongEdges<T extends PlacedCursor>(
  placed: T[],
  viewport: Viewport,
  spacing: { horizontal: number; vertical: number } = EDGE_SPACING,
  inset: number = EDGE_INSET,
): T[] {
  const result = [...placed]
  const edges: CursorEdge[] = ["top", "right", "bottom", "left"]

  for (const edge of edges) {
    const horizontal = edge === "top" || edge === "bottom"
    /** The same inset `placeCursor` respects. Clamping to the raw viewport instead let the
     *  sweep push markers flush against the edge, where several would land on the identical
     *  coordinate and each be half-clipped by the overlay's `overflow-hidden`. */
    const limit = Math.max(inset, (horizontal ? viewport.width : viewport.height) - inset)
    const pitch = horizontal ? spacing.horizontal : spacing.vertical
    const onEdge = result
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.placement.kind === "edge" && item.placement.edge === edge)
      .sort((a, b) => {
        const pa = a.item.placement as { x: number; y: number }
        const pb = b.item.placement as { x: number; y: number }
        return horizontal ? pa.x - pb.x : pa.y - pb.y
      })

    /**
     * Two passes, because one is not enough at the far end of the edge.
     *
     * The forward sweep alone pushes every crowded marker up against the limit, where they all
     * land on the identical coordinate — the pile it was meant to prevent, just relocated. The
     * backward sweep then walks from the last marker inwards and pulls anything still too close
     * *away* from that end, so a cluster arriving near the corner spreads back along the edge
     * instead of collapsing into one badge.
     */
    const coordinate = (item: T): number => {
      const placement = item.placement as { x: number; y: number }
      return horizontal ? placement.x : placement.y
    }

    const positions = onEdge.map(({ item }) => coordinate(item))

    let previous = Number.NEGATIVE_INFINITY
    for (let i = 0; i < positions.length; i += 1) {
      positions[i] = Math.min(Math.max(positions[i]!, previous + pitch), limit)
      previous = positions[i]!
    }

    let next = Number.POSITIVE_INFINITY
    for (let i = positions.length - 1; i >= 0; i -= 1) {
      positions[i] = Math.max(Math.min(positions[i]!, next - pitch), inset)
      next = positions[i]!
    }

    onEdge.forEach(({ item, index }, i) => {
      const placement = item.placement as { kind: "edge"; x: number; y: number; edge: CursorEdge }
      const shifted = positions[i]!
      result[index] = {
        ...item,
        placement: horizontal
          ? { ...placement, x: shifted }
          : { ...placement, y: shifted },
      }
    })
  }

  return result
}

/**
 * How far to scroll to bring an off-screen peer into view.
 *
 * Only the axis they are actually off on moves. Centring both would drag a reader sideways to
 * reach somebody who was merely further down — a page that scrolls horizontally at all would
 * lurch for no reason, and the reader did not ask to go anywhere but "down there".
 */
export function scrollDeltaToReveal(point: CursorPoint, viewport: Viewport): CursorPoint {
  const offHorizontally = point.x < 0 || point.x > viewport.width
  const offVertically = point.y < 0 || point.y > viewport.height
  return {
    x: offHorizontally ? Math.round(point.x - viewport.width / 2) : 0,
    y: offVertically ? Math.round(point.y - viewport.height / 2) : 0,
  }
}
