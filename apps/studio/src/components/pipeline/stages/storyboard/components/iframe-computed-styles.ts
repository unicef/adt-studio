// Pure helpers for converting raw getComputedStyle strings into the shapes
// the Typography inspector consumes. The actual iframe read lives in
// BookPreviewFrame's imperative handle; this file is iframe-agnostic and
// trivially testable in isolation.

export interface ComputedTypographyStyles {
  fontSize: number | null
  color: string | null
  fontWeight: string | null
  lineHeight: number | null
  textAlign: string | null
  /** Primary declared family (first token, unquoted) of the element's text,
   *  e.g. "Mouse Memoirs". Null when no family is resolvable. */
  fontFamily: string | null
  /** Primary family from the element's own inline `style="font-family"`, if any
   *  — distinguishes an explicit per-element font from an inherited one. Null
   *  when the element has no inline font-family. */
  inlineFontFamily: string | null
}

export function parsePx(value: string): number | null {
  const m = value.match(/^([\d.]+)px$/)
  if (!m) return null
  const n = parseFloat(m[1])
  return Number.isFinite(n) ? n : null
}

export function rgbToHex(rgb: string): string | null {
  const m = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/)
  if (!m) return null
  const toHex = (v: string) => parseInt(v, 10).toString(16).padStart(2, "0")
  const hex = `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`
  if (m[4] !== undefined) {
    const a = Math.round(parseFloat(m[4]) * 255)
    if (a < 255) return `${hex}${a.toString(16).padStart(2, "0")}`
  }
  return hex
}

const WEIGHT_TOKEN_BY_NUMBER: Record<string, string> = {
  "100": "thin",
  "200": "extralight",
  "300": "light",
  "400": "normal",
  "500": "medium",
  "600": "semibold",
  "700": "bold",
  "800": "extrabold",
  "900": "black",
}

export function weightToToken(weight: string): string | null {
  return WEIGHT_TOKEN_BY_NUMBER[weight] ?? null
}

export function lineHeightToMultiplier(
  lineHeight: string,
  fontSize: number | null,
): number | null {
  if (!fontSize || fontSize <= 0) return null
  if (lineHeight === "normal") return 1.5
  const px = parsePx(lineHeight)
  if (px === null) return null
  return px / fontSize
}

export function normalizeTextAlign(value: string): string | null {
  if (!value) return null
  // CSS computed value can be "start"/"end" (direction-relative) — the
  // inspector toggle uses "left"/"right" so map them assuming LTR.
  if (value === "start") return "left"
  if (value === "end") return "right"
  return value
}
