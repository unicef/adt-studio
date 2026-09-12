/**
 * The label colour to put *on* a commenter's colour.
 *
 * Its own module, and deliberately importing nothing.
 *
 * The published-book runtime draws a commenter's pin and needs this at runtime — a *value*, not a
 * type. Every other value in this package sits behind `zod`, and the root barrel pulls all of it:
 * importing this from `@adt/types` costs a published book 2.1 MB of schema machinery it will never
 * execute. So it lives here and is reachable as `@adt/types/color`, the same arrangement
 * `fingerprint` has for the opposite reason (it is Node-only; this is browser-critical).
 *
 * Two of the ten `COMMENTER_COLORS` (amber, yellow-green) are light enough that a white pin number
 * fails contrast, so the label follows the pin's luminance rather than being fixed. sRGB
 * linearisation and Rec.709 weights, thresholded at 0.45 — chosen against that specific rotation
 * rather than derived, which is why the two belong to the same package even though only one of
 * them can be imported freely.
 */
export function readableTextColor(hex: string): string {
  const value = hex.replace("#", "")
  if (value.length !== 6) return "#ffffff"
  const channel = (raw: number) =>
    raw <= 0.03928 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4)
  const r = channel(Number.parseInt(value.slice(0, 2), 16) / 255)
  const g = channel(Number.parseInt(value.slice(2, 4), 16) / 255)
  const b = channel(Number.parseInt(value.slice(4, 6), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#1a1a1a" : "#ffffff"
}
