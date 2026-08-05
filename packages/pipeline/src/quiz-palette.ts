/**
 * Book palette for quizzes — derived deterministically from the book's section
 * colors so quizzes visually match the book's callout components (a colored
 * header band over a pale body with rounded option cards), instead of the fixed
 * cream/gray template.
 *
 * Surface + ink come from the dominant section background/text colors; the
 * accent is the dominant *colorful* (non-neutral) section color — typically the
 * book's brand/heading color. The callout tints (header text, pale body, option
 * fill, submit button) are derived from the accent so the whole quiz reads as
 * one themed component.
 */
import type { Storage } from "@adt/storage"
import type { PageSectioningOutput } from "@adt/types"

export interface QuizPalette {
  /** Page/background reference color. */
  surface: string
  /** Body/option text color. */
  ink: string
  /** Brand accent — header band, borders, selected state. */
  accent: string
  /** Translucent accent for the selected-option background. */
  accentSoft: string
  /** Readable text on the accent header band (white or dark). */
  headerText: string
  /** Pale card-body background (accent tinted toward white). */
  body: string
  /** Option-card fill (a lighter accent tint). */
  optionFill: string
  /** Submit-button background (a mid accent tint). */
  submit: string
  /** Readable text on the submit button. */
  submitText: string
  /** Contrast-safe text on an option card (ink, or a fallback if it fails AA). */
  optionText: string
  /** Contrast-safe text on the selected option. */
  selectedText: string
}

const DEFAULT_SURFACE = "#FFFFFF"
const DEFAULT_INK = "#1F2937"
const DEFAULT_ACCENT = "#2563EB"

type Rgb = { r: number; g: number; b: number }

