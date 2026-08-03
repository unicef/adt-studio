/**
 * Approved reflowable body fonts.
 *
 * Reflowable render types (`llm`, `template`, `activity`) reconstruct text into
 * uniform, accessible typography rather than reproducing the PDF's (often
 * many) fonts. We pick ONE book-level base font from this vetted set, chosen
 * for legibility and broad Latin coverage. The book's detected category
 * (serif vs sans — see the extraction font profile) selects the default; a
 * book-level `reflowable_font` config setting can override to any approved id.
 *
 * Fixed-layout / overlay books are unaffected — they keep the original per-run
 * PDF fonts.
 */
import { cssQuoteFamily } from "./google-fonts.js"

export type FontCategory = "serif" | "sans" | "handwriting" | "mono"
/** Categories the extractor auto-detects from the PDF (drives the "auto"
 *  default). Handwriting/mono are explicit-only choices, never auto-selected. */
export type DetectedFontCategory = "serif" | "sans"

export interface ReflowableFont {
  /** Stable id used by the `reflowable_font` config setting. */
  id: string
  /** Google Fonts / CSS family display name. */
  family: string
  category: FontCategory
  /** Per-category default vs. selectable alternate. */
  role: "default" | "alternate"
  /** true → loaded from Google Fonts; false → bundled locally (Merriweather). */
  google: boolean
}

// Exactly one `role: "default"` per auto-detected category (serif, sans) — it's
// the font chosen for that category when the setting is "auto". Everything else
// is a selectable alternate. Handwriting/mono are alternates only.
export const REFLOWABLE_FONTS: readonly ReflowableFont[] = [
  // Sans-serif
  { id: "atkinson-hyperlegible", family: "Atkinson Hyperlegible", category: "sans", role: "default", google: true },
  { id: "lexend", family: "Lexend", category: "sans", role: "alternate", google: true },
  { id: "open-sans", family: "Open Sans", category: "sans", role: "alternate", google: true },
  { id: "roboto", family: "Roboto", category: "sans", role: "alternate", google: true },
  { id: "inter", family: "Inter", category: "sans", role: "alternate", google: true },
  { id: "noto-sans", family: "Noto Sans", category: "sans", role: "alternate", google: true },
  { id: "pt-sans", family: "PT Sans", category: "sans", role: "alternate", google: true },
  { id: "helvetica", family: "Helvetica", category: "sans", role: "alternate", google: false },
  // Serif
  { id: "merriweather", family: "Merriweather", category: "serif", role: "default", google: false },
  { id: "lora", family: "Lora", category: "serif", role: "alternate", google: true },
  { id: "noto-serif", family: "Noto Serif", category: "serif", role: "alternate", google: true },
  { id: "pt-serif", family: "PT Serif", category: "serif", role: "alternate", google: true },
  { id: "times-new-roman", family: "Times New Roman", category: "serif", role: "alternate", google: false },
  // Handwriting
  { id: "patrick-hand", family: "Patrick Hand", category: "handwriting", role: "alternate", google: true },
  { id: "edu-nsw-act-foundation", family: "Edu NSW ACT Foundation", category: "handwriting", role: "alternate", google: true },
  { id: "sassoon-primary", family: "Sassoon Primary", category: "handwriting", role: "alternate", google: false },
  // Monospace
  { id: "noto-sans-mono", family: "Noto Sans Mono", category: "mono", role: "alternate", google: true },
]

/** Valid values for the `reflowable_font` config setting. `auto` (or unset)
 *  uses the detected category's default. Keep in sync with REFLOWABLE_FONTS ids
 *  (guarded by a unit test). */
export const REFLOWABLE_FONT_SETTINGS = [
  "auto",
  "atkinson-hyperlegible",
  "lexend",
  "open-sans",
  "roboto",
  "inter",
  "noto-sans",
  "pt-sans",
  "helvetica",
  "merriweather",
  "lora",
  "noto-serif",
  "pt-serif",
  "times-new-roman",
  "patrick-hand",
  "edu-nsw-act-foundation",
  "sassoon-primary",
  "noto-sans-mono",
] as const
export type ReflowableFontSetting = (typeof REFLOWABLE_FONT_SETTINGS)[number]

