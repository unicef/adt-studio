/**
 * Reviewer colors are assigned by the worker from a fixed ten-color rotation,
 * and two of them (amber, yellow-green) are light enough that white pin numbers
 * would fail contrast — so the label color follows the pin's luminance.
 */
export function readableTextColor(hex: string): string {
  const value = hex.replace("#", "")
  if (value.length !== 6) return "#ffffff"
  const r = Number.parseInt(value.slice(0, 2), 16) / 255
  const g = Number.parseInt(value.slice(2, 4), 16) / 255
  const b = Number.parseInt(value.slice(4, 6), 16) / 255
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  return luminance > 0.45 ? "#1a1a1a" : "#ffffff"
}

function channel(value: number): number {
  return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
}