function parseHex(c: string | undefined): Rgb | null {
  if (!c) return null
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split("").map((x) => x + x).join("") : m[1]
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function normHex(c: string | undefined): string | null {
  const rgb = parseHex(c)
  if (!rgb) return null
  const to2 = (n: number) => n.toString(16).padStart(2, "0")
  return `#${to2(rgb.r)}${to2(rgb.g)}${to2(rgb.b)}`.toUpperCase()
}

/** A "colorful" color has real hue (not near-white/black/gray). */
function isColorful({ r, g, b }: Rgb): boolean {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return s >= 0.25 && l >= 0.18 && l <= 0.82
}

/** Mix a color toward white. ratio 0 = unchanged, 1 = white. */
function mixWhite(rgb: Rgb, ratio: number): string {
  const m = (x: number) => Math.round(x + (255 - x) * ratio)
  const to2 = (n: number) => m(n).toString(16).padStart(2, "0")
  return `#${to2(rgb.r)}${to2(rgb.g)}${to2(rgb.b)}`.toUpperCase()
}

/** WCAG relative luminance (0 = black, 1 = white). */
function relativeLuminance({ r, g, b }: Rgb): number {
  const f = (c: number) => {
    const n = c / 255
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** Readable foreground (white or near-black) for a background color. */
function readableText(bg: Rgb): string {
  return relativeLuminance(bg) < 0.42 ? "#FFFFFF" : "#1F2937"
}

/** WCAG contrast ratio between two colors (1–21). */
function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Keep `fg` on `bg` only if it clears AA (4.5:1); otherwise fall back to a
 *  guaranteed-readable white/near-black. */
function ensureReadable(fg: string, bg: Rgb): string {
  const fgRgb = parseHex(fg)
  if (fgRgb && contrastRatio(fgRgb, bg) >= 4.5) return fg
  return readableText(bg)
}

function mostFrequent(values: string[]): string | null {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: string | null = null
  let bestN = 0
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v
      bestN = n
    }
  }
  return best
}

/**
 * Colorful Tailwind palette families → hex (default Tailwind scale). Neutrals
 * (gray/slate/zinc/neutral/stone) are intentionally omitted so they can never
 * become the accent. Used to read the book's brand color out of rendered HTML,
 * where it usually appears as class names like `bg-emerald-700` rather than hex.
 */
const TAILWIND_COLORS: Record<string, Record<string, string>> = {
  red: { "400": "#F87171", "500": "#EF4444", "600": "#DC2626", "700": "#B91C1C", "800": "#991B1B" },
  orange: { "400": "#FB923C", "500": "#F97316", "600": "#EA580C", "700": "#C2410C", "800": "#9A3412" },
  amber: { "400": "#FBBF24", "500": "#F59E0B", "600": "#D97706", "700": "#B45309", "800": "#92400E" },
  yellow: { "400": "#FACC15", "500": "#EAB308", "600": "#CA8A04", "700": "#A16207", "800": "#854D0E" },
  lime: { "400": "#A3E635", "500": "#84CC16", "600": "#65A30D", "700": "#4D7C0F", "800": "#3F6212" },
  green: { "400": "#4ADE80", "500": "#22C55E", "600": "#16A34A", "700": "#15803D", "800": "#166534" },
  emerald: { "400": "#34D399", "500": "#10B981", "600": "#059669", "700": "#047857", "800": "#065F46" },
  teal: { "400": "#2DD4BF", "500": "#14B8A6", "600": "#0D9488", "700": "#0F766E", "800": "#115E59" },
  cyan: { "400": "#22D3EE", "500": "#06B6D4", "600": "#0891B2", "700": "#0E7490", "800": "#155E75" },
  sky: { "400": "#38BDF8", "500": "#0EA5E9", "600": "#0284C7", "700": "#0369A1", "800": "#075985" },
  blue: { "400": "#60A5FA", "500": "#3B82F6", "600": "#2563EB", "700": "#1D4ED8", "800": "#1E40AF" },
  indigo: { "400": "#818CF8", "500": "#6366F1", "600": "#4F46E5", "700": "#4338CA", "800": "#3730A3" },
  violet: { "400": "#A78BFA", "500": "#8B5CF6", "600": "#7C3AED", "700": "#6D28D9", "800": "#5B21B6" },
  purple: { "400": "#C084FC", "500": "#A855F7", "600": "#9333EA", "700": "#7E22CE", "800": "#6B21A8" },
  fuchsia: { "400": "#E879F9", "500": "#D946EF", "600": "#C026D3", "700": "#A21CAF", "800": "#86198F" },
  pink: { "400": "#F472B6", "500": "#EC4899", "600": "#DB2777", "700": "#BE185D", "800": "#9D174D" },
  rose: { "400": "#FB7185", "500": "#F43F5E", "600": "#E11D48", "700": "#BE123C", "800": "#9F1239" },
}

function rgbFnToHex(fn: string): string | null {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(fn)
  if (!m) return null
  const to2 = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")
  return `#${to2(Number(m[1]))}${to2(Number(m[2]))}${to2(Number(m[3]))}`.toUpperCase()
}

/**
 * Extract colorful (non-neutral) color candidates from a rendered HTML string:
 * Tailwind color classes (`bg-emerald-700` → hex), arbitrary hex, and rgb().
 * This is where the book's brand color actually lives after rendering.
 */
export function colorCandidatesFromHtml(html: string): string[] {
  const out: string[] = []
  const classRe =
    /\b(?:bg|text|border|from|via|to|ring|fill|stroke|decoration|outline|accent|caret|divide)-([a-z]+)-(\d{2,3})\b/g
  let m: RegExpExecArray | null
  while ((m = classRe.exec(html)) !== null) {
    const hex = TAILWIND_COLORS[m[1]]?.[m[2]]
    if (hex) out.push(hex)
  }
  for (const h of html.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? []) {
    const n = normHex(h)
    if (n) out.push(n)
  }
  for (const fn of html.match(/rgba?\([^)]*\)/g) ?? []) {
    const hex = rgbFnToHex(fn)
    if (hex) out.push(hex)
  }
  return out.filter((c) => isColorful(parseHex(c)!))
}

