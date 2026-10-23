export interface Box2D {
  left: number
  top: number
  width: number
  height: number
}

export interface FloatOptions {
  gap: number
  inset: number
  topInset: number
  bottomInset: number
}

export interface FloatPosition {
  x: number
  y: number
  side: "above" | "below"
  visible: boolean
}

export function floatPosition(
  target: Box2D,
  size: { width: number; height: number },
  bounds: { width: number; height: number },
  { gap, inset, topInset, bottomInset }: FloatOptions,
): FloatPosition {
  const bottom = target.top + target.height
  const visible = bottom > topInset && target.top < bounds.height - bottomInset && target.left + target.width > 0 && target.left < bounds.width
  const maxX = Math.max(inset, bounds.width - inset - size.width)
  const x = Math.min(maxX, Math.max(inset, target.left + target.width / 2 - size.width / 2))
  const above = target.top - gap - size.height
  const maxY = Math.max(topInset, bounds.height - bottomInset - size.height)
  if (above >= topInset) return { x, y: above, side: "above", visible }
  const below = bottom + gap
  if (below <= maxY) return { x, y: below, side: "below", visible }
  return { x, y: Math.min(maxY, Math.max(topInset, above)), side: "above", visible }
}

export function relativeTo(rect: Box2D, origin: { left: number; top: number }): Box2D {
  return { left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height }
}