// Strong serif/sans tokens found in real font names. mupdf's `isSerif()` is
// unreliable for embedded subset fonts (it reports HelveticaNeue / MyriadPro
// as serif), so name classification takes precedence over it in detection.
const SANS_NAME_RE =
  /(sans|grotesk|gothic|arial|helvet|myriad|verdana|tahoma|segoe|calibri|frutiger|franklin|futura|gill|avenir|proxima|gotham|circular|roboto|lato|montserrat|poppins|nunito|raleway|\binter\b|ubuntu|optima|univers|akzidenz|interstate|\bdin\b|trebuchet|century\s*gothic)/i
const SERIF_NAME_RE =
  /(serif|times|georgia|garamond|minion|baskerville|caslon|palatino|cambria|antiqua|didot|bodoni|merriweather|\blora\b|playfair|cardo|sabon|utopia|chaparral|freight|tinos|gelasio|caladea|\bgaramond\b)/i

/**
 * Classify a font by its name into serif / sans, or null when the name carries
 * no strong signal. Sans is checked first so "Century Gothic" resolves to sans.
 * Used by extraction to pick the book's reflowable category — preferred over
 * mupdf's `isSerif()`, which misflags many embedded sans fonts.
 */
export function classifyFontCategoryByName(name: string): DetectedFontCategory | null {
  if (!name) return null
  if (SANS_NAME_RE.test(name)) return "sans"
  if (SERIF_NAME_RE.test(name)) return "serif"
  return null
}

function defaultForCategory(category: DetectedFontCategory): ReflowableFont {
  // Non-null: serif and sans each have exactly one default in the table above.
  return REFLOWABLE_FONTS.find((f) => f.category === category && f.role === "default")!
}

/**
 * Resolve the reflowable body font: an explicit `setting` (other than `auto`)
 * wins — any approved id, including handwriting/mono; otherwise the detected
 * category's default, falling back to serif (Merriweather) when unknown.
 */
export function resolveReflowableFont(
  setting: string | undefined,
  detected: DetectedFontCategory | null,
): ReflowableFont {
  if (setting && setting !== "auto") {
    const explicit = REFLOWABLE_FONTS.find((f) => f.id === setting)
    if (explicit) return explicit
  }
  return defaultForCategory(detected ?? "serif")
}

/** Generic CSS family terminator for a category. */
function genericForCategory(category: FontCategory): string {
  switch (category) {
    case "serif":
      return "serif"
    case "mono":
      return "monospace"
    case "handwriting":
      return "cursive"
    default:
      return "sans-serif"
  }
}

/**
 * CSS font-family chain for a reflowable font: the family, then a legible
 * fallback. For serif/sans we insert the always-bundled Merriweather (a
 * readable match while the webfont loads / if it fails); for handwriting and
 * monospace the category generic is the better, mismatch-free fallback.
 */
export function reflowableFontFamilyChain(font: ReflowableFont): string {
  const fam = cssQuoteFamily(font.family)
  const generic = genericForCategory(font.category)
  if (font.family === "Merriweather") return `${fam},${generic}`
  return font.category === "serif" || font.category === "sans"
    ? `${fam},'Merriweather',${generic}`
    : `${fam},${generic}`
}

/**
 * The reflowable base-font CSS chain for a book, or null when no override is
 * needed — fixed-layout books keep their original per-run fonts, and the serif
 * default (Merriweather) is already the global body font. Single source of
 * truth shared by packaging, the preview route, and the storyboard preview, so
 * they can't drift.
 */
export function reflowableFontChain(
  category: DetectedFontCategory | null,
  opts: { fixedLayout?: boolean; reflowableFont?: string },
): string | null {
  if (opts.fixedLayout) return null
  const font = resolveReflowableFont(opts.reflowableFont, category)
  if (font.family === "Merriweather") return null
  return reflowableFontFamilyChain(font)
}