/** Build the full callout palette from the three anchor colors. */
function buildPalette(surface: string, ink: string, accent: string): QuizPalette {
  const a = parseHex(accent)!
  const submit = mixWhite(a, 0.35)
  const optionFill = mixWhite(a, 0.93)
  const optionFillRgb = parseHex(optionFill)!
  // Selected background = accentSoft (0.16 accent) composited over the option
  // fill — approximate the resulting solid color to contrast-check its text.
  const selectedBg: Rgb = {
    r: Math.round(0.16 * a.r + 0.84 * optionFillRgb.r),
    g: Math.round(0.16 * a.g + 0.84 * optionFillRgb.g),
    b: Math.round(0.16 * a.b + 0.84 * optionFillRgb.b),
  }
  return {
    surface,
    ink,
    accent,
    accentSoft: `rgba(${a.r}, ${a.g}, ${a.b}, 0.16)`,
    headerText: readableText(a),
    body: mixWhite(a, 0.86),
    optionFill,
    submit,
    submitText: readableText(parseHex(submit)!),
    optionText: ensureReadable(ink, optionFillRgb),
    selectedText: ensureReadable(accent, selectedBg),
  }
}

/** Neutral fallback used when a book has no usable section colors. */
export const DEFAULT_QUIZ_PALETTE: QuizPalette = buildPalette(
  DEFAULT_SURFACE,
  DEFAULT_INK,
  DEFAULT_ACCENT,
)

/** Re-derive the palette from a user-chosen accent, keeping the book's
 *  surface/ink anchors (used by editable-activity theme overrides). */
export function paletteWithAccent(base: QuizPalette, accent: string): QuizPalette {
  const hex = normHex(accent)
  return hex ? buildPalette(base.surface, base.ink, hex) : base
}

/** Derive a quiz palette from a book's section background/text colors. */
export function deriveQuizPalette(
  sections: Array<{ backgroundColor?: string; textColor?: string }>,
): QuizPalette {
  const backgrounds: string[] = []
  const texts: string[] = []
  const colorful: string[] = []
  for (const s of sections) {
    const bg = normHex(s.backgroundColor)
    const tx = normHex(s.textColor)
    if (bg) {
      backgrounds.push(bg)
      if (isColorful(parseHex(bg)!)) colorful.push(bg)
    }
    if (tx) {
      texts.push(tx)
      if (isColorful(parseHex(tx)!)) colorful.push(tx)
    }
  }
  const surface = mostFrequent(backgrounds) ?? DEFAULT_SURFACE
  const ink = mostFrequent(texts) ?? DEFAULT_INK
  const accent = mostFrequent(colorful.filter((c) => c !== surface)) ?? DEFAULT_ACCENT
  return buildPalette(surface, ink, accent)
}

/**
 * Read the book's palette from storage. Surface + ink come from the (neutral)
 * section colors; the accent is the dominant colorful color actually used in
 * the RENDERED pages — because the book's brand color is applied at render time
 * (often as Tailwind classes like `bg-emerald-700`) and is NOT present in the
 * section colors. Falls back to a colorful section color, then a neutral accent.
 */
export function resolveQuizPalette(storage: Storage): QuizPalette | null {
  const sectionBg: string[] = []
  const sectionTx: string[] = []
  const htmlColorful: string[] = []
  for (const page of storage.getPages()) {
    const sec = storage.getLatestNodeData("page-sectioning", page.pageId)?.data as
      | PageSectioningOutput
      | undefined
    if (sec && Array.isArray(sec.sections)) {
      for (const s of sec.sections) {
        const bg = normHex(s.backgroundColor)
        if (bg) sectionBg.push(bg)
        const tx = normHex(s.textColor)
        if (tx) sectionTx.push(tx)
      }
    }
    const wr = storage.getLatestNodeData("web-rendering", page.pageId)?.data as
      | { sections?: Array<{ html?: string }> }
      | undefined
    if (wr && Array.isArray(wr.sections)) {
      for (const s of wr.sections) htmlColorful.push(...colorCandidatesFromHtml(s.html ?? ""))
    }
  }
  const surface = mostFrequent(sectionBg) ?? DEFAULT_SURFACE
  const ink = mostFrequent(sectionTx) ?? DEFAULT_INK
  const sectionColorful = [...sectionBg, ...sectionTx].filter(
    (c) => c !== surface && isColorful(parseHex(c)!),
  )
  // Accent = the book's actual brand color (from rendered pages, then sections).
  // When none is found — e.g. two-column/template modes with no colored
  // rendering — return null so the quiz keeps the clean white default rather
  // than a generic blue tint.
  const accent = mostFrequent(htmlColorful) ?? mostFrequent(sectionColorful)
  if (!accent) return null
  return buildPalette(surface, ink, accent)
}
