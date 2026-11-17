import Color from "color"

/**
 * Best-effort conversion of a token value to `#rrggbb`, for the native colour
 * input. Handles hex, rgb()/hsl()/keywords (via `color`) and `oklch()` — the
 * format the runtime's default palette is written in, which `color` does not
 * parse. Alpha is dropped: the swatch shows the opaque colour.
 */
export function toHex(value: string | undefined): string {
  if (!value) return "#000000"
  const trimmed = value.trim()
  const oklch = parseOklch(trimmed)
  if (oklch) return oklchToHex(...oklch)
  try {
    return Color(trimmed).hex().toLowerCase()
  } catch {
    return "#000000"
  }
}

function parseOklch(value: string): [number, number, number] | null {
  const match = value.match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*[\d.]+%?\s*)?\)$/i)
  if (!match) return null
  const l = match[1].endsWith("%") ? Number.parseFloat(match[1]) / 100 : Number.parseFloat(match[1])
  const c = Number.parseFloat(match[2])
  const h = Number.parseFloat(match[3])
  if (![l, c, h].every(Number.isFinite)) return null
  return [l, c, h]
}

function oklchToHex(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b
  const L = l_ ** 3
  const M = m_ ** 3
  const S = s_ ** 3
  const linear = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ]
  const toByte = (x: number) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
    return Math.round(Math.min(1, Math.max(0, v)) * 255)
  }
  return `#${linear.map((x) => toByte(x).toString(16).padStart(2, "0")).join("")}`
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrastRatio(fg: string, bg: string): number {
  try {
    return Color(toHex(fg)).contrast(Color(toHex(bg)))
  } catch {
    return 21
  }
}
